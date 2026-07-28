/**
 * Páginas OAuth WIBI: credenciales, OTP 2FA y selector legado campaña/comercio.
 */

import type { Response } from "express";
import type { CampaniaInfo, ComercioInfo } from "../wibiAuth.js";

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

export interface RenderOtpOptions {
  oauth: OAuthFormParams;
  otpPendingId: string;
  clientName?: string;
  message?: string;
  error?: string;
}

export interface RenderSelectOptions {
  oauth: OAuthFormParams;
  pendingId: string;
  campanias: CampaniaInfo[];
  comercios?: ComercioInfo[];
  selectedCampania?: number;
  actorName?: string;
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

function hiddenFields(
  oauth: OAuthFormParams,
  extra: Record<string, string | undefined> = {}
): string {
  const all: Record<string, string | undefined> = {
    auth_request_id: oauth.auth_request_id,
    client_id: oauth.client_id,
    redirect_uri: oauth.redirect_uri,
    code_challenge: oauth.code_challenge,
    scope: oauth.scope,
    state: oauth.state,
    resource: oauth.resource,
    ...extra,
  };
  return Object.entries(all)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `<input type="hidden" name="${esc(k)}" value="${esc(v as string)}" />`)
    .join("\n      ");
}

function shell(opts: {
  title: string;
  body: string;
  status?: number;
}): { status: number; html: string; headers: Record<string, string> } {
  return {
    status: opts.status ?? 200,
    headers: {
      "Cache-Control": "no-store",
      // Chromium aplica form-action a toda la cadena de redirects tras el POST.
      "Content-Security-Policy":
        "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; form-action 'self' https: claude:; frame-ancestors 'none'; base-uri 'none'",
      "X-Frame-Options": "DENY",
      "Content-Type": "text/html; charset=utf-8",
    },
    html: `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(opts.title)}</title>
  <style>
    body { font-family: system-ui, sans-serif; background:#0f172a; color:#e2e8f0; display:flex; min-height:100vh; align-items:center; justify-content:center; margin:0; }
    form, .card { background:#1e293b; padding:32px; border-radius:12px; width:360px; box-shadow:0 10px 30px rgba(0,0,0,.4); }
    h1 { font-size:18px; margin:0 0 4px; }
    p { color:#94a3b8; font-size:13px; margin:0 0 18px; }
    .app { font-weight:600; color:#e2e8f0; }
    label { display:block; font-size:13px; margin:12px 0 6px; }
    input[type=text], input[type=password], input[type=number], select {
      width:100%; box-sizing:border-box; padding:10px; border-radius:8px;
      border:1px solid #334155; background:#0f172a; color:#e2e8f0;
    }
    button { width:100%; margin-top:16px; padding:11px; border:0; border-radius:8px; background:#00A3D7; color:#fff; font-weight:600; cursor:pointer; }
    button:hover:not(:disabled) { background:#0284c7; }
    button:disabled { opacity:.65; cursor:wait; }
    button.secondary { background:#334155; margin-top:10px; }
    button.secondary:hover:not(:disabled) { background:#475569; }
    .error { color:#fca5a5; background:#7f1d1d33; border:1px solid #7f1d1d; padding:8px 10px; border-radius:8px; font-size:13px; margin-bottom:12px; }
    .info { color:#bae6fd; background:#0c4a6e33; border:1px solid #075985; padding:8px 10px; border-radius:8px; font-size:13px; margin-bottom:12px; }
    .brand { color:#8DC43E; font-weight:700; letter-spacing:.02em; margin-bottom:12px; font-size:14px; }
  </style>
</head>
<body>
  ${opts.body}
</body>
</html>`,
  };
}

function sendHtml(
  res: Response,
  packed: { status: number; html: string; headers: Record<string, string> }
): void {
  res.status(packed.status);
  for (const [k, v] of Object.entries(packed.headers)) {
    res.setHeader(k, v);
  }
  res.send(packed.html);
}

function disableSubmitScript(formId: string, btnId: string, busyLabel: string): string {
  return `<script>
    (function () {
      var form = document.getElementById(${JSON.stringify(formId)});
      var btn = document.getElementById(${JSON.stringify(btnId)});
      if (!form || !btn) return;
      form.addEventListener("submit", function () {
        if (btn.disabled) return;
        btn.disabled = true;
        btn.textContent = ${JSON.stringify(busyLabel)};
      });
    })();
  </script>`;
}

export function renderLoginPage(res: Response, opts: RenderLoginOptions, status = 200): void {
  const clientName = esc(opts.clientName ?? "Una aplicación");
  const errorHtml = opts.error ? `<p class="error">${esc(opts.error)}</p>` : "";

  sendHtml(
    res,
    shell({
      title: "WIBI — Iniciar sesión",
      status,
      body: `<form method="post" action="/oauth/approve" autocomplete="on" id="login-form">
    <div class="brand">WIBI</div>
    <h1>Iniciar sesión</h1>
    <p><span class="app">${clientName}</span> quiere acceder a tu cuenta WIBI.</p>
    ${errorHtml}
    <label for="user">Usuario</label>
    <input id="user" name="user" type="text" autocomplete="username" autofocus required />
    <label for="password">Contraseña</label>
    <input id="password" name="password" type="password" autocomplete="current-password" required />
    ${hiddenFields(opts.oauth, { step: "credentials" })}
    <button type="submit" id="login-submit">Acceder</button>
  </form>
  ${disableSubmitScript("login-form", "login-submit", "Conectando…")}`,
    })
  );
}

