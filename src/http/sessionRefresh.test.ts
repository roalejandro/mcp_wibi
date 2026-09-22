import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { WibiSession } from "../wibiAuth.js";
import { WibiSessionExpiredError } from "../sessionErrors.js";
import { errorResult } from "../tools/helpers.js";
import { WibiSessionCoordinator, type SessionRefreshStore } from "./sessionRefresh.js";

function session(overrides: Partial<WibiSession> = {}): WibiSession {
  return {
    wibiToken: "jwt-1",
    refreshToken: "R0",
    tokenExpiryMs: Date.now() - 1_000,
    idComercio: 10,
    nombreComercio: "Test",
    idRed: 1,
    campanias: [],
    ...overrides,
  };
}

function memoryStore(): SessionRefreshStore & { sessions: Map<string, WibiSession> } {
  const sessions = new Map<string, WibiSession>();
  return {
    sessions,
    getSession: async (sessionId) => sessions.get(sessionId),
    updateSession: async (sessionId, next) => {
      sessions.set(sessionId, next);
    },
    revokeSession: async (sessionId) => {
      sessions.delete(sessionId);
    },
  };
}

describe("WibiSessionCoordinator", () => {
  it("dos refresh concurrentes hacen una sola llamada a WIBI", async () => {
    const store = memoryStore();
    const sessionId = randomUUID();
    store.sessions.set(sessionId, session());
    let calls = 0;
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const coordinator = new WibiSessionCoordinator(store, async () => {
      calls += 1;
      await gate;
      return {
        kind: "ok",
        session: session({ wibiToken: "jwt-2", refreshToken: "R1", tokenExpiryMs: Date.now() + 600_000 }),
      };
    });

    const first = coordinator.refresh(sessionId);
    const second = coordinator.refresh(sessionId);
    release();
    const [a, b] = await Promise.all([first, second]);

    assert.equal(calls, 1);
    assert.equal(a.refreshToken, "R1");
    assert.equal(b.refreshToken, "R1");
    assert.equal(store.sessions.get(sessionId)?.refreshToken, "R1");
  });

  it("si otro transporte dejó un JWT vigente, no vuelve a rotar", async () => {
    const store = memoryStore();
    const sessionId = randomUUID();
    store.sessions.set(sessionId, session({ refreshToken: "R0" }));
    let calls = 0;
    const coordinator = new WibiSessionCoordinator(store, async (refreshToken) => {
      calls += 1;
      assert.equal(refreshToken, "R0");
      const fresh = session({
        wibiToken: "jwt-otro",
        refreshToken: "R1",
        tokenExpiryMs: Date.now() + 600_000,
      });
      await store.updateSession(sessionId, fresh);
      return { kind: "error", message: "Refresh token inválido o expirado" };
    });

    const refreshed = await coordinator.refresh(sessionId);
    assert.equal(calls, 1);
    assert.equal(refreshed.refreshToken, "R1");
    assert.equal(store.sessions.get(sessionId)?.wibiToken, "jwt-otro");
  });

  it("reintenta una vez cuando el refresh guardado cambió y sigue vencido", async () => {
    const store = memoryStore();
    const sessionId = randomUUID();
    store.sessions.set(sessionId, session({ refreshToken: "R0" }));
    const seen: string[] = [];
    const coordinator = new WibiSessionCoordinator(store, async (refreshToken) => {
      seen.push(refreshToken);
      if (refreshToken === "R0") {
        await store.updateSession(sessionId, session({ refreshToken: "R1", wibiToken: "jwt-medio" }));
        return { kind: "error", message: "Refresh token inválido o expirado" };
      }
      return {
        kind: "ok",
        session: session({
          refreshToken: "R2",
          wibiToken: "jwt-final",
          tokenExpiryMs: Date.now() + 600_000,
        }),
      };
    });

    const refreshed = await coordinator.refresh(sessionId);
    assert.deepEqual(seen, ["R0", "R1"]);
    assert.equal(refreshed.refreshToken, "R2");
  });

  it("un rechazo definitivo invalida la sesión OAuth", async () => {
    const store = memoryStore();
    const sessionId = randomUUID();
    store.sessions.set(sessionId, session());
    const coordinator = new WibiSessionCoordinator(store, async () => ({
      kind: "error",
      message: "Refresh token inválido o expirado",
    }));

    await assert.rejects(() => coordinator.refresh(sessionId), WibiSessionExpiredError);
    assert.equal(store.sessions.get(sessionId), undefined);
  });

  it("un corte de red no invalida la sesión", async () => {
    const store = memoryStore();
    const sessionId = randomUUID();
    store.sessions.set(sessionId, session());
    const coordinator = new WibiSessionCoordinator(store, async () => ({
      kind: "error",
      message: "No se pudo contactar WIBI",
    }));

    await assert.rejects(() => coordinator.refresh(sessionId), /contactar WIBI/);
    assert.equal(store.sessions.get(sessionId)?.refreshToken, "R0");
  });

  it("errorResult no convierte la sesión muerta en un resultado de tool", () => {
    assert.throws(
      () => errorResult(new WibiSessionExpiredError()),
      WibiSessionExpiredError
    );
  });
});
