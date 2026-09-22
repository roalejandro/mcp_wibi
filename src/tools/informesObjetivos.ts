import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WibiClient } from "../wibiClient.js";
import {
  informesPermissionMap,
  registerInformeTools,
  type InformeToolDef,
} from "./informesRegistry.js";

export const INFORMES_OBJETIVOS_TOOLS: InformeToolDef[] = [
  {
    name: "wibi_informe_cumplimiento_objetivos",
    title: "Informe: cumplimiento de objetivos",
    description:
      "Avance de objetivos de la campaña (ventas, altas, tickets) en el rango de fechas. idComercio filtra un local.",
    path: "informes/cumplimientoobjetivos",
    permiso: "informes",
    params: { fechas: true },
  },
];

export function informesObjetivosPermissionMap(): Record<string, [string, string]> {
  return informesPermissionMap(INFORMES_OBJETIVOS_TOOLS);
}

export function registerInformesObjetivosTools(server: McpServer, client: WibiClient): void {
  registerInformeTools(server, client, INFORMES_OBJETIVOS_TOOLS);
}
