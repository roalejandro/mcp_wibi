import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { WibiClient } from "../wibiClient.js";
import { errorResult, jsonResult, scopeParams } from "./helpers.js";

export const INFORME_READONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
};

export const informeIdCampania = z
  .number()
  .int()
  .positive()
  .optional()
  .describe("Campaña a consultar. Opcional si el comercio opera una sola campaña.");
export const informeIdComercio = z
  .number()
  .int()
  .positive()
  .optional()
  .describe("Filtro opcional por comercio para sesiones admin.");
export const informeFechaDesde = z
  .string()
  .optional()
  .describe("YYYY-MM-DD. Usar junto con fechaHasta.");
export const informeFechaHasta = z
  .string()
  .optional()
  .describe("YYYY-MM-DD. Usar junto con fechaHasta.");
export const informeDias = z
  .number()
  .int()
  .positive()
  .max(366)
  .optional()
  .describe("Ventana en días. Default 30, máximo 366.");
export const informeOrigenes = z
  .array(z.string().min(1))
  .optional()
  .describe("Orígenes de difusión. El handler los serializa a `origen` CSV.");
export const informeAgrupacion = z
  .enum(["dia", "semana", "mes"])
  .optional()
  .describe("Agrupación de series temporales. Default dia.");
export const informeIdMarca = z.number().int().positive().optional().describe("Marca a detallar.");
export const informeIdSegmento = z.number().int().positive().optional().describe("Segmento a detallar.");
export const informeTipoClasificador = z
  .number()
  .int()
  .positive()
  .optional()
  .describe("Tipo de clasificador (laboratorio, subrubro, etc.).");
export const informeMetaCampaignId = z
  .string()
  .optional()
  .describe("Campaña de Meta Ads. Vacío = todas.");
export const informePage = z.number().int().positive().optional().describe("Página 1-based.");
export const informePerPage = z
  .number()
  .int()
  .positive()
  .max(500)
  .optional()
  .describe("Filas por página. El handler lo traduce a start/length.");
export const informeOrderColumn = z
  .number()
  .int()
  .min(0)
  .optional()
  .describe("Índice de columna DataTables para ordenar.");
export const informeOrderDir = z.enum(["asc", "desc"]).optional().describe("Dirección de orden.");
export const informeSearch = z.string().optional().describe("Búsqueda de texto en la grilla.");

export type InformePermiso = "informacion" | "informes";

export interface InformeExtraParams {
  fechas?: boolean;
  dias?: boolean;
  origenes?: boolean;
  agrupacion?: boolean;
  idMarca?: boolean;
  idSegmento?: boolean;
  tipoClasificador?: boolean;
  metaCampaignId?: boolean;
  page?: boolean;
  pagination?: boolean;
  search?: boolean;
}

export interface InformeToolDef {
  name: string;
  title: string;
  description: string;
  path: string;
  permiso: InformePermiso;
  fechas?: boolean;
  params?: InformeExtraParams;
}

export interface InformeToolArgs {
  idCampania?: number;
  idComercio?: number;
  fechaDesde?: string;
  fechaHasta?: string;
  dias?: number;
  origenes?: string[];
  agrupacion?: "dia" | "semana" | "mes";
  idMarca?: number;
  idSegmento?: number;
  tipoClasificador?: number;
  metaCampaignId?: string;
  page?: number;
  perPage?: number;
  orderColumn?: number;
  orderDir?: "asc" | "desc";
  search?: string;
}

export function resolveInformeParams(tool: InformeToolDef): InformeExtraParams {
  return {
    fechas: tool.fechas === true || tool.params?.fechas === true,
    dias: tool.params?.dias === true,
    origenes: tool.params?.origenes === true,
    agrupacion: tool.params?.agrupacion === true,
    idMarca: tool.params?.idMarca === true,
    idSegmento: tool.params?.idSegmento === true,
    tipoClasificador: tool.params?.tipoClasificador === true,
    metaCampaignId: tool.params?.metaCampaignId === true,
    page: tool.params?.page === true,
    pagination: tool.params?.pagination === true,
    search: tool.params?.search === true,
  };
}

