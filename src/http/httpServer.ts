/**
 * Servidor MCP remoto (Streamable HTTP) con OAuth 2.1 multi-tenant.
 *
 * Público objetivo: comercios WIBI no técnicos vía claude.ai / Claude Desktop.
 */

import { randomUUID } from "node:crypto";
import express, { type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import {
  mcpAuthRouter,
  getOAuthProtectedResourceMetadataUrl,
} from "@modelcontextprotocol/sdk/server/auth/router.js";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";

import type { ConnectionConfig, HttpConfig } from "../config.js";
import { WibiAuthService, type WibiSession } from "../wibiAuth.js";
import { WibiClient } from "../wibiClient.js";
import { buildMcpServer } from "../server.js";
import { VERSION } from "../version.js";
import { InMemoryOAuthProvider } from "./oauthProvider.js";
import {
  renderLoginPage,
  renderOtpPage,
  renderSelectScopePage,
  type OAuthFormParams,
} from "./loginPage.js";
import type { CampaniaInfo, SignInResult } from "../wibiAuth.js";
import {
  forgetSelectionContext,
  getSelectionContext,
  rememberSelectionContext,
} from "./selectionContext.js";

interface BoundTransport {
  transport: StreamableHTTPServerTransport;
  ownerSessionId: string;
  idComercio: number;
}

function errorPage(message: string): string {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8" />
<title>Error</title>
<style>body{font-family:system-ui,sans-serif;background:#0f172a;color:#e2e8f0;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}
.card{background:#1e293b;padding:32px;border-radius:12px;max-width:360px;text-align:center}</style></head>
<body><div class="card"><h1>No autorizado</h1><p>${message}</p></div></body></html>`;
}

function oauthFromBody(body: Record<string, string | undefined>): OAuthFormParams {
  return {
    auth_request_id: (body.auth_request_id ?? "").trim(),
    client_id: body.client_id ?? "",
    redirect_uri: body.redirect_uri ?? "",
    code_challenge: body.code_challenge ?? "",
    scope: body.scope,
    state: body.state,
    resource: body.resource,
  };
}

function renderAuthStep(
  res: Response,
  result: SignInResult,
  oauth: OAuthFormParams,
  fallback: {
    status?: number;
    otpPendingId?: string;
    pendingId?: string;
    campanias?: CampaniaInfo[];
    actorName?: string;
    selectedCampania?: number;
  } = {}
): boolean {
  if (result.kind === "needs_otp") {
    renderOtpPage(res, {
      oauth,
      otpPendingId: result.otpPendingId,
      message: result.message,
    });
    return true;
  }
  if (result.kind === "needs_selection") {
    rememberSelectionContext({
      pendingId: result.pendingId,
      campanias: result.campanias,
      actorName: result.actor?.nombre,
    });
    renderSelectScopePage(res, {
      oauth,
      pendingId: result.pendingId,
      campanias: result.campanias,
      actorName: result.actor?.nombre,
    });
    return true;
  }
  if (result.kind === "error") {
    if (fallback.otpPendingId) {
      renderOtpPage(
        res,
        {
          oauth,
          otpPendingId: fallback.otpPendingId,
          error: result.message,
        },
        fallback.status ?? 401
      );
      return true;
    }
    if (fallback.pendingId) {
      renderSelectScopePage(
        res,
        {
          oauth,
          pendingId: fallback.pendingId,
          campanias: fallback.campanias ?? [],
          actorName: fallback.actorName,
          selectedCampania: fallback.selectedCampania,
          error: result.message,
        },
        fallback.status ?? 403
      );
      return true;
    }
    renderLoginPage(
      res,
      { oauth, error: result.message },
      fallback.status ?? 401
    );
    return true;
  }
  return false;
}

export async function startHttpServer(
  conn: ConnectionConfig,
  config: HttpConfig
): Promise<void> {
  const provider = new InMemoryOAuthProvider(config.accessTokenTtl);
  const auth = new WibiAuthService(conn);
  const issuerUrl = new URL(config.publicUrl);
  const resourceMetadataUrl = getOAuthProtectedResourceMetadataUrl(new URL(config.publicUrl));

  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", config.trustProxy);

  app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", req.headers.origin ?? "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.header(
      "Access-Control-Allow-Headers",
      "Authorization, Content-Type, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID"
    );
    res.header("Access-Control-Expose-Headers", "Mcp-Session-Id, WWW-Authenticate");
    res.header("X-Frame-Options", "DENY");
    res.header("Cache-Control", "no-store");
    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }
    next();
  });

  app.get("/healthz", (_req, res) => {
    res.json({
      status: "ok",
      server: "wibi-mcp-gateway",
      version: VERSION,
      transport: "http",
      oauth: true,
    });
  });
  // Compatibilidad con el healthcheck Docker previo
  app.get("/health", (_req, res) => {
    res.json({ ok: true, service: "wibi-mcp-gateway", version: VERSION });
  });

  app.use(
    mcpAuthRouter({
      provider,
      issuerUrl,
      resourceServerUrl: new URL(config.publicUrl),
      scopesSupported: ["mcp"],
      resourceName: "WIBI MCP",
    })
  );

  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: "Demasiados intentos de login. Probá más tarde.",
  });

  app.post(
    "/oauth/approve",
    loginLimiter,
    express.urlencoded({ extended: false, limit: "16kb" }),
    async (req: Request, res: Response) => {
      const body = req.body as Record<string, string | undefined>;
      const oauth = oauthFromBody(body);
      const authRequestId = oauth.auth_request_id ?? "";
      if (!authRequestId) {
        res.status(400).type("html").send(errorPage("Solicitud de autorización inválida."));
        return;
      }

      const step = (body.step ?? "credentials").trim();
      const action = (body.action ?? "").trim();

      try {
        // --- OTP: reenvío (no consume auth_request_id) ---
        if (step === "otp" && action === "resend_otp") {
          const otpPendingId = (body.otp_pending_id ?? "").trim();
          if (!otpPendingId) {
            renderLoginPage(res, { oauth, error: "Sesión de verificación inválida." }, 400);
            return;
          }
          const resent = await auth.resendOtp(otpPendingId);
          if (resent.kind === "error") {
            renderOtpPage(res, { oauth, otpPendingId, error: resent.message }, 429);
            return;
          }
          renderOtpPage(res, {
            oauth,
            otpPendingId,
            message: resent.data.message,
          });
          return;
        }

        // --- OTP: verificación ---
        if (step === "otp") {
          const otpPendingId = (body.otp_pending_id ?? "").trim();
          const codigo = (body.codigo ?? "").trim();
          if (!otpPendingId || !codigo) {
            renderOtpPage(
              res,
              {
                oauth,
                otpPendingId: otpPendingId || "invalid",
                error: "Ingresá el código de verificación.",
              },
              400
            );
            return;
          }
          const result = await auth.verifyOtp(otpPendingId, codigo);
          if (renderAuthStep(res, result, oauth, { otpPendingId })) {
            return;
          }
          if (result.kind === "ok") {
            const redirectTo = provider.completeAuthorization({
              authRequestId,
              session: result.session,
            });
            res.redirect(302, redirectTo);
          }
          return;
        }

        // --- Selección: cargar comercios de una campaña ---
        if (step === "select" && action === "load_comercios") {
          const pendingId = (body.pending_id ?? "").trim();
          const idCampania = Number(body.idCampania ?? 0);
          const ctx = pendingId ? getSelectionContext(pendingId) : null;
          const campanias = ctx?.campanias ?? [];
          const actorName = ctx?.actorName;

          if (!pendingId || !ctx) {
            renderLoginPage(
              res,
              { oauth, error: "Sesión de selección expirada. Volvé a iniciar sesión." },
              400
            );
            return;
          }

          if (!idCampania) {
            renderSelectScopePage(
              res,
              {
                oauth,
                pendingId,
                campanias,
                actorName,
                error: "Seleccioná una campaña.",
              },
              400
            );
            return;
          }

          const listed = await auth.listScopedComercios(pendingId, idCampania);
          if (listed.kind === "error") {
            renderSelectScopePage(
              res,
              {
                oauth,
                pendingId,
                campanias,
                selectedCampania: idCampania,
                actorName,
                error: listed.message,
              },
              403
            );
            return;
          }

          renderSelectScopePage(res, {
            oauth,
            pendingId,
            campanias,
            selectedCampania: idCampania,
            comercios: listed.data.comercios,
            actorName,
          });
          return;
        }

        // --- Selección final: emitir tokens como comercio ---
        if (step === "select") {
          const pendingId = (body.pending_id ?? "").trim();
          const idCampania = Number(body.idCampania ?? 0);
          const idComercio = Number(body.idComercio ?? 0);
          const ctx = pendingId ? getSelectionContext(pendingId) : null;
          const campanias = ctx?.campanias ?? [];
          const actorName = ctx?.actorName;

          if (!pendingId || !ctx) {
            renderLoginPage(
              res,
              { oauth, error: "Sesión de selección expirada. Volvé a iniciar sesión." },
              400
            );
            return;
          }

          if (!idCampania || !idComercio) {
            renderSelectScopePage(
              res,
              {
                oauth,
                pendingId,
                campanias,
                selectedCampania: idCampania || undefined,
                actorName,
                error: "Seleccioná campaña y comercio.",
              },
              400
            );
            return;
          }

          const result = await auth.selectScope(pendingId, idCampania, idComercio);
          if (renderAuthStep(res, result, oauth, {
            pendingId,
            campanias,
            selectedCampania: idCampania,
            actorName,
          })) {
            return;
          }
          if (result.kind === "ok") {
            forgetSelectionContext(pendingId);
            const redirectTo = provider.completeAuthorization({
              authRequestId,
              session: result.session,
            });
            res.redirect(302, redirectTo);
          }
          return;
        }

        // --- Credenciales (comercio o admin) ---
        const result = await auth.signInWithCredentials(body.user ?? "", body.password ?? "");
        if (renderAuthStep(res, result, oauth)) {
          // needs_otp / needs_selection / error: no consumir auth_request_id
          return;
        }

        if (result.kind === "ok") {
          const redirectTo = provider.completeAuthorization({
            authRequestId,
            session: result.session,
          });
          res.redirect(302, redirectTo);
        }
      } catch (err) {
        res
          .status(400)
          .type("html")
          .send(errorPage((err as Error).message || "No se pudo completar la autorización."));
      }
    }
  );

  const bearer = requireBearerAuth({ verifier: provider, resourceMetadataUrl });
  const transports: Record<string, BoundTransport> = {};

  const mcpLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
  });

  const assertOwner = (req: Request, bound: BoundTransport): boolean => {
    const session = req.auth?.extra?.session as WibiSession | undefined;
    const ownerSessionId = req.auth?.extra?.sessionId as string | undefined;
    if (!session || !ownerSessionId) return false;
    // La sesión MCP queda ligada al sessionId OAuth + IdComercio del login.
    // Un Bearer de otro comercio (u otra familia OAuth) no puede reutilizar el Mcp-Session-Id.
    if (ownerSessionId !== bound.ownerSessionId) return false;
    if (session.idComercio !== bound.idComercio) return false;
    return true;
  };

  app.post(
    "/mcp",
    mcpLimiter,
    express.json({ limit: "1mb" }),
    bearer,
    async (req: Request, res: Response) => {
      try {
        const sessionId = req.headers["mcp-session-id"] as string | undefined;
        let bound: BoundTransport | undefined = sessionId ? transports[sessionId] : undefined;

        if (bound) {
          if (!assertOwner(req, bound)) {
            res.status(401).json({
              jsonrpc: "2.0",
              error: { code: -32001, message: "La sesión MCP no pertenece a este usuario." },
              id: null,
            });
            return;
          }
          await bound.transport.handleRequest(req, res, req.body);
          return;
        }

        if (sessionId || !isInitializeRequest(req.body)) {
          res.status(400).json({
            jsonrpc: "2.0",
            error: {
              code: -32000,
              message: "Sesión no encontrada o falta la petición initialize.",
            },
            id: null,
          });
          return;
        }

        const session = req.auth?.extra?.session as WibiSession | undefined;
        const ownerSessionId = req.auth?.extra?.sessionId as string | undefined;
        const accessToken = req.auth?.token;
        if (!session || !ownerSessionId || !accessToken) {
          res.status(401).json({
            jsonrpc: "2.0",
            error: { code: -32001, message: "Token sin sesión de comercio asociada." },
            id: null,
          });
          return;
        }

        const livingSession = { ...session };

        const userClient = new WibiClient(
          {
            baseUrl: conn.baseUrl,
            apiKey: conn.apiKey,
            timeoutMs: conn.timeoutMs,
            defaultCampania: livingSession.defaultCampania,
          },
          {
            session: {
              accessToken: livingSession.wibiToken,
              refreshToken: livingSession.refreshToken,
              expiresAtMs: livingSession.tokenExpiryMs,
            },
            refresher: async (refreshToken) => {
              const refreshed = await auth.refresh(refreshToken);
              if (refreshed.kind !== "ok") {
                throw new Error(
                  refreshed.kind === "error"
                    ? refreshed.message
                    : "No se pudo renovar la sesión WIBI."
                );
              }
              livingSession.wibiToken = refreshed.session.wibiToken;
              livingSession.refreshToken = refreshed.session.refreshToken;
              livingSession.tokenExpiryMs = refreshed.session.tokenExpiryMs;
              livingSession.campanias = refreshed.session.campanias;
              provider.updateSessionForAccessToken(accessToken, livingSession);
              return {
                accessToken: refreshed.session.wibiToken,
                refreshToken: refreshed.session.refreshToken,
                expiresAtMs: refreshed.session.tokenExpiryMs,
              };
            },
          }
        );

        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (sid) => {
            transports[sid] = {
              transport,
              ownerSessionId,
              idComercio: livingSession.idComercio,
            };
          },
        });
        transport.onclose = () => {
          if (transport.sessionId) delete transports[transport.sessionId];
        };

        const mcp = buildMcpServer(userClient, {
          campanias: livingSession.campanias,
          defaultCampania: livingSession.defaultCampania,
          comercio: {
            idComercio: livingSession.idComercio,
            nombre: livingSession.nombreComercio,
            idRed: livingSession.idRed,
          },
        });
        await mcp.connect(transport);
        await transport.handleRequest(req, res, req.body);
      } catch (err) {
        console.error("[wibi-mcp-gateway] error en POST /mcp:", err);
        if (!res.headersSent) {
          res.status(500).json({
            jsonrpc: "2.0",
            error: { code: -32603, message: "Error interno del gateway MCP." },
            id: null,
          });
        }
      }
    }
  );

  const handleSessionRequest = async (req: Request, res: Response) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    const bound = sessionId ? transports[sessionId] : undefined;
    if (!bound) {
      res.status(400).send("Falta o es inválido el header Mcp-Session-Id");
      return;
    }
    if (!assertOwner(req, bound)) {
      res.status(401).send("La sesión MCP no pertenece a este usuario.");
      return;
    }
    await bound.transport.handleRequest(req, res);
  };

  app.get("/mcp", bearer, handleSessionRequest);
  app.delete("/mcp", bearer, handleSessionRequest);

  // Evitar body parsers demasiado grandes en el resto
  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: "Not found" });
  });

  // Bearer inválido/expirado (p. ej. tras reinicio del contenedor) → 401, no 500.
  app.use((err: unknown, _req: Request, res: Response, next: (e?: unknown) => void) => {
    const message = err instanceof Error ? err.message : String(err);
    if (/token|autoriz|Bearer|Authentication/i.test(message)) {
      if (!res.headersSent) {
        res.status(401).json({
          jsonrpc: "2.0",
          error: {
            code: -32001,
            message: "Sesión OAuth inválida o expirada. Volvé a conectar el conector.",
          },
          id: null,
        });
      }
      return;
    }
    next(err);
  });

  await new Promise<void>((resolve) => {
    app.listen(config.port, config.host, () => resolve());
  });

  console.error(
    `[wibi-mcp-gateway] HTTP escuchando en ${config.host}:${config.port}\n` +
      `[wibi-mcp-gateway] issuer/público: ${config.publicUrl}\n` +
      `[wibi-mcp-gateway] endpoint MCP:   ${config.publicUrl}/mcp\n` +
      `[wibi-mcp-gateway] login por comercio contra ${conn.baseUrl}/onzecrm/v2/auth/login`
  );
}
