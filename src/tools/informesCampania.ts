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
const idComercio = z
  .number()
  .int()
  .positive()
  .optional()
  .describe("Filtro opcional por comercio para sesiones admin.");
const fechaDesde = z.string().optional().describe("YYYY-MM-DD. Usar junto con fechaHasta.");
const fechaHasta = z.string().optional().describe("YYYY-MM-DD. Usar junto con fechaDesde.");

export type InformePermiso = "informacion" | "informes";

export interface InformeCampaniaTool {
  name: string;
  title: string;
  description: string;
  path: string;
  permiso: InformePermiso;
  fechas: boolean;
}

export const INFORMES_CAMPANIA_TOOLS: InformeCampaniaTool[] = [
  {
    name: "wibi_informe_estadisticas_ventas",
    title: "Informe: estadísticas de ventas",
    description:
      "KPIs generales del dashboard de campaña (ticket promedio, frecuencia y tickets) en una ventana fija. Preferí esta tool en vez de paginar wibi_listar_movimientos. No es el resumen de un rango elegido: para eso usá wibi_informe_ventas_resumen.",
    path: "informes/ventas",
    permiso: "informacion",
    fechas: false,
  },
  {
    name: "wibi_informe_estadisticas_clientes",
    title: "Informe: estadísticas de clientes",
    description:
      "Puntos circulantes, clientes activos y comercios activos del dashboard de campaña. No pagina clientes crudos: preferila frente a wibi_buscar_clientes cuando solo hacen falta totales.",
    path: "informes/clientes",
    permiso: "informacion",
    fechas: false,
  },
  {
    name: "wibi_informe_altas_clientes",
    title: "Informe: altas de clientes",
    description: "Altas de clientes nuevos por mes (últimos 6 meses) del dashboard de campaña.",
    path: "informes/altasclientes",
    permiso: "informacion",
    fechas: false,
  },
  {
    name: "wibi_informe_clientes_totales",
    title: "Informe: clientes totales",
    description: "Evolución mensual del acumulado de clientes de la campaña (dashboard, ventana fija).",
    path: "informes/clientestotales",
    permiso: "informacion",
    fechas: false,
  },
  {
    name: "wibi_informe_movimientos",
    title: "Informe: movimientos agregados",
    description:
      "Agregado de facturación y puntos emitidos/canjeados del dashboard. NO lista movimientos individuales: para el detalle usá wibi_listar_movimientos.",
    path: "informes/movimientos",
    permiso: "informacion",
    fechas: false,
  },
  {
    name: "wibi_informe_kpis_loyalty",
    title: "Informe: KPIs de fidelización",
    description:
      "Recurrencia, retención, dormidos, churn e índice de riesgo del dashboard de campaña.",
    path: "informes/kpisloyalty",
    permiso: "informacion",
    fechas: false,
  },
  {
    name: "wibi_informe_ventas_resumen",
    title: "Informe: ventas del período",
    description:
      "5 KPIs de un rango de fechas (facturación, compradores, tickets, ticket promedio, frecuencia) con variación vs el período anterior. Distinto de wibi_informe_estadisticas_ventas, que usa la ventana fija del dashboard.",
    path: "informes/informesventas",
    permiso: "informes",
    fechas: true,
  },
  {
    name: "wibi_informe_ventas_por_fecha",
    title: "Informe: ventas por fecha",
    description: "Serie diaria de ventas del período, acumulado y proyección de fin de mes si aplica.",
    path: "informes/informesventasfecha",
    permiso: "informes",
    fechas: true,
  },
  {
    name: "wibi_informe_ventas_por_hora",
    title: "Informe: ventas por horario",
    description: "Heatmap de importe de ventas por día de la semana y franja horaria.",
    path: "informes/informesventasventashoras",
    permiso: "informes",
    fechas: true,
  },
  {
    name: "wibi_informe_ventas_por_comercio",
    title: "Informe: ventas por comercio",
    description: "Ranking de facturación por comercio en el período.",
    path: "informes/informesventascomercio",
    permiso: "informes",
    fechas: true,
  },
  {
    name: "wibi_informe_ventas_por_categoria",
    title: "Informe: ventas por categoría",
    description: "Distribución de ventas por categoría de cliente (segmento de fidelización).",
    path: "informes/informesventascategorias",
    permiso: "informes",
    fechas: true,
  },
  {
    name: "wibi_informe_altas_por_comercio",
    title: "Informe: altas por comercio",
    description: "Nuevos clientes por comercio en el período.",
    path: "informes/informesclientescomercio",
    permiso: "informes",
    fechas: true,
  },
  {
    name: "wibi_informe_ventas_por_vendedor",
    title: "Informe: ventas por vendedor",
    description: "Top de ventas agrupadas por vendedor/operador.",
    path: "informes/informesventasvendedor",
    permiso: "informes",
    fechas: true,
  },
  {
    name: "wibi_informe_ventas_por_obra_social",
    title: "Informe: ventas por obra social",
    description: "Top de ventas agrupadas por obra social.",
    path: "informes/informesventasobrasocial",
    permiso: "informes",
    fechas: true,
  },
];

export function informesCampaniaPermissionMap(): Record<string, [string, string]> {
  return Object.fromEntries(
    INFORMES_CAMPANIA_TOOLS.map((tool) => [tool.name, ["campania", tool.permiso]])
  );
}

export function registerInformesCampaniaTools(server: McpServer, client: WibiClient): void {
  for (const tool of INFORMES_CAMPANIA_TOOLS) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.fechas
          ? { idCampania, idComercio, fechaDesde, fechaHasta }
          : { idCampania, idComercio },
        annotations: READONLY,
      },
      async (args: { idCampania?: number; idComercio?: number; fechaDesde?: string; fechaHasta?: string }) => {
        try {
          const data = await client.get(tool.path, {
            ...scopeParams(client, args),
            ...(tool.fechas
              ? { fechaDesde: args.fechaDesde, fechaHasta: args.fechaHasta }
              : {}),
          });
          return jsonResult(data);
        } catch (e) {
          return errorResult(e);
        }
      }
    );
  }
}
