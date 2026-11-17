import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { WibiClient } from "../wibiClient.js";
import { scopeParams } from "./helpers.js";
import { DESTRUCTIVE, ejecutar, idCampania, idComercio, identificadorOperacion, operationId } from "./adminShared.js";

const item = z.object({
  idProducto: z.number().int().positive(),
  cantidad: z.number().positive(),
  precio: z.number().nonnegative(),
});

export function registerPanelMovimientosTools(server: McpServer, client: WibiClient): void {
  const puntos = (accion: "add" | "del", nombre: string, titulo: string, descripcion: string) => {
    server.registerTool(nombre, {
      title: titulo,
      description: descripcion,
      inputSchema: {
        idCampania,
        idComercio: z.number().int().positive(),
        puntos: z.number().int().positive(),
        motivo: z.string().min(1),
        idCliente: z.number().int().positive().optional(),
        nroTarjeta: z.string().optional(),
        tokenCanje: z.string().optional().describe("Autorización ya emitida, si el canje la exige."),
        operationId,
      },
      annotations: DESTRUCTIVE,
    }, async (args) => ejecutar(() => {
      if (!args.idCliente && !args.nroTarjeta) {
        throw new Error("Indicá el cliente o la tarjeta.");
      }
      return client.post("movimientos/comando", {
        action: accion,
        idComercio: args.idComercio,
        idCliente: args.idCliente,
        nroTarjeta: args.nroTarjeta,
        puntos: args.puntos,
        motivo: args.motivo,
        tokenCanje: args.tokenCanje,
        operation_id: identificadorOperacion(args.operationId),
      }, scopeParams(client, args));
    }, [args.tokenCanje]));
  };

  puntos("add", "wibi_sumar_puntos", "Sumar puntos", "Suma puntos manuales en la sucursal indicada.");
  puntos("del", "wibi_restar_puntos", "Restar puntos", "Descuenta puntos manuales en la sucursal indicada.");

  server.registerTool("wibi_anular_puntos", {
    title: "Anular movimiento de puntos",
    description: "Anula un movimiento de puntos que esté en el alcance. No anula una venta.",
    inputSchema: {
      idCampania,
      idComercio: z.number().int().positive(),
      idMovimiento: z.number().int().positive(),
      operationId,
    },
    annotations: DESTRUCTIVE,
  }, async (args) => ejecutar(() => client.post("movimientos/comando", {
    action: "anular",
    idComercio: args.idComercio,
    idMovimiento: args.idMovimiento,
    operation_id: identificadorOperacion(args.operationId),
  }, scopeParams(client, args))));

  const venta = (accion: "venta" | "devolucion" | "anular", nombre: string, titulo: string, descripcion: string) => {
    server.registerTool(nombre, {
      title: titulo,
      description: descripcion,
      inputSchema: {
        idCampania,
        idComercio: z.number().int().positive(),
        operationId,
        ...(accion === "anular"
          ? { idMovimiento: z.number().int().positive() }
          : {
              nroTarjeta: z.string().min(1),
              importeTotal: z.number(),
              fecha: z.string().min(1).describe("Fecha del comprobante, d/m/Y o d/m/Y H:i:s."),
              nroComprobante: z.string().optional(),
              puntosCanjeados: z.number().int().nonnegative().optional(),
              items: z.array(item).optional(),
              ...(accion === "devolucion"
                ? { comprobanteOriginal: z.string().min(1).describe("Comprobante externo de la venta original.") }
                : {}),
            }),
      },
      annotations: DESTRUCTIVE,
    }, async (args: {
      idCampania?: number;
      idComercio: number;
      operationId?: string;
      idMovimiento?: number;
      nroTarjeta?: string;
      importeTotal?: number;
      fecha?: string;
      nroComprobante?: string;
      puntosCanjeados?: number;
      comprobanteOriginal?: string;
      items?: Array<{ idProducto: number; cantidad: number; precio: number }>;
    }) => ejecutar(() => client.post("ventas/comando", {
      action: accion,
      IdComercio: args.idComercio,
      IdMovimiento: "idMovimiento" in args ? args.idMovimiento : undefined,
      NroTarjeta: "nroTarjeta" in args ? args.nroTarjeta : undefined,
      ImporteTotal: "importeTotal" in args ? args.importeTotal : undefined,
      FechaComprobante: "fecha" in args ? args.fecha : undefined,
      NroComprobante: "nroComprobante" in args ? args.nroComprobante : undefined,
      ComprobanteExt: "comprobanteOriginal" in args ? args.comprobanteOriginal : undefined,
      PuntosCanjeados: "puntosCanjeados" in args ? args.puntosCanjeados : undefined,
      items: "items" in args ? args.items : undefined,
      operation_id: identificadorOperacion(args.operationId),
    }, scopeParams(client, args))));
  };

  venta("venta", "wibi_registrar_venta", "Registrar venta", "Registra una venta en la sucursal indicada.");
  venta("devolucion", "wibi_devolver_venta", "Devolver venta", "Registra la devolución de una venta de la misma sucursal y cliente.");
  venta("anular", "wibi_anular_venta", "Anular venta", "Anula una venta solo si el movimiento pertenece a la sucursal indicada.");
}
