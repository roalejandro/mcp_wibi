# Plan de Deploy y Pruebas — WIBI MCP Gateway

**Objetivo:** Conectar Claude/Cursor al CRM WIBI mediante el MCP Gateway, probando con la campaña **Farmacia TEST** en producción, y dejar el repositorio publicado en GitHub para uso futuro.

---

## Estado actual (actualizado 30/05/2026)

| Componente | Estado |
|---|---|
| `WS_CRM_Laravel` — API v2 | ✅ Desarrollada en local — **pendiente commit y deploy** |
| `wibi-mcp-gateway` | ✅ Compilado (`dist/`), con `node_modules/` — **pendiente git init y push** |
| Servidor PlexCRM | `191.234.207.236` (Apache) — PlexCRM PHP puro |
| Servidor Laravel API | `68.211.72.112` — `https://apiv2.wibi.com.ar` (nginx, sin acceso SSH todavía) |
| Base de datos | Azure MySQL: `server-db-wibi.mysql.database.azure.com` — **ya consultada** |

---

## FASE 0 — Datos de producción ✅ COMPLETADA

### Servidor Laravel en producción
- **URL**: `https://apiv2.wibi.com.ar/onzecrm`
- **IP**: `68.211.72.112` (nginx/1.24.0 Ubuntu)
- **API v1**: ✅ Funcionando
- **API v2 (`/onzecrm/v2/`)**: ❌ Devuelve 403 — pendiente deploy

### Credenciales Farmacia TEST (extraídas de BD de producción)

| Campo | Valor |
|---|---|
| **IdComercio** | `101` |
| **NombreComercio** | `Comercio Test` |
| **Red** | `18394` — "RED Farmacia TEST" |
| **Campaña** | `13793` — "Campaña Farmacia TEST" |
| **Usuario** | `wstest` |
| **Clave** | `test123` |
| **API Key (WFARMA)** | `ulHi0gT42tet0wmAcM3Avk3MpQ5RvaIcLpI9Osx8Fs6yfydYldDVcSr4x7aV1DFU` |
| **approl** | `1` (COMERCIO) |

### Repositorio del Laravel
- **GitHub**: `https://github.com/roalejandro/WS_CRM_Laravel.git`
- **Deploy**: Se necesita SSH al servidor `68.211.72.112` para hacer `git pull`

---

## FASE 1 — Subir `wibi-mcp-gateway` a GitHub

- [x] **1.1** ✅ Primer commit hecho localmente
- [ ] **1.2** Crear repo privado en github.com → nombre: `wibi-mcp-gateway`
- [ ] **1.3** Push a GitHub (Fabrizzio debe ejecutar):

```bash
cd /Users/fabrizzioconiglio/Documents/GitHub/wibi-mcp-gateway
git remote add origin https://github.com/fabrizzioconiglio/wibi-mcp-gateway.git
git branch -M main
git push -u origin main
```

> El repo debe ser **privado**: aunque `.env` no se sube, el `README.md` revela la arquitectura interna.

---

## FASE 2 — Commitear los cambios del API v2 en `WS_CRM_Laravel`

- [x] **2.1** ✅ Commit hecho localmente
- [ ] **2.2** Push a GitHub → `github.com/roalejandro/WS_CRM_Laravel` (requiere permisos de push)

```bash
cd /Users/fabrizzioconiglio/Documents/GitHub/WS_CRM_Laravel
git push origin main
```

---

## FASE 3 — Desplegar API v2 en el servidor del Laravel

- **Servidor**: `68.211.72.112` / `https://apiv2.wibi.com.ar`
- **Acceso SSH**: ❌ No disponible todavía — Fabrizzio debe proveer la clave SSH o usuario/pass

### Opción A — Si el servidor tiene git y acceso SSH:
```bash
ssh USUARIO@68.211.72.112
cd /ruta/del/proyecto/WS_CRM_Laravel
git pull origin main
php artisan config:clear
php artisan route:clear
php artisan cache:clear
```

### Opción B — Deploy manual por SCP (si no hay git en el server):
```bash
# Reemplazar USUARIO y CLAVE con los datos reales del servidor 68.211.72.112
scp -i ~/.ssh/CLAVE_SERVIDOR \
  app/Http/Middleware/AuthMiddleware.php \
  app/Services/ApiService.php \
  app/Services/ClientService.php \
  app/Services/SubscriptionService.php \
  routes/web.php \
  USUARIO@68.211.72.112:/ruta/proyecto/

scp -i ~/.ssh/CLAVE_SERVIDOR -r \
  app/Exceptions/ \
  app/Services/CampaignScopeService.php \
  app/Services/DifusionService.php \
  app/Services/Query/ \
  app/Http/Controllers/Api/V2/ \
  USUARIO@68.211.72.112:/ruta/proyecto/
```

- [ ] **3.1** Conseguir acceso SSH al servidor `68.211.72.112`
- [ ] **3.2** Subir archivos y limpiar caché
- [ ] **3.3** Verificar con:

```bash
curl -s -X POST https://apiv2.wibi.com.ar/onzecrm/v2/token \
  -H "api-key: ulHi0gT42tet0wmAcM3Avk3MpQ5RvaIcLpI9Osx8Fs6yfydYldDVcSr4x7aV1DFU" \
  -H "Content-Type: application/json" \
  -d '{"user":"wstest","password":"test123"}'
```

Si devuelve `{"token":"eyJ..."}` → API v2 funcionando.

---

