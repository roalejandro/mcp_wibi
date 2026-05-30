import { XMLParser } from "fast-xml-parser";
import type { WibiConfig } from "./config.js";

const AUTH_TIMEOUT_MS = 15_000;
const REQUEST_TIMEOUT_MS = 30_000;

/**
 * Cliente HTTP del API WIBI.
 *
 * - Autentica el comercio en POST /onzecrm/token (XML) y cachea el JWT.
 * - Reusa la misma api-key en cada llamada (el middleware valida que el
 *   claim `apn` del token coincida con el appname de la api-key).
 * - Consume el API v2 JSON en /onzecrm/v2/* con Bearer + api-key.
 * - Reintenta una vez ante expiración/invalidez del token (solo 401).
 */
export class WibiClient {
  private token: string | null = null;
  private tokenExpiryMs = 0;
  private readonly xml = new XMLParser({ ignoreAttributes: true, trimValues: true });

  constructor(private readonly cfg: WibiConfig) {}

  /** Resuelve la campaña por defecto configurada (si existe). */
  get defaultCampania(): number | undefined {
    return this.cfg.defaultCampania;
  }

  private buildAuthXml(): string {
    const esc = (s: string) =>
      s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return (
      '<?xml version="1.0" encoding="utf-8"?>' +
      "<MensajeFidelyGb><auth>" +
      `<user>${esc(this.cfg.user)}</user>` +
      `<pass>${esc(this.cfg.pass)}</pass>` +
      "</auth></MensajeFidelyGb>"
    );
  }

  private fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    return fetch(url, { ...init, signal: controller.signal }).finally(() =>
      clearTimeout(timer)
    );
  }

  /** Obtiene (o renueva) el JWT del comercio. */
  private async authenticate(): Promise<void> {
    const res = await this.fetchWithTimeout(
      `${this.cfg.baseUrl}/onzecrm/token`,
      {
        method: "POST",
        headers: {
          "api-key": this.cfg.apiKey,
          "Content-Type": "application/xml",
        },
        body: this.buildAuthXml(),
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

  private async ensureToken(): Promise<string> {
    if (!this.token || Date.now() >= this.tokenExpiryMs) {
      await this.authenticate();
    }
    return this.token as string;
  }

  /**
   * Realiza una llamada al API v2. Reintenta una vez si el token expiró (401).
   */
  private async request<T>(
    method: "GET" | "POST",
    path: string,
    options: { query?: Record<string, unknown>; body?: unknown } = {},
    isRetry = false
  ): Promise<T> {
    const token = await this.ensureToken();

    const url = new URL(`${this.cfg.baseUrl}/onzecrm/v2/${path.replace(/^\//, "")}`);
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
          "api-key": this.cfg.apiKey,
          Accept: "application/json",
          ...(options.body ? { "Content-Type": "application/json" } : {}),
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
      },
      REQUEST_TIMEOUT_MS
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
