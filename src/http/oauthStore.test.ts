import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { WibiSession } from "../wibiAuth.js";
import { MemoryOAuthStore, createOauthStore } from "./oauthStore.js";

function sampleSession(overrides: Partial<WibiSession> = {}): WibiSession {
  return {
    wibiToken: "jwt-wibi-1",
    refreshToken: "refresh-wibi-1",
    tokenExpiryMs: Date.now() + 60_000,
    idComercio: 10,
    nombreComercio: "Test",
    idRed: 1,
    campanias: [],
    ...overrides,
  };
}

describe("MemoryOAuthStore", () => {
  it("set/get/delete access con TTL lógico", async () => {
    const store = new MemoryOAuthStore();
    const hash = "access-hash-1";
    const entry = {
      clientId: "c1",
      scopes: ["mcp"],
      session: sampleSession(),
      expiresAt: Date.now() + 60_000,
      sessionId: randomUUID(),
    };

    await store.setAccess(hash, entry, 60_000);
    const got = await store.getAccess(hash);
    assert.ok(got);
    assert.equal(got.clientId, "c1");
    assert.equal(got.session.wibiToken, "jwt-wibi-1");

    await store.deleteAccess(hash);
    assert.equal(await store.getAccess(hash), undefined);
  });

  it("set/get/delete refresh y mantiene índice de sesión", async () => {
    const store = new MemoryOAuthStore();
    const sessionId = randomUUID();
    const hash = "refresh-hash-1";
    const entry = {
      clientId: "c1",
      scopes: ["mcp"],
      session: sampleSession(),
      expiresAt: Date.now() + 120_000,
      sessionId,
    };

    await store.setRefresh(hash, entry, 120_000);
    assert.deepEqual(await store.listSessionRefreshHashes(sessionId), [hash]);
    assert.ok(await store.getRefresh(hash));

    await store.deleteRefresh(hash);
    assert.equal(await store.getRefresh(hash), undefined);
    assert.deepEqual(await store.listSessionRefreshHashes(sessionId), []);
  });

  it("access expirado se elimina al leer", async () => {
    const store = new MemoryOAuthStore();
    const hash = "expired-access";
    await store.setAccess(
      hash,
      {
        clientId: "c1",
        scopes: ["mcp"],
        session: sampleSession(),
        expiresAt: Date.now() - 1,
        sessionId: randomUUID(),
      },
      1
    );
    assert.equal(await store.getAccess(hash), undefined);
  });

  it("guarda y revoca la sesión canónica con sus tokens", async () => {
    const store = new MemoryOAuthStore();
    const sessionId = randomUUID();
    const session = sampleSession({ wibiToken: "jwt-canonico" });
    await store.setSession(sessionId, session, 60_000);
    assert.equal((await store.getSession(sessionId))?.wibiToken, "jwt-canonico");
    assert.ok((await store.getSessionExpiresAt(sessionId))! > Date.now());

    await store.setAccess(
      "access-hash",
      {
        clientId: "c1",
        scopes: ["mcp"],
        session,
        expiresAt: Date.now() + 60_000,
        sessionId,
      },
      60_000
    );
    await store.setRefresh(
      "refresh-hash",
      {
        clientId: "c1",
        scopes: ["mcp"],
        session,
        expiresAt: Date.now() + 60_000,
        sessionId,
      },
      60_000
    );

    await store.revokeSession(sessionId);
    assert.equal(await store.getSession(sessionId), undefined);
    assert.equal(await store.getAccess("access-hash"), undefined);
    assert.equal(await store.getRefresh("refresh-hash"), undefined);
  });

  it("persiste clientes DCR", async () => {
    const store = new MemoryOAuthStore();
    const clientId = randomUUID();
    await store.setClient({
      client_id: clientId,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      redirect_uris: ["https://example.com/cb"],
    });
    const got = await store.getClient(clientId);
    assert.ok(got);
    assert.equal(got.client_id, clientId);
    assert.deepEqual(await store.listClientIds(), [clientId]);
  });
});

describe("createOauthStore", () => {
  it("modo memory arranca sin Redis", async () => {
    const store = await createOauthStore({ mode: "memory" });
    assert.equal(store.kind, "memory");
    await store.close();
  });

  it("modo redis falla si falta REDIS_URL", async () => {
    await assert.rejects(
      () => createOauthStore({ mode: "redis" }),
      /REDIS_URL/
    );
  });
});
