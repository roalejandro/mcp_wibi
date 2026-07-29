import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { WibiClient } from "../wibiClient.js";
import { errorResult, jsonResult, scopeParams } from "./helpers.js";

const format = z.enum(["csv", "excel", "pdf"]).default("csv");
const idCampania = z.number().int().positive().optional();
const idComercio = z.number().int().positive().optional().describe("Filtro opcional por comercio.");

function exportResult(result: {
  contentType: string;
  filename?: string;
  base64: string;
  rowCount?: number;
}): ReturnType<typeof jsonResult> {
  const isCsv = /csv/i.test(result.contentType);
  const preview = isCsv
    ? Buffer.from(result.base64, "base64").toString("utf8").slice(0, 1_000)
    : undefined;
  return jsonResult({
    filename: result.filename,
    contentType: result.contentType,
    encoding: "base64",
    base64: result.base64,
    rowCount: result.rowCount,
    ...(preview ? { preview } : {}),
  });
}

export function registerExportTools(server: McpServer, client: WibiClient): void {
  server.registerTool(
    "wibi_exportar_clientes",
    {
      title: "Exportar clientes",
      description:
        "Exporta clientes filtrados de la campaña en CSV, Excel o PDF. Acepta idTags (OR) igual que wibi_buscar_clientes; no agrega columna de tags al archivo.",
      inputSchema: {
        idCampania,
        idComercio,
        format,
        buscar: z.string().optional(),
        idCategoria: z.number().int().positive().optional(),
        idGrupoInteres: z.number().int().positive().optional(),
        activo: z.number().int().min(0).max(1).optional(),
        idTags: z
          .array(z.number().int().positive())
          .min(1)
          .optional()
          .describe("Filtrar clientes con al menos uno de estos IdTag (OR)."),
      },
    },
    async (args) => {
      try {
        return exportResult(
          await client.getBinary("export/clientes", {
            ...scopeParams(client, args),
            format: args.format,
            buscar: args.buscar,
            idCategoria: args.idCategoria,
            idGrupoInteres: args.idGrupoInteres,
            activo: args.activo,
            ...(args.idTags?.length ? { idTags: args.idTags.join(",") } : {}),
          })
        );
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    "wibi_exportar_movimientos",
    {
      title: "Exportar movimientos",
      description: "Exporta movimientos filtrados de la campaña en CSV, Excel o PDF.",
      inputSchema: {
        idCampania,
        idComercio,
        format,
        fechaDesde: z.string().optional().describe("YYYY-MM-DD"),
        fechaHasta: z.string().optional().describe("YYYY-MM-DD"),
        idCliente: z.number().int().positive().optional(),
        idTipoMovimiento: z.number().int().positive().optional(),
      },
    },
    async (args) => {
      try {
        return exportResult(
          await client.getBinary("export/movimientos", {
            ...scopeParams(client, args),
            format: args.format,
            fechaDesde: args.fechaDesde,
            fechaHasta: args.fechaHasta,
            idCliente: args.idCliente,
            idTipoMovimiento: args.idTipoMovimiento,
          })
        );
      } catch (error) {
        return errorResult(error);
      }
    }
  );
}
