import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WibiClient } from "../wibiClient.js";
import { registerPanelMovimientosTools } from "./panelMovimientos.js";

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
  } as unknown as WibiClient;
  const server = {
    registerTool(name: string, config: { annotations?: Record<string, boolean> }, handler: Handler) {
      handlers[name] = handler;
      annotations[name] = config.annotations ?? {};
    },
  } as unknown as McpServer;
  registerPanelMovimientosTools(server, client);
  return { handlers, annotations, calls };
}

describe("puntos y ventas", () => {
  it("separa cada acción y reutiliza el id solo cuando el usuario lo repite", async () => {
    const { handlers, annotations, calls } = setup();
    const error = await handlers.wibi_sumar_puntos({ idComercio: 101, puntos: 10, motivo: "ajuste" });
    assert.equal(error.isError, true);

    await handlers.wibi_sumar_puntos({ idComercio: 101, idCliente: 9, puntos: 10, motivo: "ajuste" });
    await handlers.wibi_sumar_puntos({ idComercio: 101, idCliente: 9, puntos: 10, motivo: "ajuste" });
    await handlers.wibi_restar_puntos({ idComercio: 101, nroTarjeta: "555", puntos: 2, motivo: "canje", operationId: "op-puntos" });
    await handlers.wibi_anular_puntos({ idComercio: 101, idMovimiento: 50 });
    await handlers.wibi_registrar_venta({
      idComercio: 101,
      nroTarjeta: "555",
      importeTotal: 1000,
      fecha: "16/11/2026",
      items: [{ idProducto: 3, cantidad: 1, precio: 1000 }],
    });
    await handlers.wibi_devolver_venta({
      idComercio: 101,
      nroTarjeta: "555",
      importeTotal: 1000,
      fecha: "16/11/2026",
      comprobanteOriginal: "A-1",
    });
    await handlers.wibi_anular_venta({ idComercio: 101, idMovimiento: 77 });

    assert.deepEqual(calls.map((c) => `${c.path}:${c.body?.action}`), [
      "movimientos/comando:add",
      "movimientos/comando:add",
      "movimientos/comando:del",
      "movimientos/comando:anular",
      "ventas/comando:venta",
      "ventas/comando:devolucion",
      "ventas/comando:anular",
    ]);
    assert.notEqual(calls[0].body?.operation_id, calls[1].body?.operation_id);
    assert.equal(calls[2].body?.operation_id, "op-puntos");
    assert.equal(calls[4].body?.ImporteTotal, 1000);
    assert.equal(calls[5].body?.ComprobanteExt, "A-1");
    assert.equal(calls[6].body?.IdMovimiento, 77);
    assert.equal(calls[0].query?.idCampania, 13793);
    for (const nombre of Object.keys(annotations)) {
      assert.equal(annotations[nombre].destructiveHint, true, nombre);
    }
  });
});
