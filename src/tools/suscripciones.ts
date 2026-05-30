import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { WibiClient } from "../wibiClient.js";
import { campaniaParam, errorResult, jsonResult } from "./helpers.js";

const WRITE = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true,
};

const READONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
};

const idCampania = z
  .number()
  .int()
  .positive()
  .optional()
  .describe("Campaña destino. Opcional si el comercio opera una sola campaña.");

/**
 * Herramientas de Fase 2: Suscripciones.
 */
export function registerSuscripcionesTools(server: McpServer, client: WibiClient): void {
  server.registerTool(
    "wibi_crear_tipo_alerta",
    {
      title: "Crear tipo de alerta",
      description:
        "Crea un tipo de alerta en la campaña (p. ej. recompra de medicamento), con días de anticipación.",
      inputSchema: {
        idCampania,
        nombre: z.string().min(1),
        diferenciaDias: z.number().int().min(0).optional(),
        activo: z.boolean().optional(),
      },
      annotations: WRITE,
    },
    async (args) => {
      try {
        const data = await client.post("suscripciones/tipos-alerta", {
          ...campaniaParam(client, args.idCampania),
          nombre: args.nombre,
          diferenciaDias: args.diferenciaDias,
          activo: args.activo,
        });
        return jsonResult(data);
      } catch (e) {
        return errorResult(e);
      }
    }
  );

  server.registerTool(
    "wibi_crear_suscripcion",
    {
      title: "Crear suscripción",
      description:
        "Crea una suscripción para un cliente (día del mes y productos opcionales). Valida que el cliente pertenezca a la campaña.",
      inputSchema: {
        idCampania,
        idCliente: z.number().int().positive(),
        dia: z.number().int().min(1).max(31),
        activo: z.boolean().optional(),
        notas: z.string().optional(),
        productos: z
          .array(
            z.object({
              IdProducto: z.number().int().positive(),
              Cantidad: z.number().positive().optional(),
            })
          )
          .optional(),
      },
      annotations: WRITE,
    },
    async (args) => {
      try {
        const data = await client.post("suscripciones", {
          ...campaniaParam(client, args.idCampania),
          idCliente: args.idCliente,
          dia: args.dia,
          activo: args.activo,
          notas: args.notas,
          productos: args.productos ?? [],
        });
        return jsonResult(data);
      } catch (e) {
        return errorResult(e);
      }
    }
  );

  server.registerTool(
    "wibi_consultar_suscripciones",
    {
      title: "Consultar suscripciones",
      description: "Lista las suscripciones de la campaña del comercio.",
      inputSchema: { idCampania },
      annotations: READONLY,
    },
    async (args) => {
      try {
        const data = await client.get("suscripciones", campaniaParam(client, args.idCampania));
        return jsonResult(data);
      } catch (e) {
        return errorResult(e);
      }
    }
  );
}
