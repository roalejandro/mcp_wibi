import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { INFORMES_VENTAS_DETALLE_TOOLS } from "./informesVentasDetalle.js";
import { assertNoUsuarioNiHmac, collectInformeTools } from "./informesTestUtils.js";

describe("informes top ventas MCP", () => {
  it("registra top productos y clientes con paginación", async () => {
    const { names, calls } = await collectInformeTools(INFORMES_VENTAS_DETALLE_TOOLS, {
      idCampania: 482,
      idComercio: 77,
      fechaDesde: "2026-08-01",
      fechaHasta: "2026-08-22",
      page: 1,
      perPage: 10,
      orderColumn: 2,
      orderDir: "desc",
    });

    assert.deepEqual(names, ["wibi_informe_top_productos", "wibi_informe_top_clientes"]);
    assert.equal(INFORMES_VENTAS_DETALLE_TOOLS[0].path, "informes/informesventasproductos");
    assert.equal(INFORMES_VENTAS_DETALLE_TOOLS[1].path, "informes/informesventasclientes");

    for (const call of calls) {
      assertNoUsuarioNiHmac(call.params);
      assert.equal(call.params.start, 0);
      assert.equal(call.params.length, 10);
      assert.equal(call.params.orderColumn, 2);
      assert.equal(call.params.idComercio, 77);
      assert.ok(!("page" in call.params));
    }
  });
});
