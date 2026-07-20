# WIBI MCP Gateway

Servidor **MCP (Model Context Protocol)** que conecta Claude (u otro cliente MCP) con el CRM **WIBI** a través de su **API v2 JSON** (`WS_CRM_Laravel`).

El Gateway se autentica con las credenciales de **un comercio** y expone herramientas para consultar informes y ejecutar acciones (difusiones, suscripciones). Todos los datos quedan **acotados a la(s) campaña(s) de la red del comercio**: el `IdComercio` se deriva del token, nunca se acepta como parámetro, y el API v2 valida la pertenencia de cada `IdCampania` antes de responder.

## Requisitos

- Node.js >= 18
- Una `api-key` registrada en la tabla `aplicaciones` de WIBI con `approl` 1 (COMERCIO) o 3 (COMERCIO_WEB)
- Usuario/clave de un comercio (tabla `comercios`)

## Instalación

> Nota de seguridad: para mitigar ataques de cadena de suministro de npm, se
> recomienda instalar con `--ignore-scripts` (evita ejecutar scripts post-install).

```bash
cp .env.example .env   # completar credenciales
npm install --ignore-scripts   # primera vez (genera package-lock.json)
# luego, para instalaciones reproducibles: npm ci --ignore-scripts
npm run build
```

## Configuración (.env)

| Variable | Descripción |
| --- | --- |
| `WIBI_BASE_URL` | URL base del API (ej. `https://apiv2.wibi.com.ar`) |
| `WIBI_API_KEY` | API key de la aplicación integradora |
| `WIBI_USER` | Usuario del comercio |
| `WIBI_PASS` | Clave del comercio |
| `WIBI_DEFAULT_CAMPANIA` | (Opcional) campaña por defecto si el comercio opera varias |
| `MCP_TRANSPORT` | `stdio` (default, local) o `http` (Docker / remoto) |
| `MCP_HTTP_PORT` | Puerto HTTP (default `3939`, solo si `MCP_TRANSPORT=http`) |
| `MCP_HTTP_TOKEN` | Bearer token para autenticar clientes remotos (solo HTTP) |

## Uso local con Agentes (stdio)

Agregar al archivo de configuración MCP del cliente:

```json
{
  "mcpServers": {
    "wibi": {
      "command": "node",
      "args": ["/ruta/a/wibi-mcp-gateway/dist/server.js"],
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

## Uso remoto (HTTP + Bearer)

Cuando el gateway corre en Docker detrás de Apache:

```json
{
  "mcpServers": {
    "wibi-team": {
      "url": "https://wibi.com.ar/mcp",
      "headers": {
        "Authorization": "Bearer <MCP_HTTP_TOKEN>"
      }
    }
  }
}
```

Notas:
- Todos los clientes que usen este endpoint remoto operan con la **misma identidad WIBI** (`WIBI_USER`/`WIBI_PASS` del `.env` del servidor). No hay separación por usuario ni comercio.
- El token se comparte por un canal seguro (no en chats públicos).

## Deploy en producción (Docker + Apache)

### Build y run local con Docker

```bash
cp .env.example .env   # completar WIBI_* + MCP_HTTP_TOKEN
# En .env:
# MCP_TRANSPORT=http
# MCP_HTTP_PORT=3939
# MCP_HTTP_TOKEN=<openssl rand -hex 32>

