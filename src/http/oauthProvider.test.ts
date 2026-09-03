import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { OAuthClientInformationFull } from "@modelcontextprotocol/sdk/shared/auth.js";
import type { WibiSession } from "../wibiAuth.js";
import { MemoryOAuthStore } from "./oauthStore.js";
import { WibiOAuthProvider, hashToken } from "./oauthProvider.js";

function sampleSession(overrides: Partial<WibiSession> = {}): WibiSession {
  return {
    wibiToken: "jwt-wibi-1",
    refreshToken: "refresh-wibi-1",
    tokenExpiryMs: Date.now() + 60_000,
    idComercio: 10,
    nombreComercio: "Test",
    idRed: 1,
    campanias: [],
    scopeMode: "comercio",
    ...overrides,
  };
}

async function registerClient(provider: WibiOAuthProvider): Promise<OAuthClientInformationFull> {
  return provider.clientsStore.registerClient!({
    redirect_uris: ["https://example.com/cb"],
    client_name: "test",
  });
}

describe("WibiOAuthProvider + MemoryOAuthStore", () => {
  it("issue → verify → refresh → updateSession sobrevive reinicio simulado", async () => {
    const store = new MemoryOAuthStore();
    const providerA = new WibiOAuthProvider(3600, store);
    const client = await registerClient(providerA);

    // Inyectar auth request + code vía flujo público completeAuthorization.
    const authRequestId = "test-auth-req";
    (providerA as unknown as {
      authRequests: Map<string, unknown>;
    }).authRequests.set(authRequestId, {
      clientId: client.client_id,
      redirectUri: "https://example.com/cb",
      codeChallenge: "challenge",
      scopes: ["mcp"],
      expiresAt: Date.now() + 60_000,
    });

    const redirect = providerA.completeAuthorization({
      authRequestId,
      session: sampleSession(),
    });
    const code = new URL(redirect).searchParams.get("code");
    assert.ok(code);

    const tokens = await providerA.exchangeAuthorizationCode(client, code);
    assert.ok(tokens.access_token);
    assert.ok(tokens.refresh_token);

    const verified = await providerA.verifyAccessToken(tokens.access_token);
    assert.equal(verified.clientId, client.client_id);
    assert.equal((verified.extra as { session: WibiSession }).session.wibiToken, "jwt-wibi-1");

    // Reinicio simulado: nueva instancia del provider, mismo store.
    const providerB = new WibiOAuthProvider(3600, store);
    const verifiedAgain = await providerB.verifyAccessToken(tokens.access_token);
    assert.equal(verifiedAgain.clientId, client.client_id);

    const rotated = await providerB.exchangeRefreshToken(client, tokens.refresh_token!);
    assert.ok(rotated.access_token);
    assert.ok(rotated.refresh_token);
    assert.notEqual(rotated.refresh_token, tokens.refresh_token);

    // El refresh anterior debe haber sido eliminado (rotación).
    await assert.rejects(
      () => providerB.exchangeRefreshToken(client, tokens.refresh_token!),
      /Refresh token inválido/
    );

    const updatedSession = sampleSession({
      wibiToken: "jwt-wibi-2",
      refreshToken: "refresh-wibi-2",
      preferredIdComercio: 99,
    });
    await providerB.updateSessionForAccessToken(rotated.access_token, updatedSession);

    const afterUpdate = await providerB.verifyAccessToken(rotated.access_token);
    const session = (afterUpdate.extra as { session: WibiSession }).session;
    assert.equal(session.wibiToken, "jwt-wibi-2");
    assert.equal(session.preferredIdComercio, 99);

    // El refresh rotado también debe reflejar la sesión actualizada.
    const refreshHash = hashToken(rotated.refresh_token!);
    const refreshEntry = await store.getRefresh(refreshHash);
    assert.ok(refreshEntry);
    assert.equal(refreshEntry.session.wibiToken, "jwt-wibi-2");
  });

  it("updateSessionForAccessToken actualiza todos los refresh del sessionId", async () => {
    const store = new MemoryOAuthStore();
    const provider = new WibiOAuthProvider(3600, store);
    const sessionId = randomUUID();
    const accessRaw = "access-raw-token";
    const refreshA = "refresh-a";
    const refreshB = "refresh-b";
    const session = sampleSession();

    await store.setAccess(
      hashToken(accessRaw),
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
      hashToken(refreshA),
      {
        clientId: "c1",
        scopes: ["mcp"],
        session,
        expiresAt: Date.now() + 120_000,
        sessionId,
      },
      120_000
    );
    await store.setRefresh(
      hashToken(refreshB),
      {
        clientId: "c1",
        scopes: ["mcp"],
        session,
        expiresAt: Date.now() + 120_000,
        sessionId,
      },
      120_000
    );

    await provider.updateSessionForAccessToken(
      accessRaw,
      sampleSession({ wibiToken: "nuevo-jwt" })
    );

    assert.equal((await store.getAccess(hashToken(accessRaw)))!.session.wibiToken, "nuevo-jwt");
    assert.equal((await store.getRefresh(hashToken(refreshA)))!.session.wibiToken, "nuevo-jwt");
    assert.equal((await store.getRefresh(hashToken(refreshB)))!.session.wibiToken, "nuevo-jwt");
  });

  it("access expirado no impide canjear el refresh persistido", async () => {
    const store = new MemoryOAuthStore();
    const provider = new WibiOAuthProvider(1, store);
    const client = await registerClient(provider);
    const sessionId = randomUUID();
    const accessRaw = "short-access";
    const refreshRaw = "long-refresh";
    const session = sampleSession();

    await store.setAccess(
      hashToken(accessRaw),
      {
        clientId: client.client_id,
        scopes: ["mcp"],
        session,
        expiresAt: Date.now() - 1_000,
        sessionId,
      },
      1_000
    );
    await store.setRefresh(
      hashToken(refreshRaw),
      {
        clientId: client.client_id,
        scopes: ["mcp"],
        session,
        expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
        sessionId,
      },
      7 * 24 * 60 * 60 * 1000
    );

    await assert.rejects(() => provider.verifyAccessToken(accessRaw), /Access token/);

    const rotated = await provider.exchangeRefreshToken(client, refreshRaw);
    assert.ok(rotated.access_token);
    assert.ok(rotated.refresh_token);
    assert.notEqual(rotated.access_token, accessRaw);
    assert.notEqual(rotated.refresh_token, refreshRaw);

    const verified = await provider.verifyAccessToken(rotated.access_token);
    assert.equal(verified.clientId, client.client_id);
    assert.equal((verified.extra as { session: WibiSession }).session.wibiToken, "jwt-wibi-1");
  });

  it("rotación de refresh elimina el anterior y mantiene índice consistente", async () => {
    const store = new MemoryOAuthStore();
    const provider = new WibiOAuthProvider(3600, store);
    const client = await registerClient(provider);
    const sessionId = randomUUID();
    const oldRefresh = "old-refresh-token";
    const session = sampleSession();

    await store.setRefresh(
      hashToken(oldRefresh),
      {
        clientId: client.client_id,
        scopes: ["mcp"],
        session,
        expiresAt: Date.now() + 120_000,
        sessionId,
      },
      120_000
    );

    const tokens = await provider.exchangeRefreshToken(client, oldRefresh);
    assert.equal(await store.getRefresh(hashToken(oldRefresh)), undefined);
    assert.ok(await store.getRefresh(hashToken(tokens.refresh_token!)));

    const hashes = await store.listSessionRefreshHashes(sessionId);
    assert.ok(hashes.includes(hashToken(tokens.refresh_token!)));
    assert.ok(!hashes.includes(hashToken(oldRefresh)));
  });
});
