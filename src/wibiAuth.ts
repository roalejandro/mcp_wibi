/**
 * Autenticación contra la API v2 de WIBI (JSON).
 *
 * Soporta:
 *  - login de comercio → tokens + comercio
 *  - login de admin panel → needs_otp (2FA) y/o needs_selection (campaña/comercio)
 *  - cambio de alcance (campaña/comercio) dentro de una sesión MCP admin ya activa
 *
 * POST /onzecrm/v2/auth/login
 * POST /onzecrm/v2/auth/verify-otp
 * POST /onzecrm/v2/auth/resend-otp
 * POST /onzecrm/v2/auth/scoped-comercios
 * POST /onzecrm/v2/auth/select-scope
 * POST /onzecrm/v2/auth/refresh
 * POST /onzecrm/v2/auth/revoke
 * POST /onzecrm/v2/auth/my-scoped-comercios (Bearer)
 * POST /onzecrm/v2/auth/switch-scope        (Bearer)
 */

import type { ConnectionConfig } from "./config.js";
import type { TokenBundle } from "./wibiClient.js";

export interface CampaniaInfo {
  idCampania: number;
  nombre: string;
}

export interface ComercioInfo {
  idComercio: number;
  nombre: string;
  idRed: number;
}

export interface ActorInfo {
  tipo: string;
  idUsuario: number;
  nombre: string;
  rol: string;
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
  actor?: ActorInfo;
}

export type SignInResult =
  | { kind: "ok"; session: WibiSession }
  | { kind: "needs_otp"; otpPendingId: string; message: string }
  | {
      kind: "needs_selection";
      pendingId: string;
      campanias: CampaniaInfo[];
      actor?: ActorInfo;
    }
  | { kind: "error"; message: string };

export type ApiResult<T> =
  | { kind: "ok"; data: T }
  | { kind: "error"; message: string };

export class WibiAuthService {
  constructor(private readonly conn: ConnectionConfig) {}

  async signInWithCredentials(user: string, pass: string): Promise<SignInResult> {
    return this.parseAuthResponse(
      await this.requestJson("/onzecrm/v2/auth/login", {
        user: user.trim(),
        pass,
      })
    );
  }

  async verifyOtp(otpPendingId: string, codigo: string): Promise<SignInResult> {
    return this.parseAuthResponse(
      await this.requestJson("/onzecrm/v2/auth/verify-otp", {
        otp_pending_id: otpPendingId,
        codigo: codigo.trim(),
      })
    );
  }

  async resendOtp(otpPendingId: string): Promise<ApiResult<{ message: string }>> {
    const result = await this.requestJson("/onzecrm/v2/auth/resend-otp", {
      otp_pending_id: otpPendingId,
    });
    if (result.kind === "error") return result;
    const payload = result.data;
    return {
      kind: "ok",
      data: {
        message: String(payload?.message ?? "Te reenviamos un código de verificación a tu email"),
      },
    };
  }

  async listScopedComercios(
    pendingId: string,
    idCampania: number
  ): Promise<ApiResult<{ comercios: ComercioInfo[] }>> {
    const result = await this.requestJson("/onzecrm/v2/auth/scoped-comercios", {
      pending_id: pendingId,
      idCampania,
    });
    if (result.kind === "error") return result;
    const comercios: ComercioInfo[] = Array.isArray(result.data?.comercios)
      ? result.data.comercios.map((c: any) => ({
          idComercio: Number(c.idComercio),
          nombre: String(c.nombre ?? ""),
          idRed: Number(c.idRed ?? 0),
        }))
      : [];
    return { kind: "ok", data: { comercios } };
  }

  async selectScope(
    pendingId: string,
    idCampania: number,
    idComercio: number
  ): Promise<SignInResult> {
    return this.parseAuthResponse(
      await this.requestJson("/onzecrm/v2/auth/select-scope", {
        pending_id: pendingId,
        idCampania,
        idComercio,
      })
    );
  }

  async refresh(refreshToken: string): Promise<SignInResult> {
    return this.parseAuthResponse(
      await this.requestJson("/onzecrm/v2/auth/refresh", {
        refresh_token: refreshToken,
      })
    );
  }

