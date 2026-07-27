/**
 * Página de login OAuth para comercios WIBI (usuario/clave, sin MFA).
 */

import type { Response } from "express";

export interface OAuthFormParams {
  client_id: string;
  redirect_uri: string;
  code_challenge: string;
  scope?: string;
  state?: string;
  resource?: string;
  /** ID opaco de la solicitud de autorización (server-side). */
  auth_request_id?: string;
}

export interface RenderLoginOptions {
  oauth: OAuthFormParams;
  clientName?: string;
  error?: string;
}

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function hiddenFields(oauth: OAuthFormParams): string {
  const all: Record<string, string | undefined> = {
    auth_request_id: oauth.auth_request_id,
    client_id: oauth.client_id,
    redirect_uri: oauth.redirect_uri,
    code_challenge: oauth.code_challenge,
    scope: oauth.scope,
    state: oauth.state,
    resource: oauth.resource,
  };
  return Object.entries(all)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `<input type="hidden" name="${esc(k)}" value="${esc(v as string)}" />`)
    .join("\n      ");
}

export function renderLoginPage(res: Response, opts: RenderLoginOptions, status = 200): void {
  const clientName = esc(opts.clientName ?? "Una aplicación");
  const errorHtml = opts.error
    ? `<p class="error">${esc(opts.error)}</p>`
    : "";

  res
    .status(status)
    .setHeader("Cache-Control", "no-store")
    .setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'")
    .setHeader("X-Frame-Options", "DENY")
    .type("html")
    .send(`<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>WIBI — Iniciar sesión</title>
  <style>
    body { font-family: system-ui, sans-serif; background:#0f172a; color:#e2e8f0; display:flex; min-height:100vh; align-items:center; justify-content:center; margin:0; }
    form { background:#1e293b; padding:32px; border-radius:12px; width:340px; box-shadow:0 10px 30px rgba(0,0,0,.4); }
    h1 { font-size:18px; margin:0 0 4px; }
    p { color:#94a3b8; font-size:13px; margin:0 0 18px; }
    .app { font-weight:600; color:#e2e8f0; }
    label { display:block; font-size:13px; margin:12px 0 6px; }
    input[type=text], input[type=password] { width:100%; box-sizing:border-box; padding:10px; border-radius:8px; border:1px solid #334155; background:#0f172a; color:#e2e8f0; }
    button { width:100%; margin-top:20px; padding:11px; border:0; border-radius:8px; background:#00A3D7; color:#fff; font-weight:600; cursor:pointer; }
    button:hover { background:#0284c7; }
    .error { color:#fca5a5; background:#7f1d1d33; border:1px solid #7f1d1d; padding:8px 10px; border-radius:8px; font-size:13px; }
    .brand { color:#8DC43E; font-weight:700; letter-spacing:.02em; margin-bottom:12px; font-size:14px; }
  </style>
</head>
<body>
  <form method="post" action="/oauth/approve" autocomplete="on">
    <div class="brand">WIBI</div>
    <h1>Iniciar sesión</h1>
    <p><span class="app">${clientName}</span> quiere acceder a tu comercio WIBI.</p>
    ${errorHtml}
    <label for="user">Usuario</label>
    <input id="user" name="user" type="text" autocomplete="username" autofocus required />
    <label for="password">Contraseña</label>
    <input id="password" name="password" type="password" autocomplete="current-password" required />
    ${hiddenFields(opts.oauth)}
    <button type="submit">Acceder</button>
  </form>
</body>
</html>`);
}
