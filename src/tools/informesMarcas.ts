import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WibiClient } from "../wibiClient.js";
import {
  informesPermissionMap,
  registerInformeTools,
  type InformeToolDef,
} from "./informesRegistry.js";

export const INFORMES_MARCAS_TOOLS: InformeToolDef[] = [
  {
    name: "wibi_informe_clasificadores_disponibles",
    title: "Informe: clasificadores disponibles",
    description:
      "Tipos de clasificador habilitados en la campaña (laboratorio, subrubro, etc.). Usalo antes de wibi_informe_ventas_por_clasificador.",
    path: "informes/validarclasificadores",
    permiso: "informes",
  },
  {
    name: "wibi_informe_ventas_por_marca",
    title: "Informe: ventas por marca",
    description: "Ranking de facturación por marca en el período, con paginación.",
    path: "informes/ventasmarcas",
    permiso: "informes",
    params: { fechas: true, pagination: true },
  },
  {
    name: "wibi_informe_ventas_por_segmento",
    title: "Informe: ventas por segmento",
    description: "Ranking de facturación por segmento de producto en el período, con paginación.",
    path: "informes/ventassegmentos",
    permiso: "informes",
    params: { fechas: true, pagination: true },
  },
  {
    name: "wibi_informe_ventas_por_clasificador",
    title: "Informe: ventas por clasificador",
    description:
      "Ranking de ventas por un tipo de clasificador. Pedí primero wibi_informe_clasificadores_disponibles para saber qué tipoClasificador usar.",
    path: "informes/ventasclasificadores",
    permiso: "informes",
    params: { fechas: true, tipoClasificador: true, pagination: true },
  },
  {
    name: "wibi_informe_clientes_por_marca",
    title: "Informe: clientes por marca",
    description: "Clientes que compraron una marca en el período. Requiere idMarca.",
    path: "informes/ventasclientesmarca",
    permiso: "informes",
    params: { fechas: true, idMarca: true, pagination: true },
  },
  {
    name: "wibi_informe_clientes_por_segmento",
    title: "Informe: clientes por segmento",
    description: "Clientes que compraron un segmento de producto en el período. Requiere idSegmento.",
    path: "informes/ventasclientessegmento",
    permiso: "informes",
    params: { fechas: true, idSegmento: true, pagination: true },
  },
  {
    name: "wibi_informe_evolucion_marca",
    title: "Informe: evolución de marca",
    description: "Serie mensual de ventas de una marca. Requiere idMarca.",
    path: "informes/evolucionmarca",
    permiso: "informes",
    params: { idMarca: true },
  },
  {
    name: "wibi_informe_evolucion_segmento",
    title: "Informe: evolución de segmento",
    description: "Serie mensual de ventas de un segmento. Requiere idSegmento.",
    path: "informes/evolucionsegmento",
    permiso: "informes",
    params: { idSegmento: true },
  },
];

export function informesMarcasPermissionMap(): Record<string, [string, string]> {
  return informesPermissionMap(INFORMES_MARCAS_TOOLS);
}

export function registerInformesMarcasTools(server: McpServer, client: WibiClient): void {
  registerInformeTools(server, client, INFORMES_MARCAS_TOOLS);
}
