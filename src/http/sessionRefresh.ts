import type { SignInResult, WibiSession } from "../wibiAuth.js";
import { isInvalidRefreshMessage, WibiSessionExpiredError } from "../sessionErrors.js";
import { logSessionEvent } from "./sessionLog.js";

const REFRESH_SKEW_MS = 60_000;

export interface SessionRefreshStore {
  getSession(sessionId: string): Promise<WibiSession | undefined>;
  updateSession(sessionId: string, session: WibiSession): Promise<void>;
  revokeSession(sessionId: string): Promise<void>;
}

/**
 * Un solo refresh WIBI en vuelo por sessionId.
 * El despliegue actual es una sola réplica de Node, así que el candado vive en memoria.
 */
export class WibiSessionCoordinator {
  private readonly inflight = new Map<string, Promise<WibiSession>>();

  constructor(
    private readonly store: SessionRefreshStore,
    private readonly refreshWithWibi: (refreshToken: string) => Promise<SignInResult>
  ) {}

  refresh(sessionId: string): Promise<WibiSession> {
    const existing = this.inflight.get(sessionId);
    if (existing) {
      logSessionEvent(sessionId, "single-flight", "joined");
      return existing;
    }

    const job = this.run(sessionId).finally(() => {
      if (this.inflight.get(sessionId) === job) this.inflight.delete(sessionId);
    });
    this.inflight.set(sessionId, job);
    return job;
  }

  private async run(sessionId: string): Promise<WibiSession> {
    const initial = await this.store.getSession(sessionId);
    if (!initial?.refreshToken) {
      await this.invalidate(sessionId);
      throw new WibiSessionExpiredError();
    }
    if (isFresh(initial)) {
      logSessionEvent(sessionId, "rotate", "already-fresh");
      return initial;
    }

    const first = await this.tryRefresh(sessionId, initial);
    if (first.ok) return first.session;
    if (!first.invalid) throw new Error(first.message);

    const latest = await this.store.getSession(sessionId);
    if (latest?.refreshToken && latest.refreshToken !== initial.refreshToken) {
      if (isFresh(latest)) {
        logSessionEvent(sessionId, "retry", "already-fresh");
        return latest;
      }
      logSessionEvent(sessionId, "retry", "refresh-changed");
      const second = await this.tryRefresh(sessionId, latest);
      if (second.ok) return second.session;
      if (!second.invalid) throw new Error(second.message);
    }

    await this.invalidate(sessionId);
    throw new WibiSessionExpiredError();
  }

  private async tryRefresh(
    sessionId: string,
    current: WibiSession
  ): Promise<
    | { ok: true; session: WibiSession }
    | { ok: false; invalid: boolean; message: string }
  > {
    const result = await this.refreshWithWibi(current.refreshToken);
    if (result.kind !== "ok") {
      const message = result.kind === "error"
        ? result.message
        : "No se pudo renovar la sesión WIBI.";
      const invalid = result.kind === "error" && isInvalidRefreshMessage(message);
      logSessionEvent(sessionId, "rotate", invalid ? "rejected" : "transient");
      return { ok: false, invalid, message };
    }

    const merged = mergeRefreshedSession(current, result.session);
    await this.store.updateSession(sessionId, merged);
    logSessionEvent(sessionId, "rotate", "ok");
    return { ok: true, session: merged };
  }

  private async invalidate(sessionId: string): Promise<void> {
    await this.store.revokeSession(sessionId);
    logSessionEvent(sessionId, "invalidate", "ok");
  }
}

function isFresh(session: WibiSession): boolean {
  return Date.now() < session.tokenExpiryMs - REFRESH_SKEW_MS;
}

export function mergeRefreshedSession(current: WibiSession, refreshed: WibiSession): WibiSession {
  return {
    ...current,
    ...refreshed,
    scopeMode: refreshed.scopeMode ?? current.scopeMode,
    permisos: refreshed.permisos ?? current.permisos,
    preferredIdComercio: refreshed.preferredIdComercio ?? current.preferredIdComercio,
    defaultCampania: refreshed.defaultCampania ?? current.defaultCampania,
    actor: refreshed.actor ?? current.actor,
  };
}
