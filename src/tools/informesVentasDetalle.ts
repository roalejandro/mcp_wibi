import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WibiClient } from "../wibiClient.js";
import {
  informesPermissionMap,
  registerInformeTools,
  type InformeToolDef,
} from "./informesRegistry.js";

export const INFORMES_VENTAS_DETALLE_TOOLS: InformeToolDef[] = [
  {
    name: "wibi_informe_top_productos",
    title: "Informe: top productos",
    description:
      "Ranking de productos por facturación en el período. Paginado. Preferilo frente a listar movimientos crudos.",
    path: "informes/informesventasproductos",
    permiso: "informes",
    params: { fechas: true, pagination: true },
  },
  {
    name: "wibi_informe_top_clientes",
    title: "Informe: top clientes",
    description:
      "Ranking de clientes por facturación en el período. Incluye IdCliente para armar el link de ficha. Paginado.",
    path: "informes/informesventasclientes",
    permiso: "informes",
    params: { fechas: true, pagination: true },
  },
];

export function informesVentasDetallePermissionMap(): Record<string, [string, string]> {
  return informesPermissionMap(INFORMES_VENTAS_DETALLE_TOOLS);
}

export function registerInformesVentasDetalleTools(server: McpServer, client: WibiClient): void {
  registerInformeTools(server, client, INFORMES_VENTAS_DETALLE_TOOLS);
}
