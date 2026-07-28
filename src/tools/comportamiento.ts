import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { WibiClient } from "../wibiClient.js";
import { errorResult, jsonResult, scopeParams } from "./helpers.js";

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
  .describe("Campaña a consultar. Opcional si el comercio opera una sola campaña.");
const idComercio = z.number().int().positive().optional().describe("Filtro opcional por comercio.");

/**
 * Herramientas de Fase 1: Clasificación / comportamiento del cliente.
 */
export function registerComportamientoTools(server: McpServer, client: WibiClient): void {
  server.registerTool(
    "wibi_cliente_comportamiento",
    {
      title: "Comportamiento del cliente",
      description:
        "Resumen de ventas (cantidad e importe), puntos acreditados, canjes y saldo de un cliente. Valida que pertenezca a la campaña.",
      inputSchema: {
        idCliente: z.number().int().positive(),
        idCampania,
        idComercio,
      },
      annotations: READONLY,
    },
    async (args) => {
      try {
        const data = await client.get(
          `clientes/${args.idCliente}/comportamiento`,
          scopeParams(client, args)
        );
        return jsonResult(data);
      } catch (e) {
        return errorResult(e);
      }
    }
  );

  server.registerTool(
    "wibi_analisis_clientes",
    {
      title: "Listar análisis de clientes",
      description:
        "Lista las definiciones de análisis/segmentación de clientes disponibles en la campaña (metadata).",
      inputSchema: { idCampania, idComercio },
      annotations: READONLY,
    },
    async (args) => {
      try {
        const data = await client.get("analisis-clientes", scopeParams(client, args));
        return jsonResult(data);
      } catch (e) {
        return errorResult(e);
      }
    }
  );
}