## FASE 4 — Configurar el gateway localmente

```bash
cd /Users/fabrizzioconiglio/Documents/GitHub/wibi-mcp-gateway
cp .env.example .env
```

Editar `.env` con las credenciales **reales** de Farmacia TEST:

```env
WIBI_API_URL=https://apiv2.wibi.com.ar
WIBI_API_KEY=ulHi0gT42tet0wmAcM3Avk3MpQ5RvaIcLpI9Osx8Fs6yfydYldDVcSr4x7aV1DFU
WIBI_USERNAME=wstest
WIBI_PASSWORD=test123
```

- [ ] **4.1** Crear `.env` con las credenciales reales de Farmacia TEST (depende de FASE 3)

---

## FASE 5 — Integrar el gateway en Cursor

Editar `~/.cursor/mcp.json` (o Settings → MCP → Add Server):

```json
{
  "mcpServers": {
    "wibi-farmacia-test": {
      "command": "node",
      "args": ["/Users/fabrizzioconiglio/Documents/GitHub/wibi-mcp-gateway/dist/server.js"],
      "env": {
        "WIBI_API_URL": "https://apiv2.wibi.com.ar",
        "WIBI_API_KEY": "ulHi0gT42tet0wmAcM3Avk3MpQ5RvaIcLpI9Osx8Fs6yfydYldDVcSr4x7aV1DFU",
        "WIBI_USERNAME": "wstest",
        "WIBI_PASSWORD": "test123"
      }
    }
  }
}
```

- [ ] **5.1** Agregar la config en `mcp.json` (depende de FASE 3)
- [ ] **5.2** Reiniciar Cursor
- [ ] **5.3** Verificar que aparecen las tools `wibi_*` en el panel MCP de Cursor

---

## FASE 6 — Pruebas con Farmacia TEST

### Pruebas de LECTURA (sin riesgo)

**6.1 — Catálogo (más básica)**
> "Listame los productos disponibles para la Farmacia TEST"

→ Llama `wibi_listar_productos` → si devuelve lista, auth y scope OK.

**6.2 — Movimientos**
> "Mostrame los últimos 10 movimientos"

→ Llama `wibi_listar_movimientos`

**6.3 — Búsqueda de clientes**
> "Buscame un cliente con el nombre Juan"

→ Llama `wibi_buscar_clientes`

**6.4 — Comportamiento de cliente**
> "Mostrame el comportamiento del cliente con tarjeta XXXX"

→ Llama `wibi_comportamiento_cliente`

**6.5 — Cupones**
> "Listame los cupones disponibles"

→ Llama `wibi_listar_cupones`

### Pruebas de ESCRITURA (con precaución)

**6.6 — Crear plantilla WhatsApp (bajo riesgo)**
> "Creá una plantilla de WhatsApp de prueba llamada 'TEST_MCP_01' con el texto 'Hola {{1}}, esto es una prueba del MCP'"

→ Verificar en BD que `IdComercio` = el de Farmacia TEST (aislamiento OK).

**6.7 — Suscripción de prueba (si hay productos de prueba)**
> "Creá un tipo de alerta de prueba para la Farmacia TEST"

→ Verificar en BD que quedó asociado al comercio correcto.

---

## FASE 7 — Validación final del aislamiento de campaña

Confirmar que el gateway **NO devuelve datos de otras campañas**:

```bash
# Con las credenciales de Farmacia TEST, llamar a movimientos
# El resultado NO debe incluir IdComercio de otros comercios
curl -H "Authorization: Bearer TOKEN" \
     -H "api-key: API_KEY_FARMACIA" \
     https://TU-SERVIDOR-LARAVEL.com/onzecrm/v2/movimientos

# Verificar que todos los resultados son de la campaña de Farmacia TEST
```

---

## Orden de ejecución — Estado actual

```
✅ FASE 0 — Datos de producción obtenidos (30/05/2026)
            URL: https://apiv2.wibi.com.ar/onzecrm
            Farmacia TEST: wstest / test123 / IdComercio=101 / Campaña=13793
            API Key WFARMA: ulHi0gT42tet0wmAcM3Avk3MpQ5RvaIcLpI9Osx8Fs6yfydYldDVcSr4x7aV1DFU

✅ FASE 1 — wibi-mcp-gateway: commit local hecho
            ⬜ Pendiente: Fabrizzio crea repo en GitHub y hace push

✅ FASE 2 — WS_CRM_Laravel: commit local hecho
            ⬜ Pendiente: push a github.com/roalejandro/WS_CRM_Laravel

⬜ FASE 3 — Deploy API v2 en 68.211.72.112
            ⬜ Pendiente: SSH al servidor (pedir clave a responsable) + git pull + artisan clear

⬜ FASE 4 — Configurar .env del gateway (datos ya disponibles arriba)
⬜ FASE 5 — Integrar en Cursor mcp.json (datos ya disponibles arriba)
⬜ FASE 6 — Pruebas con Farmacia TEST
⬜ FASE 7 — Validar aislamiento de campaña
```

---

## Pendientes — Acciones de Fabrizzio

1. **Crear repo privado** en GitHub → nombre: `wibi-mcp-gateway` → hacer push
2. **Push** de `WS_CRM_Laravel` a `github.com/roalejandro`
3. **Conseguir acceso SSH** al servidor `68.211.72.112` (nginx, Ubuntu) para hacer `git pull` y `php artisan clear`

---

*Última actualización: 30/05/2026*
