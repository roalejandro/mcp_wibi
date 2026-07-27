/**
 * Autenticación de comercios contra la API v2 de WIBI (JSON).
 *
 * POST /onzecrm/v2/auth/login  { user, pass } + header api-key
 *   → access_token (JWT), refresh_token, comercio, campanias
 *
 * POST /onzecrm/v2/auth/refresh { refresh_token } + header api-key
 */

import type { ConnectionConfig } from "./config.js";
import type { TokenBundle } from "./wibiClient.js";

export interface CampaniaInfo {
  idCampania: number;
  nombre: string;
}

export interface WibiSession {
  wibiToken: string;
  refreshToken: string;
  tokenExpiryMs: number;
  idComercio: number;
  nombreComercio: string;
  idRed: number;
  campanias: CampaniaInfo[];
  defaultCampania?: number;
}

export type SignInResult =
  | { kind: "ok"; session: WibiSession }
  | { kind: "error"; message: string };

export class WibiAuthService {
  constructor(private readonly conn: ConnectionConfig) {}

  async signInWithCredentials(user: string, pass: string): Promise<SignInResult> {
    return this.postJson("/onzecrm/v2/auth/login", {
      user: user.trim(),
      pass,
    });
  }

  async refresh(refreshToken: string): Promise<SignInResult> {
    return this.postJson("/onzecrm/v2/auth/refresh", {
      refresh_token: refreshToken,
    });
  }

  async revoke(refreshToken: string): Promise<void> {
    try {
      await this.postJson("/onzecrm/v2/auth/revoke", {
        refresh_token: refreshToken,
      });
    } catch {
      // best-effort
    }
  }

  toTokenBundle(session: WibiSession): TokenBundle {
    return {
      accessToken: session.wibiToken,
      refreshToken: session.refreshToken,
      expiresAtMs: session.tokenExpiryMs,
    };
  }

  private async postJson(
    path: string,
    body: Record<string, string>
  ): Promise<SignInResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.conn.timeoutMs);

    let response: Response;
    try {
      response = await fetch(`${this.conn.baseUrl}${path}`, {
        method: "POST",
        headers: {
          "api-key": this.conn.apiKey,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      const msg =
        (err as Error)?.name === "AbortError"
          ? "Timeout al contactar WIBI"
          : "No se pudo contactar WIBI";
      return { kind: "error", message: msg };
    } finally {
      clearTimeout(timeout);
    }

    const text = await response.text();
    let data: any = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }

    if (!response.ok || data?.success === false) {
      const message =
        data?.error || data?.message || "Credenciales inválidas o sin acceso.";
      return { kind: "error", message: String(message) };
    }

    const payload = data?.data ?? data;
    const accessToken: string | undefined = payload?.access_token;
    const refreshToken: string | undefined = payload?.refresh_token;
    if (!accessToken || !refreshToken) {
      return {
        kind: "error",
        message: "La respuesta de login no incluyó access_token/refresh_token.",
      };
    }

    const comercio = payload?.comercio ?? {};
    const idComercio = Number(comercio.idComercio ?? 0);
    const idRed = Number(comercio.idRed ?? 0);
    if (!idComercio || !idRed) {
      return { kind: "error", message: "La respuesta de login no incluye comercio/red." };
    }

    const campanias: CampaniaInfo[] = Array.isArray(payload?.campanias)
      ? payload.campanias.map((c: any) => ({
          idCampania: Number(c.idCampania),
          nombre: String(c.nombre ?? ""),
        }))
      : [];

    const expiresIn = Number(payload?.expires_in ?? 600);
    const tokenExpiryMs = Date.now() + Math.max(60, expiresIn) * 1000;

    return {
      kind: "ok",
      session: {
        wibiToken: accessToken,
        refreshToken,
        tokenExpiryMs,
        idComercio,
        nombreComercio: String(comercio.nombre ?? "Comercio"),
        idRed,
        campanias,
        defaultCampania: campanias.length === 1 ? campanias[0].idCampania : undefined,
      },
    };
  }
}