export function informeInputSchema(params: InformeExtraParams): Record<string, z.ZodTypeAny> {
  const schema: Record<string, z.ZodTypeAny> = {
    idCampania: informeIdCampania,
    idComercio: informeIdComercio,
  };

  if (params.fechas) {
    schema.fechaDesde = informeFechaDesde;
    schema.fechaHasta = informeFechaHasta;
  }
  if (params.dias) schema.dias = informeDias;
  if (params.origenes) schema.origenes = informeOrigenes;
  if (params.agrupacion) schema.agrupacion = informeAgrupacion;
  if (params.idMarca) schema.idMarca = informeIdMarca;
  if (params.idSegmento) schema.idSegmento = informeIdSegmento;
  if (params.tipoClasificador) schema.tipoClasificador = informeTipoClasificador;
  if (params.metaCampaignId) schema.metaCampaignId = informeMetaCampaignId;
  if (params.page || params.pagination) schema.page = informePage;
  if (params.pagination) {
    schema.perPage = informePerPage;
    schema.orderColumn = informeOrderColumn;
    schema.orderDir = informeOrderDir;
  }
  if (params.search) schema.search = informeSearch;

  return schema;
}

/**
 * Arma el query string de Laravel: alcance JWT + filtros extra.
 * Nunca incluye IDUsuario ni HMAC.
 * page/perPage se traducen a start/length cuando el tool usa pagination.
 */
export function buildInformeQuery(
  client: WibiClient,
  args: InformeToolArgs,
  params: InformeExtraParams
): Record<string, unknown> {
  const query: Record<string, unknown> = { ...scopeParams(client, args) };

  if (params.fechas) {
    if (args.fechaDesde) query.fechaDesde = args.fechaDesde;
    if (args.fechaHasta) query.fechaHasta = args.fechaHasta;
  }
  if (params.dias && args.dias !== undefined) query.dias = args.dias;
  if (params.origenes && args.origenes && args.origenes.length > 0) {
    query.origen = args.origenes.join(",");
  }
  if (params.agrupacion && args.agrupacion) query.agrupacion = args.agrupacion;
  if (params.idMarca && args.idMarca !== undefined) query.idMarca = args.idMarca;
  if (params.idSegmento && args.idSegmento !== undefined) query.idSegmento = args.idSegmento;
  if (params.tipoClasificador && args.tipoClasificador !== undefined) {
    query.tipoClasificador = args.tipoClasificador;
  }
  if (params.metaCampaignId && args.metaCampaignId) query.metaCampaignId = args.metaCampaignId;
  if (params.search && args.search) query.search = args.search;

  if (params.pagination) {
    if (args.perPage !== undefined || args.page !== undefined) {
      const perPage = args.perPage ?? 25;
      const page = args.page ?? 1;
      query.start = Math.max(0, (page - 1) * perPage);
      query.length = perPage;
    }
    if (args.orderColumn !== undefined) query.orderColumn = args.orderColumn;
    if (args.orderDir) query.orderDir = args.orderDir;
  } else if (params.page && args.page !== undefined) {
    query.page = args.page;
  }

  return query;
}

export function informesPermissionMap(tools: InformeToolDef[]): Record<string, [string, string]> {
  return Object.fromEntries(tools.map((tool) => [tool.name, ["campania", tool.permiso]]));
}

export function registerInformeTools(
  server: McpServer,
  client: WibiClient,
  tools: InformeToolDef[]
): void {
  for (const tool of tools) {
    const params = resolveInformeParams(tool);
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: informeInputSchema(params),
        annotations: INFORME_READONLY,
      },
      async (args: InformeToolArgs) => {
        try {
          const data = await client.get(tool.path, buildInformeQuery(client, args, params));
          return jsonResult(data);
        } catch (e) {
          return errorResult(e);
        }
      }
    );
  }
}
