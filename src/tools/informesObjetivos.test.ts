import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { INFORMES_OBJETIVOS_TOOLS } from "./informesObjetivos.js";
import { assertNoUsuarioNiHmac, collectInformeTools } from "./informesTestUtils.js";

describe("informes objetivos MCP", () => {
  it("registra cumplimiento con fechas", async () => {
    const { names, schemas, calls } = await collectInformeTools(INFORMES_OBJETIVOS_TOOLS, {
      idCampania: 482,
      idComercio: 101,
      fechaDesde: "2026-08-01",
      fechaHasta: "2026-08-22",
    });

    assert.deepEqual(names, ["wibi_informe_cumplimiento_objetivos"]);
    assert.equal(INFORMES_OBJETIVOS_TOOLS[0].path, "informes/cumplimientoobjetivos");
    assert.ok("fechaDesde" in schemas[names[0]]);
    assert.ok(!("IDUsuario" in schemas[names[0]]));
    assert.equal(calls[0].params.idComercio, 101);
    assert.equal(calls[0].params.fechaDesde, "2026-08-01");
    assertNoUsuarioNiHmac(calls[0].params);
  });
});
