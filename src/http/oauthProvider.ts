/**
 * Authorization Server OAuth 2.1 para el MCP remoto multi-tenant de WIBI.
 *
 * Mejoras respecto al puerto literal de emozion-mcp:
 *  - Solicitudes de autorización opacas server-side (auth_request_id)
 *  - Solo scope "mcp"
 *  - Refresh tokens con expiración + rotación
 *  - Limpieza periódica / tope de mapas en memoria
 */

import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Response } from "express";
import type { OAuthServerProvider, AuthorizationParams } from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type { OAuthRegisteredClientsStore } from "@modelcontextprotocol/sdk/server/auth/clients.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type {
  OAuthClientInformationFull,
  OAuthTokens,
  OAuthTokenRevocationRequest,
} from "@modelcontextprotocol/sdk/shared/auth.js";

import type { WibiSession } from "../wibiAuth.js";
import { renderLoginPage } from "./loginPage.js";

const AUTH_CODE_TTL_MS = 5 * 60 * 1000;
const AUTH_REQUEST_TTL_MS = 10 * 60 * 1000;
const DEFAULT_SCOPES = ["mcp"];
const MAX_ENTRIES = 5_000;

function token(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

function hashToken(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

interface AuthRequest {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  scopes: string[];
  resource?: string;
  state?: string;
  expiresAt: number;
}

interface StoredAuthCode {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  scopes: string[];
  resource?: string;
  session: WibiSession;
  expiresAt: number;
}

interface StoredAccessToken {
  clientId: string;
  scopes: string[];
  resource?: string;
  session: WibiSession;
  expiresAt: number;
  sessionId: string;
}

interface StoredRefreshToken {
  clientId: string;
  scopes: string[];
  resource?: string;
  session: WibiSession;
  expiresAt: number;
  sessionId: string;
}

export interface CompleteAuthorizationInput {
  authRequestId: string;
  session: WibiSession;
}

export class InMemoryOAuthProvider implements OAuthServerProvider {
  private readonly clients = new Map<string, OAuthClientInformationFull>();
  private readonly authRequests = new Map<string, AuthRequest>();
  private readonly authCodes = new Map<string, StoredAuthCode>();
  private readonly accessTokens = new Map<string, StoredAccessToken>();
  private readonly refreshTokens = new Map<string, StoredRefreshToken>();
  private readonly refreshTtlMs: number;

  constructor(private readonly accessTokenTtlSeconds: number) {
    // Refresh OAuth al menos tan largo como el access OAuth, máx 7 días.
    this.refreshTtlMs = Math.max(accessTokenTtlSeconds * 1000, 7 * 24 * 60 * 60 * 1000);
    setInterval(() => this.cleanup(), 5 * 60 * 1000).unref?.();
  }

  readonly clientsStore: OAuthRegisteredClientsStore = {
    getClient: (clientId) => this.clients.get(clientId),
    registerClient: (client) => {
      this.enforceCap(this.clients);
      const full: OAuthClientInformationFull = {
        ...client,
        client_id: randomUUID(),
        client_id_issued_at: Math.floor(Date.now() / 1000),
      };
      this.clients.set(full.client_id, full);
      return full;
    },
  };

  async authorize(
    client: OAuthClientInformationFull,
    params: AuthorizationParams,
    res: Response
  ): Promise<void> {
    const scopes = (params.scopes ?? DEFAULT_SCOPES).filter((s) => s === "mcp");
    const grantedScopes = scopes.length > 0 ? scopes : DEFAULT_SCOPES;

    const authRequestId = token(24);
    this.enforceCap(this.authRequests);
    this.authRequests.set(authRequestId, {
      clientId: client.client_id,
      redirectUri: params.redirectUri,
      codeChallenge: params.codeChallenge,
      scopes: grantedScopes,
      resource: params.resource?.href,
      state: params.state,
      expiresAt: Date.now() + AUTH_REQUEST_TTL_MS,
    });

    renderLoginPage(res, {
      clientName: client.client_name ?? client.client_id,
      oauth: {
        auth_request_id: authRequestId,
        client_id: client.client_id,
        redirect_uri: params.redirectUri,
        code_challenge: params.codeChallenge,
        scope: grantedScopes.join(" "),
        state: params.state,
        resource: params.resource?.href,
      },
    });
  }

  /**
   * Completa la autorización usando solo el auth_request_id server-side.
   * Ignora parámetros OAuth reenviados por el formulario para evitar manipulación.
   */
  completeAuthorization(input: CompleteAuthorizationInput): string {
    const req = this.authRequests.get(input.authRequestId);
    this.authRequests.delete(input.authRequestId);
    if (!req || req.expiresAt < Date.now()) {
      throw new Error("Solicitud de autorización inválida o expirada");
    }

    const code = token(24);
    this.enforceCap(this.authCodes);
    this.authCodes.set(code, {
      clientId: req.clientId,
      redirectUri: req.redirectUri,
      codeChallenge: req.codeChallenge,
      scopes: req.scopes,
      resource: req.resource,
      session: input.session,
      expiresAt: Date.now() + AUTH_CODE_TTL_MS,
    });

    const url = new URL(req.redirectUri);
    url.searchParams.set("code", code);
    if (req.state) url.searchParams.set("state", req.state);
    return url.href;
  }

  async challengeForAuthorizationCode(
    _client: OAuthClientInformationFull,
    authorizationCode: string
  ): Promise<string> {
    const entry = this.authCodes.get(authorizationCode);
    if (!entry) throw new Error("Authorization code inválido o expirado");
    return entry.codeChallenge;
  }

  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
    _codeVerifier?: string,
    redirectUri?: string,
    resource?: URL
  ): Promise<OAuthTokens> {
    const entry = this.authCodes.get(authorizationCode);
    if (!entry) throw new Error("Authorization code inválido o expirado");
    this.authCodes.delete(authorizationCode);

    if (entry.expiresAt < Date.now()) throw new Error("Authorization code expirado");
    if (entry.clientId !== client.client_id) throw new Error("El código no pertenece a este cliente");
    if (redirectUri && redirectUri !== entry.redirectUri) {
      throw new Error("redirect_uri no coincide con el de la autorización");
    }

    return this.issueTokens(
      client.client_id,
      entry.scopes,
      entry.session,
      resource?.href ?? entry.resource
    );
  }

  async exchangeRefreshToken(
    client: OAuthClientInformationFull,
    refreshToken: string,
    scopes?: string[],
    resource?: URL
  ): Promise<OAuthTokens> {
    const key = hashToken(refreshToken);
    const entry = this.refreshTokens.get(key);
    if (!entry) throw new Error("Refresh token inválido");
    if (entry.expiresAt < Date.now()) {
      this.refreshTokens.delete(key);
      throw new Error("Refresh token expirado");
    }
    if (entry.clientId !== client.client_id) {
      throw new Error("El refresh token no pertenece a este cliente");
    }

    this.refreshTokens.delete(key);

    const grantedScopes = scopes && scopes.length > 0
      ? scopes.filter((s) => s === "mcp")
      : entry.scopes;
    const finalScopes = grantedScopes.length > 0 ? grantedScopes : DEFAULT_SCOPES;

    return this.issueTokens(
      client.client_id,
      finalScopes,
      entry.session,
      resource?.href ?? entry.resource,
      entry.sessionId
    );
  }

  async verifyAccessToken(accessToken: string): Promise<AuthInfo> {
    const key = hashToken(accessToken);
    const entry = this.accessTokens.get(key);
    if (!entry) throw new Error("Access token inválido");
    if (entry.expiresAt < Date.now()) {
      this.accessTokens.delete(key);
      throw new Error("Access token expirado");
    }
    return {
      token: accessToken,
      clientId: entry.clientId,
      scopes: entry.scopes,
      expiresAt: Math.floor(entry.expiresAt / 1000),
      extra: {
        session: entry.session,
        sessionId: entry.sessionId,
        idComercio: entry.session.idComercio,
      },
    };
  }

  async revokeToken(
    _client: OAuthClientInformationFull,
    request: OAuthTokenRevocationRequest
  ): Promise<void> {
    const key = hashToken(request.token);
    this.accessTokens.delete(key);
    this.refreshTokens.delete(key);
  }

  /**
   * Actualiza la sesión WIBI enlazada a un access token OAuth (tras refresh WIBI)
   * y a todos los refresh tokens de la misma sessionId.
   */
  updateSessionForAccessToken(accessToken: string, session: WibiSession): void {
    const key = hashToken(accessToken);
    const entry = this.accessTokens.get(key);
    if (!entry) return;
    entry.session = session;
    for (const refresh of this.refreshTokens.values()) {
      if (refresh.sessionId === entry.sessionId) {
        refresh.session = session;
      }
    }
  }

  private issueTokens(
    clientId: string,
    scopes: string[],
    session: WibiSession,
    resource?: string,
    existingSessionId?: string
  ): OAuthTokens {
    const accessToken = token(32);
    const refreshToken = token(32);
    const sessionId = existingSessionId ?? randomUUID();
    const accessExpiresAt = Date.now() + this.accessTokenTtlSeconds * 1000;
    const refreshExpiresAt = Date.now() + this.refreshTtlMs;

    this.enforceCap(this.accessTokens);
    this.enforceCap(this.refreshTokens);

    this.accessTokens.set(hashToken(accessToken), {
      clientId,
      scopes,
      resource,
      session,
      expiresAt: accessExpiresAt,
      sessionId,
    });
    this.refreshTokens.set(hashToken(refreshToken), {
      clientId,
      scopes,
      resource,
      session,
      expiresAt: refreshExpiresAt,
      sessionId,
    });

    return {
      access_token: accessToken,
      token_type: "bearer",
      expires_in: this.accessTokenTtlSeconds,
      refresh_token: refreshToken,
      scope: scopes.join(" "),
    };
  }

  private enforceCap<K, V>(map: Map<K, V>): void {
    if (map.size < MAX_ENTRIES) return;
    const first = map.keys().next().value;
    if (first !== undefined) map.delete(first);
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [k, v] of this.authRequests) {
      if (v.expiresAt < now) this.authRequests.delete(k);
    }
    for (const [k, v] of this.authCodes) {
      if (v.expiresAt < now) this.authCodes.delete(k);
    }
    for (const [k, v] of this.accessTokens) {
      if (v.expiresAt < now) this.accessTokens.delete(k);
    }
    for (const [k, v] of this.refreshTokens) {
      if (v.expiresAt < now) this.refreshTokens.delete(k);
    }
  }
}
