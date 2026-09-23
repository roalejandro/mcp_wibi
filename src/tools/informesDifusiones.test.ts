import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { INFORMES_DIFUSIONES_TOOLS } from "./informesDifusiones.js";
import { assertNoUsuarioNiHmac, collectInformeTools } from "./informesTestUtils.js";

describe("informes difusiones MCP", () => {
  it("registra 10 tools y serializa origenes", async () => {
    const { names, calls } = await collectInformeTools(INFORMES_DIFUSIONES_TOOLS, {
      idCampania: 482,
      dias: 60,
      origenes: ["whatsapp", "flujo"],
      agrupacion: "semana",
    });

    assert.equal(names.length, 10);
    assert.equal(new Set(names).size, 10);
    for (const name of names) {
      assert.match(name, /^wibi_informe_difusiones_/);
    }

    const expected = {
      wibi_informe_difusiones_metricas_wa: "informes/difusionesmetricaswa",
      wibi_informe_difusiones_grafico_wa: "informes/difusionesgraficowa",
      wibi_informe_difusiones_torta_wa: "informes/difusionestortawa",
      wibi_informe_difusiones_tabla_wa: "informes/difusionestablawa",
      wibi_informe_difusiones_conversion_wa: "informes/difusionesconversionwa",
      wibi_informe_difusiones_funnel_wa: "informes/difusionesfunnelevolucionwa",
      wibi_informe_difusiones_metricas_email: "informes/difusionesmetricasemail",
      wibi_informe_difusiones_grafico_email: "informes/difusionesgraficoemail",
      wibi_informe_difusiones_tabla_email: "informes/difusionestablaemail",
      wibi_informe_difusiones_adherencia: "informes/difusionesadherenciacronica",
    };

    for (const tool of INFORMES_DIFUSIONES_TOOLS) {
      assert.equal(tool.path, expected[tool.name as keyof typeof expected]);
    }

    for (const call of calls) {
      assertNoUsuarioNiHmac(call.params);
      assert.equal(call.params.dias, 60);
    }

    const grafico = calls.find((call) => call.path === "informes/difusionesgraficowa");
    assert.equal(grafico?.params.origen, "whatsapp,flujo");
    assert.equal(grafico?.params.agrupacion, "semana");

    const adherencia = calls.find((call) => call.path === "informes/difusionesadherenciacronica");
    assert.ok(!("origen" in (adherencia?.params ?? {})));
    assert.ok(!("agrupacion" in (adherencia?.params ?? {})));
  });

  it("expone y serializa fechaDesde/fechaHasta en las 10 tools (precedencia sobre dias)", async () => {
    const { names, schemas, calls } = await collectInformeTools(INFORMES_DIFUSIONES_TOOLS, {
      idCampania: 482,
      dias: 60,
      fechaDesde: "2026-01-01",
      fechaHasta: "2026-01-31",
    });

    assert.equal(names.length, 10);
    for (const name of names) {
      assert.ok("fechaDesde" in schemas[name], `${name} sin fechaDesde`);
      assert.ok("fechaHasta" in schemas[name], `${name} sin fechaHasta`);
      assert.ok("dias" in schemas[name], `${name} sin dias`);
    }

    for (const call of calls) {
      assertNoUsuarioNiHmac(call.params);
      assert.equal(call.params.fechaDesde, "2026-01-01");
      assert.equal(call.params.fechaHasta, "2026-01-31");
      assert.equal(call.params.dias, 60);
    }
  });
});
