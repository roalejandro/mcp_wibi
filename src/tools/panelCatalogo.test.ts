import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WibiClient } from "../wibiClient.js";
import { registerPanelCatalogoTools } from "./panelCatalogo.js";

type Call = { method: string; path: string; body?: Record<string, unknown>; query?: Record<string, unknown> };
type Handler = (args: Record<string, unknown>) => Promise<{ isError?: boolean; content: Array<{ text: string }> }>;

function setup() {
  const calls: Call[] = [];
  const handlers: Record<string, Handler> = {};
  const annotations: Record<string, Record<string, boolean>> = {};
  const client = {
    defaultCampania: 13793,
    post: async (path: string, body?: Record<string, unknown>, query?: Record<string, unknown>) => {
      calls.push({ method: "POST", path, body, query });
      return { ok: true };
    },
    patch: async (path: string, body?: Record<string, unknown>, query?: Record<string, unknown>) => {
      calls.push({ method: "PATCH", path, body, query });
      return { ok: true };
    },
    delete: async (path: string, query?: Record<string, unknown>) => {
      calls.push({ method: "DELETE", path, query });
      return { ok: true };
    },
  } as unknown as WibiClient;
  const server = {
    registerTool(name: string, config: { annotations?: Record<string, boolean> }, handler: Handler) {
      handlers[name] = handler;
      annotations[name] = config.annotations ?? {};
    },
  } as unknown as McpServer;
  registerPanelCatalogoTools(server, client);
  return { handlers, annotations, calls };
}

describe("catálogo del panel", () => {
  it("cubre productos, asignaciones y marcas con el verbo de cada contrato", async () => {
    const { handlers, annotations, calls } = setup();
    await handlers.wibi_alta_producto({ idCampania: 13793, idRed: 4, producto: "Shampoo" });
    await handlers.wibi_editar_producto({ idCampania: 13793, idProducto: 8, producto: "Shampoo grande" });
    await handlers.wibi_precios_producto({ idCampania: 13793, idProducto: 8, precio: 1500 });
    await handlers.wibi_estado_producto({ idCampania: 13793, idProducto: 8, activo: false });
    await handlers.wibi_asignar_marca_productos({ idCampania: 13793, ids: [8], valor: 3 });
    const sinSucursal = await handlers.wibi_asignar_stock_productos({ idCampania: 13793, ids: [8], valor: 5 });
    await handlers.wibi_asignar_stock_productos({ idCampania: 13793, idComercio: 101, ids: [8], valor: 5, stockMinimo: 1 });
    await handlers.wibi_crear_marca({ idCampania: 13793, nombre: "Acme" });
    await handlers.wibi_modificar_marca({ idCampania: 13793, idMarca: 3, nombre: "Acme SA" });
    await handlers.wibi_eliminar_marca({ idCampania: 13793, idMarca: 3 });
    await handlers.wibi_importar_marcas({ idCampania: 13793, nombres: ["Uno", "Dos"] });

    assert.equal(sinSucursal.isError, true);
    assert.deepEqual(calls.map((c) => `${c.method} ${c.path}`), [
      "POST productos",
      "PATCH productos/8",
      "PATCH productos/8/precios",
      "PATCH productos/8/estado",
      "POST productos/asignar",
      "POST productos/asignar",
      "POST marcas",
      "PATCH marcas/3",
      "DELETE marcas/3",
      "POST marcas/importar",
    ]);
    assert.equal(calls[4].body?.campo, "marca");
    assert.equal(calls[5].body?.campo, "stock_comercio");
    assert.equal(calls[5].body?.stock, 5);
    assert.equal(annotations.wibi_alta_producto.readOnlyHint, false);
    assert.equal(annotations.wibi_alta_producto.destructiveHint, false);
    assert.equal(annotations.wibi_eliminar_marca.destructiveHint, true);
  });
});