  async revoke(refreshToken: string): Promise<void> {
    try {
      await this.requestJson("/onzecrm/v2/auth/revoke", {
        refresh_token: refreshToken,
      });
    } catch {
      // best-effort
    }
  }

  /**
   * Lista los comercios de una campaña dentro del alcance del actor real de una sesión
   * MCP ya autenticada (requiere que el login original haya sido de un admin, no de comercio).
   */
  async myScopedComercios(
    accessToken: string,
    idCampania: number
  ): Promise<ApiResult<{ comercios: ComercioInfo[] }>> {
    const result = await this.requestJson(
      "/onzecrm/v2/auth/my-scoped-comercios",
      { idCampania },
      accessToken
    );
    if (result.kind === "error") return result;
    const comercios: ComercioInfo[] = Array.isArray(result.data?.comercios)
      ? result.data.comercios.map((c: any) => ({
          idComercio: Number(c.idComercio),
          nombre: String(c.nombre ?? ""),
          idRed: Number(c.idRed ?? 0),
        }))
      : [];
    return { kind: "ok", data: { comercios } };
  }

  /**
   * Cambia el comercio/campaña activos de una sesión MCP admin ya autenticada, sin
   * volver a pedir credenciales ni 2FA. Devuelve un nuevo TokenBundle + comercio + campanias.
   */
  async switchScope(
    accessToken: string,
    idCampania: number,
    idComercio: number
  ): Promise<SignInResult> {
    return this.parseAuthResponse(
      await this.requestJson(
        "/onzecrm/v2/auth/switch-scope",
        { idCampania, idComercio },
        accessToken
      )
    );
  }

  toTokenBundle(session: WibiSession): TokenBundle {
    return {
      accessToken: session.wibiToken,
      refreshToken: session.refreshToken,
      expiresAtMs: session.tokenExpiryMs,
    };
  }

  private parseAuthResponse(
    result: ApiResult<Record<string, any>>
  ): SignInResult {
    if (result.kind === "error") {
      return { kind: "error", message: result.message };
    }

    const payload = result.data;

    if (payload?.needs_otp) {
      const otpPendingId = String(payload.otp_pending_id ?? "");
      if (!otpPendingId) {
        return { kind: "error", message: "Respuesta OTP incompleta." };
      }
      return {
        kind: "needs_otp",
        otpPendingId,
        message: String(payload.message ?? "Te enviamos un código de verificación a tu email"),
      };
    }

    if (payload?.needs_selection) {
      const pendingId = String(payload.pending_id ?? "");
      if (!pendingId) {
        return { kind: "error", message: "Respuesta de selección incompleta." };
      }
      const campanias = this.mapCampanias(payload.campanias);
      const actor = this.mapActor(payload.actor);
      return {
        kind: "needs_selection",
        pendingId,
        campanias,
        actor,
      };
    }

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

    const campanias = this.mapCampanias(payload?.campanias);
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
        actor: this.mapActor(payload?.actor),
      },
    };
  }

  private mapCampanias(raw: unknown): CampaniaInfo[] {
    if (!Array.isArray(raw)) return [];
    return raw.map((c: any) => ({
      idCampania: Number(c.idCampania),
      nombre: String(c.nombre ?? ""),
    }));
  }

  private mapActor(raw: unknown): ActorInfo | undefined {
    if (!raw || typeof raw !== "object") return undefined;
    const a = raw as Record<string, unknown>;
    const idUsuario = Number(a.idUsuario ?? 0);
    if (!idUsuario) return undefined;
    return {
      tipo: String(a.tipo ?? "usuario"),
      idUsuario,
      nombre: String(a.nombre ?? ""),
      rol: String(a.rol ?? ""),
    };
  }

  private async requestJson(
    path: string,
    body: Record<string, string | number>,
    accessToken?: string
  ): Promise<ApiResult<Record<string, any>>> {
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
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
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

    return { kind: "ok", data: data?.data ?? data ?? {} };
  }
}