docker compose build
docker compose up -d
curl http://127.0.0.1:3939/health
```

El contenedor escucha en `0.0.0.0:3939` adentro, pero `docker-compose.yml` publica solo `127.0.0.1:3939` en el host.

### Reverse proxy Apache (ejemplo en `wibi.com.ar`)

```apache
ProxyPreserveHost On
ProxyPass /mcp http://127.0.0.1:3939/mcp
ProxyPassReverse /mcp http://127.0.0.1:3939/mcp
```

Habilitar módulos y recargar:

```bash
sudo a2enmod proxy proxy_http headers
sudo apache2ctl configtest
sudo systemctl reload apache2
```

Rutas del servicio:
- `GET /health` — sin autenticación (healthcheck)
- `POST /mcp` — requiere `Authorization: Bearer <MCP_HTTP_TOKEN>`

## Herramientas disponibles

### Fase 1 — Informes y comportamiento (solo lectura)

| Herramienta | Endpoint v2 | Descripción |
| --- | --- | --- |
| `wibi_listar_movimientos` | `GET /movimientos` | Movimientos de la campaña con filtros |
| `wibi_detalle_movimiento` | `GET /movimientos/{id}` | Detalle (productos, premios) |
| `wibi_buscar_clientes` | `GET /clientes` | Búsqueda/listado de clientes |
| `wibi_cliente_comportamiento` | `GET /clientes/{id}/comportamiento` | Ventas, puntos, canjes y saldo |
| `wibi_analisis_clientes` | `GET /analisis-clientes` | Definiciones de análisis (metadata) |
| `wibi_listar_productos` | `GET /productos` | Catálogo de la red |
| `wibi_listar_clasificadores` | `GET /clasificadores` | Clasificadores de la red |
| `wibi_listar_marcas` | `GET /marcas` | Marcas del catálogo |
| `wibi_listar_segmentos` | `GET /segmentos` | Grupos de interés de la campaña |
| `wibi_listar_tags` | `GET /tags` | Etiquetas de la campaña |
| `wibi_listar_cupones` | `GET /cupones` | Cupones de la campaña |
| `wibi_detalle_cupon` | `GET /cupones/{id}` | Cupón + condiciones + usos |

### Fase 2 — Difusiones y suscripciones (acciones)

| Herramienta | Endpoint v2 | Descripción |
| --- | --- | --- |
| `wibi_asignar_tags` | `POST /difusiones/tags` | Clasificar clientes con tags |
| `wibi_crear_plantilla_whatsapp` | `POST /difusiones/plantillas/whatsapp` | Registrar plantilla WhatsApp |
| `wibi_crear_plantilla_email` | `POST /difusiones/plantillas/email` | Crear plantilla de email |
| `wibi_programar_difusion` | `POST /difusiones` | Programar una difusión |
| `wibi_consultar_difusiones` | `GET /difusiones` | Listar difusiones |
| `wibi_detalle_difusion` | `GET /difusiones/{id}` | Detalle + métricas |
| `wibi_crear_tipo_alerta` | `POST /suscripciones/tipos-alerta` | Crear tipo de alerta |
| `wibi_crear_suscripcion` | `POST /suscripciones` | Crear suscripción |
| `wibi_consultar_suscripciones` | `GET /suscripciones` | Listar suscripciones |

## Aislamiento por campaña

- El `IdComercio` se toma del JWT emitido por WIBI; el Gateway nunca lo recibe como input.
- Cada herramienta acepta `idCampania` opcional. Si el comercio opera una sola campaña, el API la resuelve automáticamente; si opera varias, es obligatorio y el API rechaza campañas que no pertenezcan a la red del comercio (`CampaignScopeService`).
- Productos y clasificadores se modelan a nivel de **red**; si dos campañas comparten red, comparten catálogo por diseño del CRM.

## Flujo de autenticación

```
POST /onzecrm/token  (api-key + XML auth/user/pass)  ->  JWT
GET/POST /onzecrm/v2/* (Authorization: Bearer + api-key)  ->  JSON
```

El cliente cachea el JWT y lo renueva automáticamente; ante expiración reintenta una vez.

## Seguridad de dependencias

- Dependencias mínimas y oficiales: `@modelcontextprotocol/sdk`, `zod`, `fast-xml-parser`.
- Instalar siempre con `--ignore-scripts` y, tras el primer install, usar `npm ci` con el `package-lock.json`.
- Ejecutar `npm audit` periódicamente.
