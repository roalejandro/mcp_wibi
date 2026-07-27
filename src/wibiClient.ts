import { XMLParser } from "fast-xml-parser";
import type { ConnectionConfig, StdioAuthConfig, WibiConfig } from "./config.js";

const AUTH_TIMEOUT_MS = 15_000;
const REQUEST_TIMEOUT_MS = 30_000;
const REFRESH_SKEW_MS = 60_000;

export interface TokenBundle {
  accessToken: string;
  refreshToken?: string;
  expiresAtMs: number;
}

export type TokenRefresher = (refreshToken: string) => Promise<TokenBundle>;

/**
 * Cliente HTTP del API WIBI.
 *
 * Modos:
 *  - stdio: autentica con usuario/clave vía XML /onzecrm/token
 *  - OAuth/sesión: se construye con un TokenBundle ya emitido + refresher opcional
 */
export class WibiClient {
  private token: string | null = null;
  private refreshToken: string | null = null;
  private tokenExpiryMs = 0;
  private refreshPromise: Promise<void> | null = null;
  private readonly xml = new XMLParser({ ignoreAttributes: true, trimValues: true });
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly stdioAuth?: StdioAuthConfig;
  private readonly refresher?: TokenRefresher;
  private readonly fixedDefaultCampania?: number;

  constructor(
    cfg: WibiConfig | (ConnectionConfig & { defaultCampania?: number }),
    options?: {
      session?: TokenBundle;
      refresher?: TokenRefresher;
    }
  ) {
    this.baseUrl = cfg.baseUrl.replace(/\/+$/, "");
    this.apiKey = cfg.apiKey;
    this.timeoutMs = "timeoutMs" in cfg && cfg.timeoutMs ? cfg.timeoutMs : REQUEST_TIMEOUT_MS;
    this.fixedDefaultCampania = cfg.defaultCampania;

    if ("user" in cfg && cfg.user) {
      this.stdioAuth = {
        user: cfg.user,
        pass: cfg.pass,
        defaultCampania: cfg.defaultCampania,
      };
    }

    if (options?.session) {
      this.applyBundle(options.session);
    }
    this.refresher = options?.refresher;
  }

  get defaultCampania(): number | undefined {
    return this.fixedDefaultCampania ?? this.stdioAuth?.defaultCampania;
  }

  /** Actualiza tokens de sesión (p. ej. tras un refresh OAuth externo). */
  setSession(bundle: TokenBundle): void {
    this.applyBundle(bundle);
  }

  private applyBundle(bundle: TokenBundle): void {
    this.token = bundle.accessToken;
    this.refreshToken = bundle.refreshToken ?? null;
    this.tokenExpiryMs = bundle.expiresAtMs;
  }

  private buildAuthXml(user: string, pass: string): string {
    const esc = (s: string) =>
      s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return (
      '<?xml version="1.0" encoding="utf-8"?>' +
      "<MensajeFidelyGb><auth>" +
      `<user>${esc(user)}</user>` +
      `<pass>${esc(pass)}</pass>` +
      "</auth></MensajeFidelyGb>"
    );
  }

  private fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
  }

  private async authenticateStdio(): Promise<void> {
    if (!this.stdioAuth) {
      throw new Error("Sesión WIBI no disponible: falta autenticación");
    }

    const res = await this.fetchWithTimeout(
      `${this.baseUrl}/onzecrm/token`,
      {
        method: "POST",
        headers: {
          "api-key": this.apiKey,
          "Content-Type": "application/xml",
        },
        body: this.buildAuthXml(this.stdioAuth.user, this.stdioAuth.pass),
      },
      AUTH_TIMEOUT_MS
    );

    const text = await res.text();
    const parsed = this.xml.parse(text);
    const respuesta = parsed?.RespuestaFidelyGb ?? {};
    const respCode = String(respuesta?.RespCode ?? "1");

    if (respCode !== "0" || !respuesta?.auth?.token) {
      const msg = respuesta?.RespMsg || `HTTP ${res.status}`;
      throw new Error(`Autenticación WIBI fallida: ${msg}`);
    }

    this.token = String(respuesta.auth.token);
    this.tokenExpiryMs = Date.now() + 8 * 60 * 1000;
  }

  private async refreshSession(): Promise<void> {
    if (!this.refreshToken || !this.refresher) {
      if (this.stdioAuth) {
        await this.authenticateStdio();
        return;
      }
      throw new Error("Sesión WIBI expirada. Volvé a iniciar sesión.");
    }

    const bundle = await this.refresher(this.refreshToken);
    this.applyBundle(bundle);
  }

  private async ensureToken(): Promise<string> {
    const needsRefresh =
      !this.token || Date.now() >= this.tokenExpiryMs - REFRESH_SKEW_MS;

    if (!needsRefresh) {
      return this.token as string;
    }

    if (!this.refreshPromise) {
      this.refreshPromise = (async () => {
        try {
          if (this.refreshToken && this.refresher) {
            await this.refreshSession();
          } else if (this.stdioAuth) {
            await this.authenticateStdio();
          } else {
            throw new Error("Sesión WIBI expirada. Volvé a iniciar sesión.");
          }
        } finally {
          this.refreshPromise = null;
        }
      })();
    }

    await this.refreshPromise;
    return this.token as string;
  }

  private async request<T>(
    method: "GET" | "POST",
    path: string,
    options: { query?: Record<string, unknown>; body?: unknown } = {},
    isRetry = false
  ): Promise<T> {
    const token = await this.ensureToken();

    const url = new URL(`${this.baseUrl}/onzecrm/v2/${path.replace(/^\//, "")}`);
    if (options.query) {
      for (const [key, value] of Object.entries(options.query)) {
        if (value !== undefined && value !== null && value !== "") {
          url.searchParams.set(key, String(value));
        }
      }
    }

    const res = await this.fetchWithTimeout(
      url.toString(),
      {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          "api-key": this.apiKey,
          Accept: "application/json",
          ...(options.body ? { "Content-Type": "application/json" } : {}),
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
      },
      this.timeoutMs
    );

    if (res.status === 401 && !isRetry) {
      this.token = null;
      this.tokenExpiryMs = 0;
      return this.request<T>(method, path, options, true);
    }

    const raw = await res.text();
    let payload: unknown;
    try {
      payload = raw ? JSON.parse(raw) : {};
    } catch {
      throw new Error(`Respuesta no-JSON del API WIBI (HTTP ${res.status}): ${raw.slice(0, 300)}`);
    }

    const obj = payload as Record<string, unknown>;
    if (obj?.success === false) {
      throw new Error((obj.error as string) || `Error API WIBI (HTTP ${res.status})`);
    }
    if (!res.ok) {
      throw new Error(`Error API WIBI (HTTP ${res.status})`);
    }

    return (obj?.data ?? obj) as T;
  }

  get<T = unknown>(path: string, query?: Record<string, unknown>): Promise<T> {
    return this.request<T>("GET", path, { query });
  }

  post<T = unknown>(path: string, body?: unknown, query?: Record<string, unknown>): Promise<T> {
    return this.request<T>("POST", path, { body, query });
  }
}
