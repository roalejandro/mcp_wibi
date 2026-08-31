import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WibiClient } from "../wibiClient.js";
import {
  informesPermissionMap,
  registerInformeTools,
  type InformeToolDef,
} from "./informesRegistry.js";

const META_ADS = { fechas: true, metaCampaignId: true };

export const INFORMES_META_TOOLS: InformeToolDef[] = [
  {
    name: "wibi_informe_meta_kpis",
    title: "Informe Meta: KPIs de conversiones",
    description: "KPIs de tracking y conversiones Meta (clientes, movimientos, log). Sin rango de fechas.",
    path: "informes/metadashboardkpis",
    permiso: "informes",
  },
  {
    name: "wibi_informe_meta_chart_mov_mes",
    title: "Informe Meta: movimientos por mes",
    description: "Serie mensual de movimientos enviados a Meta Conversions.",
    path: "informes/metadashboardchartmovmes",
    permiso: "informes",
  },
  {
    name: "wibi_informe_meta_chart_log_dia",
    title: "Informe Meta: log diario",
    description: "Serie diaria del log de conversiones Meta.",
    path: "informes/metadashboardchartlogdia",
    permiso: "informes",
  },
  {
    name: "wibi_informe_meta_ultimas_conversiones",
    title: "Informe Meta: últimas conversiones",
    description: "Últimas conversiones enviadas a Meta. page opcional.",
    path: "informes/metadashboardultimasconversiones",
    permiso: "informes",
    params: { page: true },
  },
  {
    name: "wibi_informe_meta_config_tracking",
    title: "Informe Meta: estado de tracking",
    description:
      "Estado de configuración Meta (activo, pixel, si hay token) y conteos de tracking. Nunca devuelve el Access Token ni códigos secretos.",
    path: "informes/metadashboardconfigtracking",
    permiso: "informes",
  },
  {
    name: "wibi_informe_meta_diagnostico",
    title: "Informe Meta: diagnóstico",
    description: "Diagnóstico de tablas, cron y cobertura de contacto para Meta Conversions.",
    path: "informes/metadashboarddiagnostico",
    permiso: "informes",
  },
  {
    name: "wibi_informe_meta_ads_kpis",
    title: "Informe Meta Ads: KPIs",
    description: "Gasto, impresiones, clics, ROAS y conversiones de Meta Ads en el período.",
    path: "informes/metadashboardadskpis",
    permiso: "informes",
    params: META_ADS,
  },
  {
    name: "wibi_informe_meta_ads_chart_gasto",
    title: "Informe Meta Ads: gasto",
    description: "Serie de gasto, impresiones y alcance de Meta Ads.",
    path: "informes/metadashboardadschartgasto",
    permiso: "informes",
    params: META_ADS,
  },
  {
    name: "wibi_informe_meta_ads_chart_costos",
    title: "Informe Meta Ads: costos",
    description: "Serie de CPC y CPM de Meta Ads.",
    path: "informes/metadashboardadschartcostos",
    permiso: "informes",
    params: META_ADS,
  },
  {
    name: "wibi_informe_meta_ads_chart_rendimiento",
    title: "Informe Meta Ads: rendimiento",
    description: "Serie de clics y CTR de Meta Ads.",
    path: "informes/metadashboardadschartrendimiento",
    permiso: "informes",
    params: META_ADS,
  },
  {
    name: "wibi_informe_meta_ads_chart_conversiones",
    title: "Informe Meta Ads: conversiones",
    description: "Serie de conversiones, valor y ROAS de Meta Ads.",
    path: "informes/metadashboardadschartconversiones",
    permiso: "informes",
    params: META_ADS,
  },
  {
    name: "wibi_informe_meta_ads_tabla_detalle",
    title: "Informe Meta Ads: detalle",
    description:
      "Tabla paginada de campañas/ads de Meta. Acepta fechas, metaCampaignId, page, perPage, search y orden.",
    path: "informes/metadashboardadstabladetalle",
    permiso: "informes",
    params: { ...META_ADS, pagination: true, search: true },
  },
  {
    name: "wibi_informe_meta_ads_campanias",
    title: "Informe Meta Ads: catálogo de campañas",
    description: "Listado de campañas de Meta Ads configuradas, sin fechas.",
    path: "informes/metadashboardadscampanias",
    permiso: "informes",
  },
];

export function informesMetaPermissionMap(): Record<string, [string, string]> {
  return informesPermissionMap(INFORMES_META_TOOLS);
}

export function registerInformesMetaTools(server: McpServer, client: WibiClient): void {
  registerInformeTools(server, client, INFORMES_META_TOOLS);
}
