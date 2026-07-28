import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { WibiClient } from "../wibiClient.js";
import { errorResult, jsonResult, scopeParams } from "./helpers.js";

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
const idComercio = z.number().int().positive().optional().describe("Filtro opcional por comercio.");

/**
 * Herramientas de Fase 2: Suscripciones.
 * idCampania siempre viaja por query string (requerimiento API v2).
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
        idComercio,
        nombre: z.string().min(1),
        diferenciaDias: z.number().int().min(0).optional(),
        activo: z.boolean().optional(),
      },
      annotations: WRITE,
    },
    async (args) => {
      try {
        const data = await client.post(
          "suscripciones/tipos-alerta",
          {
            nombre: args.nombre,
            diferenciaDias: args.diferenciaDias,
            activo: args.activo,
          },
          scopeParams(client, args)
        );
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
        "Crea una suscripción para un cliente (día del mes, tipo de alerta y productos opcionales). Valida cliente y tipo de alerta del comercio.",
      inputSchema: {
        idCampania,
        idComercio,
        idCliente: z.number().int().positive(),
        idTipoAlerta: z.number().int().positive(),
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
        const data = await client.post(
          "suscripciones",
          {
            idCliente: args.idCliente,
            idTipoAlerta: args.idTipoAlerta,
            dia: args.dia,
            activo: args.activo,
            notas: args.notas,
            productos: args.productos ?? [],
          },
          scopeParams(client, args)
        );
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
      description: "Lista las suscripciones del comercio autenticado.",
      inputSchema: { idCampania, idComercio },
      annotations: READONLY,
    },
    async (args) => {
      try {
        const data = await client.get("suscripciones", scopeParams(client, args));
        return jsonResult(data);
      } catch (e) {
        return errorResult(e);
      }
    }
  );
}
