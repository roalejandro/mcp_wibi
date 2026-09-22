import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { INFORMES_MARCAS_TOOLS } from "./informesMarcas.js";
import { assertNoUsuarioNiHmac, collectInformeTools } from "./informesTestUtils.js";

const EXPECTED: Record<string, string> = {
  wibi_informe_clasificadores_disponibles: "informes/validarclasificadores",
  wibi_informe_ventas_por_marca: "informes/ventasmarcas",
  wibi_informe_ventas_por_segmento: "informes/ventassegmentos",
  wibi_informe_ventas_por_clasificador: "informes/ventasclasificadores",
  wibi_informe_clientes_por_marca: "informes/ventasclientesmarca",
  wibi_informe_clientes_por_segmento: "informes/ventasclientessegmento",
  wibi_informe_evolucion_marca: "informes/evolucionmarca",
  wibi_informe_evolucion_segmento: "informes/evolucionsegmento",
};

describe("informes marcas MCP", () => {
  it("registra 8 tools con paths Laravel", async () => {
    const { names, schemas, calls } = await collectInformeTools(INFORMES_MARCAS_TOOLS, {
      idCampania: 482,
      fechaDesde: "2026-08-01",
      fechaHasta: "2026-08-22",
      tipoClasificador: 1,
      idMarca: 9,
      idSegmento: 3,
      page: 2,
      perPage: 10,
      orderColumn: 2,
      orderDir: "desc",
    });

    assert.equal(names.length, 8);
    assert.deepEqual(names, INFORMES_MARCAS_TOOLS.map((tool) => tool.name));
    for (const tool of INFORMES_MARCAS_TOOLS) {
      assert.equal(tool.path, EXPECTED[tool.name]);
      assert.ok(!("IDUsuario" in schemas[tool.name]));
    }

    assert.equal(calls.length, 8);
    for (const call of calls) {
      assertNoUsuarioNiHmac(call.params);
    }

    const marcas = calls.find((call) => call.path === "informes/ventasmarcas");
    assert.equal(marcas?.params.start, 10);
    assert.equal(marcas?.params.length, 10);
    assert.equal(marcas?.params.fechaDesde, "2026-08-01");

    const clasif = calls.find((call) => call.path === "informes/ventasclasificadores");
    assert.equal(clasif?.params.tipoClasificador, 1);

    const clientesMarca = calls.find((call) => call.path === "informes/ventasclientesmarca");
    assert.equal(clientesMarca?.params.idMarca, 9);

    const evoSeg = calls.find((call) => call.path === "informes/evolucionsegmento");
    assert.equal(evoSeg?.params.idSegmento, 3);
    assert.ok(!("start" in (evoSeg?.params ?? {})));
  });
});
