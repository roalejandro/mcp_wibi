import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { INFORMES_META_TOOLS } from "./informesMeta.js";
import { assertNoUsuarioNiHmac, collectInformeTools } from "./informesTestUtils.js";

const EXPECTED: Record<string, string> = {
  wibi_informe_meta_kpis: "informes/metadashboardkpis",
  wibi_informe_meta_chart_mov_mes: "informes/metadashboardchartmovmes",
  wibi_informe_meta_chart_log_dia: "informes/metadashboardchartlogdia",
  wibi_informe_meta_ultimas_conversiones: "informes/metadashboardultimasconversiones",
  wibi_informe_meta_config_tracking: "informes/metadashboardconfigtracking",
  wibi_informe_meta_diagnostico: "informes/metadashboarddiagnostico",
  wibi_informe_meta_ads_kpis: "informes/metadashboardadskpis",
  wibi_informe_meta_ads_chart_gasto: "informes/metadashboardadschartgasto",
  wibi_informe_meta_ads_chart_costos: "informes/metadashboardadschartcostos",
  wibi_informe_meta_ads_chart_rendimiento: "informes/metadashboardadschartrendimiento",
  wibi_informe_meta_ads_chart_conversiones: "informes/metadashboardadschartconversiones",
  wibi_informe_meta_ads_tabla_detalle: "informes/metadashboardadstabladetalle",
  wibi_informe_meta_ads_campanias: "informes/metadashboardadscampanias",
};

describe("informes Meta MCP", () => {
  it("registra 13 tools y reenvía filtros Ads", async () => {
    const { names, schemas, calls } = await collectInformeTools(INFORMES_META_TOOLS, {
      idCampania: 482,
      fechaDesde: "2026-08-01",
      fechaHasta: "2026-08-22",
      metaCampaignId: "12023",
      page: 2,
      perPage: 25,
      search: "promo",
      orderColumn: 1,
      orderDir: "asc",
    });

    assert.equal(names.length, 13);
    for (const tool of INFORMES_META_TOOLS) {
      assert.equal(tool.path, EXPECTED[tool.name]);
      assert.ok(!("IDUsuario" in schemas[tool.name]));
    }

    for (const call of calls) {
      assertNoUsuarioNiHmac(call.params);
    }

    const ultimas = calls.find((call) => call.path === "informes/metadashboardultimasconversiones");
    assert.equal(ultimas?.params.page, 2);
    assert.ok(!("start" in (ultimas?.params ?? {})));

    const ads = calls.find((call) => call.path === "informes/metadashboardadskpis");
    assert.equal(ads?.params.metaCampaignId, "12023");
    assert.equal(ads?.params.fechaDesde, "2026-08-01");

    const tabla = calls.find((call) => call.path === "informes/metadashboardadstabladetalle");
    assert.equal(tabla?.params.start, 25);
    assert.equal(tabla?.params.length, 25);
    assert.equal(tabla?.params.search, "promo");
    assert.ok(!("page" in (tabla?.params ?? {})));

    const config = calls.find((call) => call.path === "informes/metadashboardconfigtracking");
    assert.deepEqual(Object.keys(config?.params ?? {}).sort(), ["idCampania"]);
  });
});