export function renderOtpPage(res: Response, opts: RenderOtpOptions, status = 200): void {
  const clientName = esc(opts.clientName ?? "Una aplicación");
  const errorHtml = opts.error ? `<p class="error">${esc(opts.error)}</p>` : "";
  const infoHtml = opts.message
    ? `<p class="info">${esc(opts.message)}</p>`
    : `<p class="info">Te enviamos un código de 6 dígitos a tu email.</p>`;

  sendHtml(
    res,
    shell({
      title: "WIBI — Verificación",
      status,
      body: `<form method="post" action="/oauth/approve" autocomplete="one-time-code" id="otp-form">
    <div class="brand">WIBI</div>
    <h1>Verificación en dos pasos</h1>
    <p>Confirmá el acceso de <span class="app">${clientName}</span>.</p>
    ${infoHtml}
    ${errorHtml}
    <label for="codigo">Código</label>
    <input id="codigo" name="codigo" type="text" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="one-time-code" autofocus required />
    ${hiddenFields(opts.oauth, {
      step: "otp",
      otp_pending_id: opts.otpPendingId,
    })}
    <button type="submit" id="otp-submit">Verificar</button>
  </form>
  <form method="post" action="/oauth/approve" id="otp-resend-form" style="margin-top:0;padding-top:0;box-shadow:none;background:transparent;width:360px">
    ${hiddenFields(opts.oauth, {
      step: "otp",
      action: "resend_otp",
      otp_pending_id: opts.otpPendingId,
    })}
    <button type="submit" class="secondary" id="otp-resend">Reenviar código</button>
  </form>
  ${disableSubmitScript("otp-form", "otp-submit", "Verificando…")}
  ${disableSubmitScript("otp-resend-form", "otp-resend", "Reenviando…")}`,
    })
  );
}

export function renderSelectScopePage(
  res: Response,
  opts: RenderSelectOptions,
  status = 200
): void {
  const clientName = esc(opts.clientName ?? "Una aplicación");
  const errorHtml = opts.error ? `<p class="error">${esc(opts.error)}</p>` : "";
  const actorHtml = opts.actorName
    ? `<p>Sesión de <span class="app">${esc(opts.actorName)}</span>.</p>`
    : "";

  const campaniaOptions = opts.campanias
    .map((c) => {
      const selected =
        opts.selectedCampania && opts.selectedCampania === c.idCampania ? " selected" : "";
      return `<option value="${c.idCampania}"${selected}>${esc(c.nombre)} (${c.idCampania})</option>`;
    })
    .join("\n        ");

  const comercios = opts.comercios ?? [];
  const comercioOptions =
    comercios.length === 0
      ? `<option value="">Seleccioná una campaña primero</option>`
      : comercios
          .map(
            (c) =>
              `<option value="${c.idComercio}">${esc(c.nombre)} (${c.idComercio})</option>`
          )
          .join("\n        ");

  const canSubmit = comercios.length > 0;
  // Solo IDs opacos: las campañas viven en memoria del gateway (pending_id).
  // No reenviar campanias_json (superadmins tienen cientos → Payload Too Large).
  const sharedSelectHidden = {
    step: "select",
    pending_id: opts.pendingId,
  };
  const showFilter = opts.campanias.length > 12;
  const filterHtml = showFilter
    ? `<label for="campania-filter">Buscar campaña</label>
    <input id="campania-filter" type="text" placeholder="Nombre o ID…" autocomplete="off" />`
    : "";

  sendHtml(
    res,
    shell({
      title: "WIBI — Elegir comercio",
      status,
      body: `<div class="card" style="padding:0;background:transparent;box-shadow:none">
  <form method="post" action="/oauth/approve" id="campania-form">
    <div class="brand">WIBI</div>
    <h1>Elegí campaña y comercio</h1>
    <p><span class="app">${clientName}</span> operará dentro del comercio que elijas.</p>
    ${actorHtml}
    ${errorHtml}
    ${filterHtml}
    <label for="idCampania">Campaña</label>
    <select id="idCampania" name="idCampania" required size="${showFilter ? 8 : 1}">
      <option value="">— Seleccionar —</option>
      ${campaniaOptions}
    </select>
    ${hiddenFields(opts.oauth, {
      ...sharedSelectHidden,
      action: "load_comercios",
    })}
    <button type="submit" class="secondary" id="load-comercios">Cargar comercios</button>
  </form>
  <form method="post" action="/oauth/approve" id="select-form" style="margin-top:12px">
    <label for="idComercio">Comercio</label>
    <select id="idComercio" name="idComercio" ${canSubmit ? "required" : "disabled"}>
      ${comercioOptions}
    </select>
    ${hiddenFields(opts.oauth, {
      ...sharedSelectHidden,
      idCampania: opts.selectedCampania ? String(opts.selectedCampania) : undefined,
    })}
    <button type="submit" id="select-submit" ${canSubmit ? "" : "disabled"}>Continuar</button>
  </form>
  </div>
  ${disableSubmitScript("campania-form", "load-comercios", "Cargando…")}
  ${disableSubmitScript("select-form", "select-submit", "Conectando…")}
  <script>
    (function () {
      var campania = document.getElementById("idCampania");
      var selectForm = document.getElementById("select-form");
      var filter = document.getElementById("campania-filter");
      if (!campania || !selectForm) return;
      campania.addEventListener("change", function () {
        var hidden = selectForm.querySelector('input[name="idCampania"]');
        if (hidden) hidden.value = campania.value || "";
      });
      if (filter) {
        filter.addEventListener("input", function () {
          var q = (filter.value || "").toLowerCase().trim();
          var opts = campania.options;
          for (var i = 0; i < opts.length; i++) {
            var opt = opts[i];
            if (!opt.value) { opt.hidden = false; continue; }
            opt.hidden = q ? opt.text.toLowerCase().indexOf(q) === -1 : false;
          }
        });
      }
    })();
  </script>`,
    })
  );
}
