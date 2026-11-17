import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WibiClient } from "../wibiClient.js";
import { registerPanelClientesTools } from "./panelClientes.js";

type Call = { method: string; path: string; body?: unknown; query?: Record<string, unknown> };
type Handler = (args: Record<string, unknown>) => Promise<{ isError?: boolean; content: Array<{ text: string }> }>;

function setup(respuesta: unknown = { ok: true, clave: "no-mostrar" }, error?: Error) {
  const calls: Call[] = [];
  const handlers: Record<string, Handler> = {};
  const annotations: Record<string, Record<string, boolean>> = {};
  const client = {
    defaultCampania: 13793,
    get: async (path: string, query?: Record<string, unknown>) => {
      calls.push({ method: "GET", path, query });
      if (error) throw error;
      return respuesta;
    },
    post: async (path: string, body?: unknown, query?: Record<string, unknown>) => {
      calls.push({ method: "POST", path, body, query });
      if (error) throw error;
      return respuesta;
    },
    patch: async (path: string, body?: unknown, query?: Record<string, unknown>) => {
      calls.push({ method: "PATCH", path, body, query });
      if (error) throw error;
      return respuesta;
    },
    put: async (path: string, body?: unknown, query?: Record<string, unknown>) => {
      calls.push({ method: "PUT", path, body, query });
      return respuesta;
    },
  } as unknown as WibiClient;
  const server = {
    registerTool(name: string, config: { annotations?: Record<string, boolean> }, handler: Handler) {
      handlers[name] = handler;
      annotations[name] = config.annotations ?? {};
    },
  } as unknown as McpServer;
  registerPanelClientesTools(server, client);
  return { handlers, annotations, calls };
}

describe("clientes del panel", () => {
  it("alta y edición pegan en clientes/guardar con un id distinto por ejecución", async () => {
    const { handlers, annotations, calls } = setup();
    await handlers.wibi_alta_cliente({ idComercio: 101, nombre: "Ana" });
    await handlers.wibi_alta_cliente({ idComercio: 101, nombre: "Ana" });
    await handlers.wibi_editar_cliente({
      idCliente: 9,
      idComercio: 101,
      nroTarjeta: "200",
      nroTarjetaAnterior: "100",
      operationId: "op-cliente-1",
    });

    assert.equal(calls[0].method, "POST");
    assert.equal(calls[0].path, "clientes/guardar");
    assert.equal((calls[0].body as { action: string }).action, "new");
    assert.equal(calls[0].query?.idCampania, 13793);
    const primero = (calls[0].body as { operation_id: string }).operation_id;
    const segundo = (calls[1].body as { operation_id: string }).operation_id;
    assert.notEqual(primero, segundo);
    assert.equal((calls[2].body as { action: string }).action, "edit_card");
    assert.equal((calls[2].body as { operation_id: string }).operation_id, "op-cliente-1");
    assert.equal(annotations.wibi_alta_cliente.destructiveHint, false);
    assert.equal(annotations.wibi_editar_cliente.destructiveHint, true);
    assert.equal(annotations.wibi_ficha_cliente.readOnlyHint, true);
  });

  it("la ficha, el estado y el reemplazo de etiquetas usan el verbo del controlador", async () => {
    const { handlers, calls } = setup();
    await handlers.wibi_ficha_cliente({ idCliente: 9 });
    await handlers.wibi_resumen_cliente({ idCliente: 9 });
    await handlers.wibi_transacciones_cliente({ idCliente: 9 });
    await handlers.wibi_estado_cliente({ idCliente: 9, activo: 0 });
    await handlers.wibi_reemplazar_tags_cliente({ idCampania: 13793, clientes: [9], tags: [] });

    assert.deepEqual(calls.map((c) => `${c.method} ${c.path}`), [
      "GET clientes/9/ficha",
      "GET clientes/9/resumen",
      "GET clientes/9/transacciones",
      "PATCH clientes/9/estado",
      "PUT clientes/etiquetas",
    ]);
    assert.equal((calls[3].body as { activo: string }).activo, "0");
    assert.deepEqual(calls[4].body, { idCampania: 13793, clientes: [9], tags: [] });
  });

  it("no devuelve ni repite la clave", async () => {
    const { handlers } = setup({ ok: true, clave: "secreta123", token: "abc" });
    const ok = await handlers.wibi_reset_clave_cliente({ idCliente: 9, clave: "secreta123" });
    assert.equal(ok.content[0].text.includes("secreta123"), false);
    assert.equal(ok.content[0].text.includes("abc"), false);

    const fallido = setup(undefined, new Error("no se pudo guardar secreta123"));
    const error = await fallido.handlers.wibi_reset_clave_cliente({ idCliente: 9, clave: "secreta123" });
    assert.equal(error.isError, true);
    assert.equal(error.content[0].text.includes("secreta123"), false);
    assert.match(error.content[0].text, /\[oculto\]/);
  });
});
