/**
 * Persistencia durable del estado OAuth (clients DCR, access/refresh + WibiSession).
 * Memoria para desarrollo; Redis para producción (sobrevive recreate del contenedor).
 */

import { createClient, type RedisClientType } from "redis";
import type { OAuthClientInformationFull } from "@modelcontextprotocol/sdk/shared/auth.js";
import type { WibiSession } from "../wibiAuth.js";

export interface StoredAccessToken {
  clientId: string;
  scopes: string[];
  resource?: string;
  session: WibiSession;
  expiresAt: number;
  sessionId: string;
}

export interface StoredRefreshToken {
  clientId: string;
  scopes: string[];
  resource?: string;
  session: WibiSession;
  expiresAt: number;
  sessionId: string;
}

export interface OAuthTokenStore {
  getClient(clientId: string): Promise<OAuthClientInformationFull | undefined>;
  setClient(client: OAuthClientInformationFull): Promise<void>;
  listClientIds(): Promise<string[]>;
  deleteClient(clientId: string): Promise<void>;

  getAccess(tokenHash: string): Promise<StoredAccessToken | undefined>;
  setAccess(tokenHash: string, entry: StoredAccessToken, ttlMs: number): Promise<void>;
  deleteAccess(tokenHash: string): Promise<void>;

  getRefresh(tokenHash: string): Promise<StoredRefreshToken | undefined>;
  setRefresh(tokenHash: string, entry: StoredRefreshToken, ttlMs: number): Promise<void>;
  deleteRefresh(tokenHash: string): Promise<void>;

  /** Índice de refresh hashes por sessionId (para updateSession sin SCAN). */
  addSessionRefresh(sessionId: string, refreshHash: string, ttlMs: number): Promise<void>;
  removeSessionRefresh(sessionId: string, refreshHash: string): Promise<void>;
  listSessionRefreshHashes(sessionId: string): Promise<string[]>;

  /** Índice de access hashes por sessionId, para invalidar la sesión sin SCAN. */
  addSessionAccess(sessionId: string, accessHash: string, ttlMs: number): Promise<void>;
  removeSessionAccess(sessionId: string, accessHash: string): Promise<void>;
  listSessionAccessHashes(sessionId: string): Promise<string[]>;

  /** Sesión WIBI canónica. Sobrevive a la expiración del access OAuth. */
  getSession(sessionId: string): Promise<WibiSession | undefined>;
  getSessionExpiresAt(sessionId: string): Promise<number | undefined>;
  setSession(sessionId: string, session: WibiSession, ttlMs: number): Promise<void>;
  deleteSession(sessionId: string): Promise<void>;
  revokeSession(sessionId: string): Promise<void>;

  connect(): Promise<void>;
  close(): Promise<void>;
  readonly kind: "memory" | "redis";
}

const PREFIX = "wibi-mcp:oauth";
const MAX_MEMORY_ENTRIES = 5_000;

function clientKey(clientId: string): string {
  return `${PREFIX}:client:${clientId}`;
}
function accessKey(hash: string): string {
  return `${PREFIX}:access:${hash}`;
}
function refreshKey(hash: string): string {
  return `${PREFIX}:refresh:${hash}`;
}
function sessionKey(sessionId: string): string {
  return `${PREFIX}:session:${sessionId}`;
}
function sessionAccessKey(sessionId: string): string {
  return `${PREFIX}:session:${sessionId}:access`;
}
function sessionRefreshKey(sessionId: string): string {
  return `${PREFIX}:session:${sessionId}:refresh`;
}

interface StoredCanonicalSession {
  session: WibiSession;
  expiresAt: number;
}
const CLIENTS_INDEX = `${PREFIX}:clients`;

function ttlSecondsFromMs(ttlMs: number): number {
  return Math.max(1, Math.ceil(ttlMs / 1000));
}

function enforceMapCap<K, V>(map: Map<K, V>): void {
  if (map.size < MAX_MEMORY_ENTRIES) return;
  const first = map.keys().next().value;
  if (first !== undefined) map.delete(first);
}

export class MemoryOAuthStore implements OAuthTokenStore {
  readonly kind = "memory" as const;
  private readonly clients = new Map<string, OAuthClientInformationFull>();
  private readonly access = new Map<string, StoredAccessToken>();
  private readonly refresh = new Map<string, StoredRefreshToken>();
  private readonly sessions = new Map<string, StoredCanonicalSession>();
  private readonly sessionAccess = new Map<string, Set<string>>();
  private readonly sessionRefresh = new Map<string, Set<string>>();

