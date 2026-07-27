# WIBI MCP Gateway

Servidor [MCP (Model Context Protocol)](https://modelcontextprotocol.io) que expone la **API v2 de WIBI** como herramientas para asistentes LLM.

Soporta dos modos:

| Modo | Para quién | Cómo se autentica |
|---|---|---|
| **HTTP + OAuth 2.1** (producción) | Comercios o admins del panel WIBI vía **claude.ai / Claude Desktop** | Login con usuario/clave de **comercio** o de **admin del panel**; los admins eligen campaña/comercio (y OTP si el 2FA está activo) |
| **stdio** (desarrollo) | Equipo técnico / Cursor local | Variables `WIBI_USER` / `WIBI_PASS` en el entorno |

---

## Guía para el cliente final (comercio WIBI)

No hace falta ser desarrollador ni editar archivos JSON.

### Claude web (claude.ai)

1. Entrá a [claude.ai](https://claude.ai) con tu cuenta.
2. Andá a **Settings → Connectors → Add custom connector**.
3. Pegá la URL del servidor: `https://wibi.com.ar/mcp` *(URL temporal de prueba; ver nota DNS abajo)*.
4. Claude abre la pantalla de login de WIBI en el navegador.
5. Ingresá el **usuario y la contraseña WIBI**:
   - **Comercio:** los mismos datos del comercio en el sistema → acceso directo.
   - **Admin del panel:** usuario del panel WIBI (no el del comercio). Si la campaña tiene 2FA, te pide el código del email. Después elegís **campaña** y **comercio** con el mismo alcance que en el panel (admin ve sus campañas/comercios; superadmin ve todas).
6. Autorizá. Ya podés pedirle a Claude cosas como:
   - “Listame los productos de mi campaña”
   - “Buscá el cliente con DNI …”
   - “¿Cuáles son mis campañas?”

Cada sesión opera **solo sobre el comercio elegido**. No hay tokens compartidos ni configuración por cliente.

### Claude Desktop

1. Abrí Claude Desktop → Settings → Connectors (o Developers, según la versión).
2. Agregá un conector remoto con la URL `https://wibi.com.ar/mcp` *(temporal; ver nota DNS)*.
3. Completá el login en el navegador con tu usuario/clave WIBI.

---

## Guía técnica (equipo interno)

### Requisitos

- Node.js >= 18
- API key de aplicación WIBI (`approl` 1 o 3)
- API v2 desplegada (incluye `/onzecrm/v2/auth/*` y `/onzecrm/v2/campanias`)

### Instalación

```bash
cd wibi-mcp-gateway
npm install --ignore-scripts
npm run build
```

### Modo stdio (local)

```bash
export WIBI_BASE_URL=https://apiv2.wibi.com.ar
export WIBI_API_KEY=...
export WIBI_USER=...
export WIBI_PASS=...
# opcional:
# export WIBI_DEFAULT_CAMPANIA=13793
node dist/index.js
```

Ejemplo de `mcp.json` (solo para desarrollo local):

```json
{
  "mcpServers": {
    "wibi-local": {
      "command": "node",
      "args": ["/ruta/a/wibi-mcp-gateway/dist/index.js"],
      "env": {
        "WIBI_BASE_URL": "https://apiv2.wibi.com.ar",
        "WIBI_API_KEY": "...",
        "WIBI_USER": "...",
        "WIBI_PASS": "..."
      }
    }
  }
}
```

### Modo HTTP + OAuth (producción)

Variables mínimas:

| Variable | Descripción |
|---|---|
| `WIBI_BASE_URL` | URL de la API (`https://apiv2.wibi.com.ar`) |
| `WIBI_API_KEY` | API key de la aplicación integradora |
| `WIBI_PUBLIC_URL` | URL pública HTTPS del gateway (hoy `https://wibi.com.ar`; objetivo `https://mcp.wibi.com.ar`) |
| `MCP_TRANSPORT` | `http` |
| `WIBI_HTTP_PORT` | Puerto interno (default `3939`) |

**No** configurar `WIBI_USER`, `WIBI_PASS` ni `MCP_HTTP_TOKEN` en este modo: el login es interactivo (comercio o admin del panel).

```bash
MCP_TRANSPORT=http \
WIBI_BASE_URL=https://apiv2.wibi.com.ar \
WIBI_API_KEY=... \
WIBI_PUBLIC_URL=https://wibi.com.ar \
node dist/index.js --http
```

Endpoints:

- `GET /healthz` — healthcheck
- `GET /.well-known/oauth-authorization-server` — metadata OAuth
- `POST /register` — Dynamic Client Registration
- `GET /authorize` — pantalla de login
- `POST /oauth/approve` — login multi-paso (credenciales → OTP opcional → selector campaña/comercio)
- `POST /token` — intercambia code / refresh
- `POST|GET|DELETE /mcp` — MCP Streamable HTTP (Bearer OAuth)

API Laravel usada por el login OAuth:

- `POST /onzecrm/v2/auth/login`
- `POST /onzecrm/v2/auth/verify-otp` / `resend-otp`
- `POST /onzecrm/v2/auth/scoped-comercios` / `select-scope`
- `POST /onzecrm/v2/auth/refresh` / `revoke`

### Docker

```bash
cp .env.example .env   # completar WIBI_BASE_URL, WIBI_API_KEY, WIBI_PUBLIC_URL
docker compose up -d --build
curl http://127.0.0.1:3939/healthz
```

### DNS / certificado

**Acción requerida (Quien tenga acceso DonWeb):** crear registro DNS:

| Tipo | Host | Valor |
|---|---|---|
| A | `mcp` (`mcp.wibi.com.ar`) | `191.234.207.236` |

Cuando exista el DNS, puedo:
1. Emitir certificado Let's Encrypt (`certbot --apache -d mcp.wibi.com.ar`)
2. Crear vhost dedicado que proxee **toda** la raíz al contenedor (`127.0.0.1:3939`)
3. Cambiar `WIBI_PUBLIC_URL=https://mcp.wibi.com.ar` y recrear el contenedor
4. Quitar del vhost `wibi.com.ar` los `ProxyPass` temporales de OAuth (`/authorize`, `/token`, `/register`, etc.)

**Workaround actual (solo prueba):** OAuth se publica en `https://wibi.com.ar` con el certificado comercial existente, proxeando rutas OAuth + `/mcp` al contenedor. No es el diseño final.

Notas:

- Estado OAuth/MCP en memoria → una sola réplica. Un reinicio puede exigir volver a loguearse.
- HTTPS obligatorio (las credenciales viajan por el formulario).
- El gateway nunca guarda usuario/clave del comercio; solo JWT corto + refresh token opaco en memoria.

### Arquitectura de sesión

```
claude.ai → OAuth (login comercio o admin) → access token MCP
         → /mcp (Bearer) → WibiClient con JWT del comercio
         → API v2 Laravel (scope por IdComercio / IdRed / idCampania)
```

Si entra un **admin del panel**, el JWT final sigue siendo del **comercio seleccionado** (mismo alcance v2). El actor real (`actor_id` / `actor_name` / `actor_role`) viaja en el JWT y en los logs de escritura para auditoría.

Cuando el JWT WIBI está por vencer, el gateway lo renueva con `POST /onzecrm/v2/auth/refresh` (sin volver a pedir la clave).

---

## Herramientas principales

- Informes: movimientos, clientes, productos, clasificadores, marcas, segmentos, tags, cupones
- Comportamiento: resumen del cliente, análisis de clientes
- Difusiones: tags, plantillas WhatsApp, programar/consultar
- Suscripciones: tipos de alerta, crear/consultar
- En modo OAuth: `wibi_mis_campanias`

La tool de plantilla de email está deshabilitada hasta que exista el endpoint Laravel correspondiente.

---

## Seguridad

- Aislamiento por comercio: cada sesión MCP queda ligada al `sessionId` OAuth + `IdComercio` del login.
- Escrituras en Laravel validan clientes/tags/alertas contra el scope del token.
- Rate limit en `/oauth/approve` y `/mcp`.
- `Cache-Control: no-store`, `X-Frame-Options: DENY`, CSP en la página de login.
