import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WibiClient } from "../wibiClient.js";
import { registerPanelOperacionTools } from "./panelOperacion.js";

type Call = { method: string; path: string; body?: Record<string, unknown>; query?: Record<string, unknown> };
type Handler = (args: Record<string, unknown>) => Promise<{ isError?: boolean; content: Array<{ text: string }> }>;

function setup(permisos?: Record<string, string[]>) {
  const calls: Call[] = [];
  const handlers: Record<string, Handler> = {};
  const annotations: Record<string, Record<string, boolean>> = {};
  const client = {
    defaultCampania: 13793,
    get: async (path: string, query?: Record<string, unknown>) => {
      calls.push({ method: "GET", path, query });
      return { ok: true };
    },
    post: async (path: string, body?: Record<string, unknown>, query?: Record<string, unknown>) => {
      calls.push({ method: "POST", path, body, query });
      return { ok: true, clave: "no-mostrar", pass: "no-mostrar", token: "no-mostrar" };
    },
    getBinary: async (path: string, query?: Record<string, unknown>) => {
      calls.push({ method: "GET", path, query });
      return { contentType: "text/csv", base64: "YQ==", filename: "tarea.csv" };
    },
  } as unknown as WibiClient;
  const server = {
    registerTool(name: string, config: { annotations?: Record<string, boolean> }, handler: Handler) {
      handlers[name] = handler;
      annotations[name] = config.annotations ?? {};
    },
  } as unknown as McpServer;
  registerPanelOperacionTools(server, client, permisos);
  return { handlers, annotations, calls };
}

describe("operación del panel", () => {
  it("cubre cupones, comercios, usuarios, flujos y el envío individual", async () => {
    const { handlers, annotations, calls } = setup();
    await handlers.wibi_grilla_cupones({});
    await handlers.wibi_alta_cupon({
      codigo: "PROMO",
      tipo: "importe",
      valor: 100,
      desde: "2026-11-01",
      hasta: "2026-11-30",
    });
    await handlers.wibi_editar_cupon({ idCupon: 4, descripcion: "Promo", hasta: "2026-12-01" });
    await handlers.wibi_eliminar_cupon({ idCupon: 4 });
    await handlers.wibi_activar_cupon({ idCupon: 4 });
    await handlers.wibi_asignar_cupon({ idCupon: 4, idCliente: 9 });
    await handlers.wibi_desasignar_cupon({ idCupon: 4, idCliente: 9 });
    await handlers.wibi_validar_cupon({ codigo: "PROMO" });
    await handlers.wibi_usar_cupon({ idCupon: 4, idCliente: 9 });
    const comercio = await handlers.wibi_alta_comercio({
      codigo: 10,
      idRed: 2,
      nombre: "Sucursal",
      usuario: "caja",
      clave: "clave-comercio",
      activo: false,
    });
    await handlers.wibi_editar_usuario({ idUsuario: 3, username: "caja" });
    await handlers.wibi_alta_flujo({ idCampania: 13793, nombre: "Bienvenida" });
    await handlers.wibi_eliminar_flujo({ idCampania: 13793, idFlujo: 6 });
    await handlers.wibi_enviar_whatsapp({ idcliente: 9, idplantilla: 2, parametrosBody: ["Ana"] });
    await handlers.wibi_alta_campania({ nombre: "Nueva" });

    assert.deepEqual(calls.map((c) => `${c.method} ${c.path}`), [
      "GET cupones/grilla",
      "POST cupones/comando",
      "POST cupones/comando",
      "POST cupones/comando",
      "POST cupones/comando",
      "POST cupones/comando",
      "POST cupones/comando",
      "POST cupones/comando",
      "POST cupones/comando",
      "POST comercios/guardar",
      "POST usuarios/guardar",
      "POST flujos/guardar",
      "POST flujos/guardar",
      "POST whatsapp/operativo",
      "POST campanias/superadmin",
    ]);
    assert.deepEqual(calls.slice(1, 9).map((c) => c.body?.action), [
      "new", "edit", "delete", "toggle", "assign", "unassign", "validate", "use",
    ]);
    assert.equal(calls[9].body?.clave, "clave-comercio");
    assert.equal("activo" in (calls[9].body ?? {}), false);
    assert.equal(comercio.content[0].text.includes("clave-comercio"), false);
    assert.equal(comercio.content[0].text.includes("no-mostrar"), false);
    assert.equal(calls[13].body?.action, "enviar");
    assert.equal(annotations.wibi_validar_cupon.destructiveHint, false);
    assert.equal(annotations.wibi_eliminar_cupon.destructiveHint, true);
    assert.equal(annotations.wibi_enviar_whatsapp.destructiveHint, true);
    assert.equal(handlers.wibi_alta_canal, undefined);
  });

  it("la exportación asincrónica respeta el tipo y no reemplaza el export directo", async () => {
    const soloMovimientos = setup({ "campania.movimientos": ["exportar"] });
    assert.ok(soloMovimientos.handlers.wibi_crear_export_tarea);
    const rechazado = await soloMovimientos.handlers.wibi_crear_export_tarea({ tipo: "clientes" });
    assert.equal(rechazado.isError, true);
    await soloMovimientos.handlers.wibi_crear_export_tarea({ tipo: "movimientos", filtros: { buscar: "ana" } });
    await soloMovimientos.handlers.wibi_estado_export_tarea({ idTarea: 12 });
    await soloMovimientos.handlers.wibi_cancelar_export_tarea({ idTarea: 12 });
    await soloMovimientos.handlers.wibi_descargar_export_tarea({ idTarea: 12 });
    assert.deepEqual(soloMovimientos.calls.map((c) => `${c.method} ${c.path}`), [
      "POST export/tareas",
      "GET export/tareas/12",
      "POST export/tareas/12/cancelar",
      "GET export/tareas/12/descarga",
    ]);

    const sinPermiso = setup({ "campania.clientes": ["consultar"] });
    assert.equal(sinPermiso.handlers.wibi_crear_export_tarea, undefined);
    assert.equal(sinPermiso.handlers.wibi_exportar_clientes, undefined);
  });
});