  async connect(): Promise<void> {}
  async close(): Promise<void> {}

  async getClient(clientId: string): Promise<OAuthClientInformationFull | undefined> {
    return this.clients.get(clientId);
  }

  async setClient(client: OAuthClientInformationFull): Promise<void> {
    enforceMapCap(this.clients);
    this.clients.set(client.client_id, client);
  }

  async listClientIds(): Promise<string[]> {
    return [...this.clients.keys()];
  }

  async deleteClient(clientId: string): Promise<void> {
    this.clients.delete(clientId);
  }

  async getAccess(tokenHash: string): Promise<StoredAccessToken | undefined> {
    const entry = this.access.get(tokenHash);
    if (!entry) return undefined;
    if (entry.expiresAt < Date.now()) {
      await this.deleteAccess(tokenHash);
      return undefined;
    }
    return entry;
  }

  async setAccess(tokenHash: string, entry: StoredAccessToken, ttlMs: number): Promise<void> {
    enforceMapCap(this.access);
    this.access.set(tokenHash, entry);
    await this.addSessionAccess(entry.sessionId, tokenHash, ttlMs);
  }

  async deleteAccess(tokenHash: string): Promise<void> {
    const entry = this.access.get(tokenHash);
    this.access.delete(tokenHash);
    if (entry) await this.removeSessionAccess(entry.sessionId, tokenHash);
  }

  async getRefresh(tokenHash: string): Promise<StoredRefreshToken | undefined> {
    const entry = this.refresh.get(tokenHash);
    if (!entry) return undefined;
    if (entry.expiresAt < Date.now()) {
      this.refresh.delete(tokenHash);
      await this.removeSessionRefresh(entry.sessionId, tokenHash);
      return undefined;
    }
    return entry;
  }

  async setRefresh(tokenHash: string, entry: StoredRefreshToken, ttlMs: number): Promise<void> {
    enforceMapCap(this.refresh);
    this.refresh.set(tokenHash, entry);
    await this.addSessionRefresh(entry.sessionId, tokenHash, ttlMs);
  }

  async deleteRefresh(tokenHash: string): Promise<void> {
    const entry = this.refresh.get(tokenHash);
    this.refresh.delete(tokenHash);
    if (entry) {
      await this.removeSessionRefresh(entry.sessionId, tokenHash);
    }
  }

  async addSessionRefresh(sessionId: string, refreshHash: string, _ttlMs: number): Promise<void> {
    let set = this.sessionRefresh.get(sessionId);
    if (!set) {
      set = new Set();
      this.sessionRefresh.set(sessionId, set);
    }
    set.add(refreshHash);
  }

  async removeSessionRefresh(sessionId: string, refreshHash: string): Promise<void> {
    const set = this.sessionRefresh.get(sessionId);
    if (!set) return;
    set.delete(refreshHash);
    if (set.size === 0) this.sessionRefresh.delete(sessionId);
  }

  async listSessionRefreshHashes(sessionId: string): Promise<string[]> {
    return [...(this.sessionRefresh.get(sessionId) ?? [])];
  }

  async addSessionAccess(sessionId: string, accessHash: string, _ttlMs: number): Promise<void> {
    let set = this.sessionAccess.get(sessionId);
    if (!set) {
      set = new Set();
      this.sessionAccess.set(sessionId, set);
    }
    set.add(accessHash);
  }

  async removeSessionAccess(sessionId: string, accessHash: string): Promise<void> {
    const set = this.sessionAccess.get(sessionId);
    if (!set) return;
    set.delete(accessHash);
    if (set.size === 0) this.sessionAccess.delete(sessionId);
  }

  async listSessionAccessHashes(sessionId: string): Promise<string[]> {
    return [...(this.sessionAccess.get(sessionId) ?? [])];
  }

  async getSession(sessionId: string): Promise<WibiSession | undefined> {
    const stored = this.readSession(sessionId);
    return stored?.session;
  }

  async getSessionExpiresAt(sessionId: string): Promise<number | undefined> {
    return this.readSession(sessionId)?.expiresAt;
  }

  async setSession(sessionId: string, session: WibiSession, ttlMs: number): Promise<void> {
    enforceMapCap(this.sessions);
    this.sessions.set(sessionId, {
      session,
      expiresAt: Date.now() + Math.max(1, ttlMs),
    });
  }

  async deleteSession(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
  }

