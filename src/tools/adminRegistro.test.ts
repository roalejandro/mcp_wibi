import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WibiClient } from "../wibiClient.js";
import { CONTRATOS_ADMIN, NOMBRES_ADMIN, debeRegistrar, permisosAdmin } from "./adminShared.js";
import { registerPanelClientesTools } from "./panelClientes.js";
import { registerPanelMovimientosTools } from "./panelMovimientos.js";
import { registerPanelCatalogoTools } from "./panelCatalogo.js";
import { registerPanelOperacionTools } from "./panelOperacion.js";
import { registerTagsAdminTools } from "./tags.js";
import { registerDifusionesAdminTools } from "./difusiones.js";
import { registerSuscripcionesAdminTools } from "./suscripciones.js";
import { registrarHerramientasAdmin } from "../server.js";

type Handler = (args: Record<string, unknown>) => Promise<unknown>;

function servidor(): { names: string[]; handlers: Record<string, Handler>; server: McpServer } {
  const names: string[] = [];
  const handlers: Record<string, Handler> = {};
  const server = {
    registerTool(name: string, _config: unknown, handler: Handler) {
      names.push(name);
      handlers[name] = handler;
    },
  } as unknown as McpServer;
  return { names, handlers, server };
}

const cliente = { defaultCampania: 13793 } as WibiClient;

describe("matriz administrativa", () => {
  it("cada contrato tiene herramienta, permiso y las herramientas registradas coinciden", () => {
    const { names, server } = servidor();
    registerPanelClientesTools(server, cliente);
    registerPanelMovimientosTools(server, cliente);
    registerPanelCatalogoTools(server, cliente);
    registerTagsAdminTools(server, cliente);
    registerDifusionesAdminTools(server, cliente);
    registerSuscripcionesAdminTools(server, cliente);
    registerPanelOperacionTools(server, cliente);

    const contratos = CONTRATOS_ADMIN.map((contrato) => contrato.name).sort();
    assert.equal(new Set(contratos).size, contratos.length);
    assert.deepEqual(names.sort(), contratos);
    for (const contrato of CONTRATOS_ADMIN) {
      assert.equal(permisosAdmin()[contrato.name][0], contrato.permission[0]);
      assert.equal(permisosAdmin()[contrato.name][1], contrato.permission[1]);
      assert.equal(permisosAdmin()[contrato.name][2], contrato.permission[2]);
      assert.ok(contrato.path.length > 0);
      assert.ok(contrato.method);
    }
  });

  it("un nombre admin sin mapeo no se registra y nuevo no se confunde con insertar", () => {
    assert.equal(debeRegistrar("wibi_alta_cliente", { "campania.clientes": ["insertar"] }, undefined), false);
    assert.equal(debeRegistrar("wibi_buscar_clientes", undefined, undefined), true);
    assert.equal(
      debeRegistrar("wibi_alta_cupon", { "campania.cupones": ["insertar"] }, ["campania", "cupones", "nuevo"]),
      false
    );
    assert.equal(
      debeRegistrar("wibi_alta_cupon", { "*": ["acceso"] }, ["campania", "cupones", "nuevo"]),
      true
    );
    assert.equal(
      debeRegistrar("wibi_estado_cliente", { "campania.clientes": ["modificar"] }, ["campania", "clientes", "desactivar"]),
      true
    );
    assert.equal(
      debeRegistrar("wibi_estado_export_tarea", { "campania.movimientos": ["exportar"] }, ["campania", "clientes", "exportar"]),
      true
    );
    assert.equal(NOMBRES_ADMIN.has("wibi_exportar_clientes"), false);
  });

  it("sin actor no registra el panel y con actor sí", () => {
    const vacio = servidor();
    registrarHerramientasAdmin(vacio.server, cliente, {});
    assert.deepEqual(vacio.names, []);

    const completo = servidor();
    registrarHerramientasAdmin(completo.server, cliente, {
      actor: { tipo: "admin", idUsuario: 1, nombre: "Admin", rol: "A" },
    });
    assert.ok(completo.names.includes("wibi_portal_ver"));
    for (const nombre of CONTRATOS_ADMIN.map((contrato) => contrato.name)) {
      assert.ok(completo.names.includes(nombre), nombre);
    }
  });

  it("etiquetas, difusiones y suscripciones pegan en la ruta del contrato", async () => {
    const calls: Array<{ method: string; path: string; body?: unknown; query?: Record<string, unknown> }> = [];
    const handlers: Record<string, Handler> = {};
    const client = {
      defaultCampania: 13793,
      get: async (path: string, query?: Record<string, unknown>) => {
        calls.push({ method: "GET", path, query });
        return { ok: true };
      },
      post: async (path: string, body?: unknown, query?: Record<string, unknown>) => {
        calls.push({ method: "POST", path, body, query });
        return { ok: true };
      },
      patch: async (path: string, body?: unknown, query?: Record<string, unknown>) => {
        calls.push({ method: "PATCH", path, body, query });
        return { ok: true };
      },
      delete: async (path: string, query?: Record<string, unknown>) => {
        calls.push({ method: "DELETE", path, query });
        return { ok: true };
      },
    } as unknown as WibiClient;
    const server = {
      registerTool(name: string, _config: unknown, handler: Handler) {
        handlers[name] = handler;
      },
    } as unknown as McpServer;
    registerTagsAdminTools(server, client);
    registerDifusionesAdminTools(server, client);
    registerSuscripcionesAdminTools(server, client);

    await handlers.wibi_eliminar_tag({ idCampania: 13793, idTag: 5 });
    await handlers.wibi_grilla_difusiones({ idCampania: 13793 });
    await handlers.wibi_audiencia_difusion({ idCampania: 13793, tags: [1, 2], soloSuscriptos: true });
    await handlers.wibi_pausar_difusion({ idCampania: 13793, id: 8 });
    await handlers.wibi_eliminar_difusion({ idCampania: 13793, id: 8 });
    await handlers.wibi_pausar_detalle_difusion({ idCampania: 13793, id: 15 });
    await handlers.wibi_grilla_suscripciones({ idCampania: 13793 });
    await handlers.wibi_listar_tipos_alerta({ idCampania: 13793 });
    await handlers.wibi_detalle_suscripcion({ idCampania: 13793, idSuscripcion: 4 });
    await handlers.wibi_estado_suscripcion({ idCampania: 13793, idSuscripcion: 4, activo: true });
    await handlers.wibi_eliminar_suscripcion({ idCampania: 13793, idSuscripcion: 4 });
    await handlers.wibi_grilla_tipos_alerta({ idCampania: 13793 });
    await handlers.wibi_guardar_tipo_alerta({ idCampania: 13793, nombre: "Crónico", operationId: "op-alerta" });

    assert.deepEqual(calls.map((c) => `${c.method} ${c.path}`), [
      "DELETE tags/5",
      "GET difusiones/grilla",
      "GET difusiones/audiencia",
      "POST difusiones/8/pausar",
      "DELETE difusiones/8",
      "POST difusiones/detalles/15/pausar",
      "GET suscripciones/grilla",
      "GET suscripciones/tipos-alerta",
      "GET suscripciones/4",
      "PATCH suscripciones/4/estado",
      "DELETE suscripciones/4",
      "GET tipos-alerta/grilla",
      "POST tipos-alerta/guardar",
    ]);
    assert.deepEqual(calls[2].query?.tags, [1, 2]);
    assert.equal(calls[2].query?.soloSuscriptos, "1");
    assert.equal((calls[12].body as { operation_id: string }).operation_id, "op-alerta");
    assert.equal(calls[0].query?.idCampania, 13793);
  });
});
