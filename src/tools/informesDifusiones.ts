import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WibiClient } from "../wibiClient.js";
import {
  informesPermissionMap,
  registerInformeTools,
  type InformeToolDef,
} from "./informesRegistry.js";

const DIFUSION_FILTROS = { dias: true, fechas: true, origenes: true };
const DIFUSION_SERIE = { dias: true, fechas: true, origenes: true, agrupacion: true };

export const INFORMES_DIFUSIONES_TOOLS: InformeToolDef[] = [
  {
    name: "wibi_informe_difusiones_metricas_wa",
    title: "Informe: métricas WhatsApp",
    description: "KPIs de difusiones WhatsApp (enviados, entregados, leídos, clics). Acepta dias o fechaDesde/fechaHasta (las fechas tienen precedencia).",
    path: "informes/difusionesmetricaswa",
    permiso: "informes",
    params: DIFUSION_FILTROS,
  },
  {
    name: "wibi_informe_difusiones_grafico_wa",
    title: "Informe: gráfico WhatsApp",
    description: "Serie temporal de envíos WhatsApp. Acepta agrupacion dia|semana|mes.",
    path: "informes/difusionesgraficowa",
    permiso: "informes",
    params: DIFUSION_SERIE,
  },
  {
    name: "wibi_informe_difusiones_torta_wa",
    title: "Informe: torta WhatsApp",
    description: "Distribución de estados de mensajes WhatsApp (enviado, entregado, leído, error).",
    path: "informes/difusionestortawa",
    permiso: "informes",
    params: DIFUSION_FILTROS,
  },
  {
    name: "wibi_informe_difusiones_tabla_wa",
    title: "Informe: tabla WhatsApp",
    description: "Detalle de campañas/envíos WhatsApp. Acepta dias o fechaDesde/fechaHasta (las fechas tienen precedencia).",
    path: "informes/difusionestablawa",
    permiso: "informes",
    params: DIFUSION_FILTROS,
  },
  {
    name: "wibi_informe_difusiones_conversion_wa",
    title: "Informe: conversión WhatsApp",
    description: "Conversión de difusiones WhatsApp (envío → compra).",
    path: "informes/difusionesconversionwa",
    permiso: "informes",
    params: DIFUSION_FILTROS,
  },
  {
    name: "wibi_informe_difusiones_funnel_wa",
    title: "Informe: funnel WhatsApp",
    description: "Evolución del funnel WhatsApp. Acepta agrupacion dia|semana|mes.",
    path: "informes/difusionesfunnelevolucionwa",
    permiso: "informes",
    params: DIFUSION_SERIE,
  },
  {
    name: "wibi_informe_difusiones_metricas_email",
    title: "Informe: métricas email",
    description: "KPIs de difusiones email. Acepta dias o fechaDesde/fechaHasta (las fechas tienen precedencia).",
    path: "informes/difusionesmetricasemail",
    permiso: "informes",
    params: DIFUSION_FILTROS,
  },
  {
    name: "wibi_informe_difusiones_grafico_email",
    title: "Informe: gráfico email",
    description: "Serie temporal de envíos email.",
    path: "informes/difusionesgraficoemail",
    permiso: "informes",
    params: DIFUSION_FILTROS,
  },
  {
    name: "wibi_informe_difusiones_tabla_email",
    title: "Informe: tabla email",
    description: "Detalle de campañas/envíos email. Acepta dias o fechaDesde/fechaHasta (las fechas tienen precedencia).",
    path: "informes/difusionestablaemail",
    permiso: "informes",
    params: DIFUSION_FILTROS,
  },
  {
    name: "wibi_informe_difusiones_adherencia",
    title: "Informe: adherencia crónica",
    description: "Adherencia a tratamientos/crónicos a partir de las difusiones. Acepta dias o fechaDesde/fechaHasta (las fechas tienen precedencia).",
    path: "informes/difusionesadherenciacronica",
    permiso: "informes",
    params: { dias: true, fechas: true },
  },
];

export function informesDifusionesPermissionMap(): Record<string, [string, string]> {
  return informesPermissionMap(INFORMES_DIFUSIONES_TOOLS);
}

export function registerInformesDifusionesTools(server: McpServer, client: WibiClient): void {
  registerInformeTools(server, client, INFORMES_DIFUSIONES_TOOLS);
}