  async revokeSession(sessionId: string): Promise<void> {
    for (const hash of await this.listSessionAccessHashes(sessionId)) {
      this.access.delete(hash);
    }
    for (const hash of await this.listSessionRefreshHashes(sessionId)) {
      this.refresh.delete(hash);
    }
    this.sessionAccess.delete(sessionId);
    this.sessionRefresh.delete(sessionId);
    this.sessions.delete(sessionId);
  }

  private readSession(sessionId: string): StoredCanonicalSession | undefined {
    const stored = this.sessions.get(sessionId);
    if (!stored) return undefined;
    if (stored.expiresAt < Date.now()) {
      this.sessions.delete(sessionId);
      return undefined;
    }
    return stored;
  }
}

export class RedisOAuthStore implements OAuthTokenStore {
  readonly kind = "redis" as const;
  private client: RedisClientType;

  constructor(redisUrl: string) {
    this.client = createClient({ url: redisUrl });
    this.client.on("error", (err: Error) => {
      console.error(`[wibi-mcp-gateway] Redis no disponible: ${err.message}`);
    });
  }

  async connect(): Promise<void> {
    try {
      if (!this.client.isOpen) {
        await this.client.connect();
      }
      await this.client.ping();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Redis no disponible: ${message}`);
    }
  }

  async close(): Promise<void> {
    if (this.client.isOpen) {
      await this.client.quit();
    }
  }

  async getClient(clientId: string): Promise<OAuthClientInformationFull | undefined> {
    try {
      const raw = await this.client.get(clientKey(clientId));
      if (!raw) return undefined;
      return JSON.parse(raw) as OAuthClientInformationFull;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[wibi-mcp-gateway] error de deserialización OAuth client: ${message}`);
      return undefined;
    }
  }

  async setClient(client: OAuthClientInformationFull): Promise<void> {
    await this.client.set(clientKey(client.client_id), JSON.stringify(client));
    await this.client.sAdd(CLIENTS_INDEX, client.client_id);
  }

  async listClientIds(): Promise<string[]> {
    return this.client.sMembers(CLIENTS_INDEX);
  }

  async deleteClient(clientId: string): Promise<void> {
    await this.client.del(clientKey(clientId));
    await this.client.sRem(CLIENTS_INDEX, clientId);
  }

  async getAccess(tokenHash: string): Promise<StoredAccessToken | undefined> {
    try {
      const raw = await this.client.get(accessKey(tokenHash));
      if (!raw) return undefined;
      const entry = JSON.parse(raw) as StoredAccessToken;
      if (entry.expiresAt < Date.now()) {
        await this.deleteAccess(tokenHash);
        return undefined;
      }
      return entry;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[wibi-mcp-gateway] error de deserialización OAuth access: ${message}`);
      return undefined;
    }
  }

  async setAccess(tokenHash: string, entry: StoredAccessToken, ttlMs: number): Promise<void> {
    await this.client.set(accessKey(tokenHash), JSON.stringify(entry), {
      EX: ttlSecondsFromMs(ttlMs),
    });
    await this.addSessionAccess(entry.sessionId, tokenHash, ttlMs);
  }

  async deleteAccess(tokenHash: string): Promise<void> {
    let sessionId: string | undefined;
    try {
      const raw = await this.client.get(accessKey(tokenHash));
      if (raw) sessionId = (JSON.parse(raw) as StoredAccessToken).sessionId;
    } catch {
      // El borrado sigue aunque el valor no se pueda leer.
    }
    await this.client.del(accessKey(tokenHash));
    if (sessionId) await this.removeSessionAccess(sessionId, tokenHash);
  }

  async getRefresh(tokenHash: string): Promise<StoredRefreshToken | undefined> {
    try {
      const raw = await this.client.get(refreshKey(tokenHash));
      if (!raw) return undefined;
      const entry = JSON.parse(raw) as StoredRefreshToken;
      if (entry.expiresAt < Date.now()) {
        await this.deleteRefresh(tokenHash);
        return undefined;
      }
      return entry;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[wibi-mcp-gateway] error de deserialización OAuth refresh: ${message}`);
      return undefined;
    }
  }

  async setRefresh(tokenHash: string, entry: StoredRefreshToken, ttlMs: number): Promise<void> {
    const ttlSec = ttlSecondsFromMs(ttlMs);
    await this.client.set(refreshKey(tokenHash), JSON.stringify(entry), { EX: ttlSec });
    await this.addSessionRefresh(entry.sessionId, tokenHash, ttlMs);
  }

  async deleteRefresh(tokenHash: string): Promise<void> {
    let sessionId: string | undefined;
    try {
      const raw = await this.client.get(refreshKey(tokenHash));
      if (raw) {
        sessionId = (JSON.parse(raw) as StoredRefreshToken).sessionId;
      }
    } catch {
      // ignore parse errors on delete
    }
    await this.client.del(refreshKey(tokenHash));
    if (sessionId) {
      await this.removeSessionRefresh(sessionId, tokenHash);
    }
  }

  async addSessionRefresh(sessionId: string, refreshHash: string, ttlMs: number): Promise<void> {
    const key = sessionRefreshKey(sessionId);
    await this.client.sAdd(key, refreshHash);
    await this.extendIndexTtl(key, ttlMs);
  }

  async removeSessionRefresh(sessionId: string, refreshHash: string): Promise<void> {
    const key = sessionRefreshKey(sessionId);
    await this.client.sRem(key, refreshHash);
  }

  async listSessionRefreshHashes(sessionId: string): Promise<string[]> {
    return this.client.sMembers(sessionRefreshKey(sessionId));
  }

  async addSessionAccess(sessionId: string, accessHash: string, ttlMs: number): Promise<void> {
    const key = sessionAccessKey(sessionId);
    await this.client.sAdd(key, accessHash);
    await this.extendIndexTtl(key, ttlMs);
  }

  async removeSessionAccess(sessionId: string, accessHash: string): Promise<void> {
    await this.client.sRem(sessionAccessKey(sessionId), accessHash);
  }

  async listSessionAccessHashes(sessionId: string): Promise<string[]> {
    return this.client.sMembers(sessionAccessKey(sessionId));
  }

  async getSession(sessionId: string): Promise<WibiSession | undefined> {
    return (await this.readSession(sessionId))?.session;
  }

  async getSessionExpiresAt(sessionId: string): Promise<number | undefined> {
    return (await this.readSession(sessionId))?.expiresAt;
  }

  async setSession(sessionId: string, session: WibiSession, ttlMs: number): Promise<void> {
    const stored: StoredCanonicalSession = {
      session,
      expiresAt: Date.now() + Math.max(1, ttlMs),
    };
    await this.client.set(sessionKey(sessionId), JSON.stringify(stored), {
      EX: ttlSecondsFromMs(ttlMs),
    });
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.client.del(sessionKey(sessionId));
  }

  async revokeSession(sessionId: string): Promise<void> {
    const accessHashes = await this.listSessionAccessHashes(sessionId);
    const refreshHashes = await this.listSessionRefreshHashes(sessionId);
    const keys = [
      ...accessHashes.map(accessKey),
      ...refreshHashes.map(refreshKey),
      sessionKey(sessionId),
      sessionAccessKey(sessionId),
      sessionRefreshKey(sessionId),
    ];
    if (keys.length > 0) await this.client.del(keys);
  }

  private async readSession(sessionId: string): Promise<StoredCanonicalSession | undefined> {
    try {
      const raw = await this.client.get(sessionKey(sessionId));
      if (!raw) return undefined;
      const stored = JSON.parse(raw) as StoredCanonicalSession;
      if (!stored?.session || stored.expiresAt < Date.now()) {
        await this.deleteSession(sessionId);
        return undefined;
      }
      return stored;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[wibi-mcp-gateway] error de deserialización de sesión: ${message}`);
      return undefined;
    }
  }

  /** No acorta un índice que todavía referencia tokens más nuevos. */
  private async extendIndexTtl(key: string, ttlMs: number): Promise<void> {
    const next = ttlSecondsFromMs(ttlMs);
    const current = await this.client.ttl(key);
    if (current < next) await this.client.expire(key, next);
  }
}

export type OauthStoreMode = "memory" | "redis";

export interface OauthStoreConfig {
  mode: OauthStoreMode;
  redisUrl?: string;
}

export async function createOauthStore(config: OauthStoreConfig): Promise<OAuthTokenStore> {
  if (config.mode === "redis") {
    if (!config.redisUrl) {
      throw new Error("OAUTH_STORE=redis requiere REDIS_URL");
    }
    const store = new RedisOAuthStore(config.redisUrl);
    await store.connect();
    console.error("[wibi-mcp-gateway] OAuth store: redis");
    return store;
  }

  console.error("[wibi-mcp-gateway] OAuth store: memory (no sobrevive recreate)");
  const store = new MemoryOAuthStore();
  await store.connect();
  return store;
}
