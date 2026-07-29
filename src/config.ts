/**
 * Configuración del Gateway.
 *
 * Dos modos:
 *  - stdio: credenciales fijas WIBI_USER/WIBI_PASS (desarrollo local).
 *  - http : OAuth 2.1 multi-tenant. Cada comercio inicia sesión con su usuario/clave.
 *           No se usan WIBI_USER / WIBI_PASS / MCP_HTTP_TOKEN.
 */

export interface ConnectionConfig {
  baseUrl: string;
  apiKey: string;
  timeoutMs: number;
}

export interface StdioAuthConfig {
  user: string;
  pass: string;
  defaultCampania?: number;
}

export interface WibiConfig extends ConnectionConfig, StdioAuthConfig {}

export type TransportMode = "stdio" | "http";

export interface HttpConfig {
  port: number;
  host: string;
  publicUrl: string;
  accessTokenTtl: number;
  trustProxy: boolean | number | string;
}

export type OauthStoreMode = "memory" | "redis";

export interface OauthStoreConfig {
  mode: OauthStoreMode;
  redisUrl?: string;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    console.error(`ERROR: falta la variable de entorno ${name}`);
    process.exit(1);
  }
  return value.trim();
}

function readTimeout(): number {
  const raw = process.env.WIBI_TIMEOUT_MS;
  const ms = raw ? Number.parseInt(raw, 10) : 30_000;
  return Number.isInteger(ms) && ms > 0 ? ms : 30_000;
}

export function loadConnectionConfig(): ConnectionConfig {
  return {
    baseUrl: (process.env.WIBI_BASE_URL || "https://apiv2.wibi.com.ar").replace(/\/+$/, ""),
    apiKey: requireEnv("WIBI_API_KEY"),
    timeoutMs: readTimeout(),
  };
}

/** Credenciales de servicio para modo stdio. */
export function loadStdioAuth(): StdioAuthConfig {
  const defaultCampania = process.env.WIBI_DEFAULT_CAMPANIA
    ? Number(process.env.WIBI_DEFAULT_CAMPANIA)
    : undefined;

  return {
    user: requireEnv("WIBI_USER"),
    pass: requireEnv("WIBI_PASS"),
    defaultCampania:
      defaultCampania && !Number.isNaN(defaultCampania) ? defaultCampania : undefined,
  };
}

/** Compatibilidad con el código previo de stdio. */
export function loadConfig(): WibiConfig {
  return { ...loadConnectionConfig(), ...loadStdioAuth() };
}

export function resolveTransport(argv: string[]): TransportMode {
  if (argv.includes("--http")) return "http";
  if (argv.includes("--stdio")) return "stdio";
  const flag = argv.find((a) => a.startsWith("--transport="));
  if (flag) {
    const value = flag.split("=")[1];
    if (value === "http" || value === "stdio") return value;
  }
  const env = (process.env.MCP_TRANSPORT || process.env.WIBI_TRANSPORT || "stdio").toLowerCase();
  if (env === "http" || env === "stdio") return env;
  return "stdio";
}

export function loadHttpConfig(): HttpConfig {
  const publicUrl = requireEnv("WIBI_PUBLIC_URL").replace(/\/+$/, "");
  if (!publicUrl.startsWith("http://") && !publicUrl.startsWith("https://")) {
    console.error(`ERROR: WIBI_PUBLIC_URL debe ser una URL http(s) absoluta, recibido: "${publicUrl}"`);
    process.exit(1);
  }

  const portRaw = process.env.WIBI_HTTP_PORT || process.env.MCP_HTTP_PORT || "3939";
  const port = Number.parseInt(portRaw, 10);

  const ttlRaw = process.env.WIBI_ACCESS_TOKEN_TTL;
  const accessTokenTtl = ttlRaw ? Number.parseInt(ttlRaw, 10) : 3600;

  return {
    port: Number.isInteger(port) && port > 0 && port <= 65535 ? port : 3939,
    host: process.env.WIBI_HTTP_HOST?.trim() || "0.0.0.0",
    publicUrl,
    accessTokenTtl:
      Number.isInteger(accessTokenTtl) && accessTokenTtl > 0 ? accessTokenTtl : 3600,
    trustProxy: parseTrustProxy(process.env.WIBI_TRUST_PROXY),
  };
}

function parseTrustProxy(raw: string | undefined): boolean | number | string {
  if (raw === undefined || raw.trim() === "") return 1;
  const value = raw.trim();
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^\d+$/.test(value)) return Number.parseInt(value, 10);
  return value;
}

/**
 * Store OAuth: memory (dev local) o redis (producción / Docker).
 * En modo redis falla al arrancar si falta REDIS_URL (fail-fast, sin fallback).
 */
export function loadOauthStoreConfig(): OauthStoreConfig {
  const raw = (process.env.OAUTH_STORE || "memory").trim().toLowerCase();
  if (raw !== "memory" && raw !== "redis") {
    console.error(`ERROR: OAUTH_STORE debe ser "memory" o "redis", recibido: "${raw}"`);
    process.exit(1);
  }

  if (raw === "memory") {
    return { mode: "memory" };
  }

  const redisUrl = process.env.REDIS_URL?.trim();
  if (!redisUrl) {
    console.error("ERROR: OAUTH_STORE=redis requiere REDIS_URL");
    process.exit(1);
  }

  return { mode: "redis", redisUrl };
}
