import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildInformeQuery,
  informeInputSchema,
  informesPermissionMap,
  resolveInformeParams,
} from "./informesRegistry.js";
import { assertNoUsuarioNiHmac, fakeInformeClient } from "./informesTestUtils.js";

describe("informesRegistry", () => {
  it("traduce page/perPage a start/length y origenes a CSV", () => {
    const client = fakeInformeClient([]);
    const query = buildInformeQuery(
      client,
      {
        idCampania: 482,
        page: 3,
        perPage: 10,
        origenes: ["wa", "email"],
        orderColumn: 2,
        orderDir: "asc",
      },
      { pagination: true, origenes: true }
    );

    assert.equal(query.idCampania, 482);
    assert.equal(query.start, 20);
    assert.equal(query.length, 10);
    assert.equal(query.origen, "wa,email");
    assert.equal(query.orderColumn, 2);
    assert.equal(query.orderDir, "asc");
    assert.ok(!("page" in query));
    assert.ok(!("perPage" in query));
    assert.ok(!("origenes" in query));
    assertNoUsuarioNiHmac(query);
  });

  it("no manda start/length si no hay paginación en los args", () => {
    const client = fakeInformeClient([]);
    const query = buildInformeQuery(client, { idCampania: 482 }, { pagination: true, fechas: true });
    assert.ok(!("start" in query));
    assert.ok(!("length" in query));
    assert.equal(query.idCampania, 482);
  });

  it("page suelto no se traduce a start/length", () => {
    const client = fakeInformeClient([]);
    const query = buildInformeQuery(client, { idCampania: 1, page: 4 }, { page: true });
    assert.equal(query.page, 4);
    assert.ok(!("start" in query));
  });

  it("arma schema solo con los flags pedidos", () => {
    const schema = informeInputSchema({ fechas: true, idMarca: true, pagination: true });
    assert.ok("fechaDesde" in schema);
    assert.ok("idMarca" in schema);
    assert.ok("perPage" in schema);
    assert.ok(!("dias" in schema));
    assert.ok(!("IDUsuario" in schema));
  });

  it("mapea permiso campania/informes", () => {
    const map = informesPermissionMap([
      {
        name: "wibi_informe_demo",
        title: "Demo",
        description: "Demo",
        path: "informes/demo",
        permiso: "informes",
      },
    ]);
    assert.deepEqual(map.wibi_informe_demo, ["campania", "informes"]);
    assert.equal(
      resolveInformeParams({
        name: "x",
        title: "x",
        description: "x",
        path: "x",
        permiso: "informes",
        fechas: true,
      }).fechas,
      true
    );
  });
});
