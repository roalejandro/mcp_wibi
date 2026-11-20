import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { WibiSession } from "../wibiAuth.js";
import { MemoryOAuthStore, RedisOAuthStore, createOauthStore } from "./oauthStore.js";

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

  it("touchSession extiende el vencimiento sin cambiar la sesión", async () => {
    const store = new MemoryOAuthStore();
    const sessionId = randomUUID();
    const session = sampleSession({ refreshToken: "R1", wibiToken: "jwt-1" });
    await store.setSession(sessionId, session, 5_000);
    const before = await store.getSessionExpiresAt(sessionId);

    assert.equal(await store.touchSession(sessionId, 60_000), true);
    const after = await store.getSession(sessionId);
    assert.equal(after?.refreshToken, "R1");
    assert.equal(after?.wibiToken, "jwt-1");
    assert.ok((await store.getSessionExpiresAt(sessionId))! > before!);

    await store.deleteSession(sessionId);
    assert.equal(await store.touchSession(sessionId, 60_000), false);
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

describe("RedisOAuthStore", () => {
  const redisUrl = process.env.REDIS_URL;

  it("touchSession preserva el contenido y extiende el TTL", { skip: redisUrl ? false : "definí REDIS_URL para ejercitar Redis" }, async () => {
    if (!redisUrl) return;
    const store = new RedisOAuthStore(redisUrl);
    await store.connect();
    const sessionId = randomUUID();
    try {
      await store.setSession(sessionId, sampleSession({ refreshToken: "R1", wibiToken: "jwt-1" }), 5_000);
      await store.setSession(sessionId, sampleSession({ refreshToken: "R2", wibiToken: "jwt-2" }), 5_000);
      assert.equal(await store.touchSession(sessionId, 60_000), true);
      const session = await store.getSession(sessionId);
      assert.equal(session?.refreshToken, "R2");
      assert.equal(session?.wibiToken, "jwt-2");
      const expiresAt = await store.getSessionExpiresAt(sessionId);
      assert.ok(expiresAt && expiresAt > Date.now() + 30_000);
      await store.deleteSession(sessionId);
      assert.equal(await store.touchSession(sessionId, 60_000), false);
    } finally {
      await store.close();
    }
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
