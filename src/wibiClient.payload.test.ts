import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { unwrapWibiPayload } from "./wibiClient.js";

describe("unwrapWibiPayload", () => {
  it("desempaqueta el envelope v2 success/data", () => {
    assert.deepEqual(unwrapWibiPayload({ success: true, data: { items: [1] } }), { items: [1] });
  });

  it("conserva informes crudos con su propia clave data", () => {
    const payload = {
      error: "",
      categories: ["A"],
      data: [10],
      objetivos: [12],
      acumulado: [{ x: "2026-08-01", y: 10 }],
    };
    assert.deepEqual(unwrapWibiPayload(payload), payload);
  });

  it("conserva informes que mezclan success, data y categories", () => {
    const payload = {
      success: true,
      error: "",
      data: [1, 2, 3],
      categories: ["Jun", "Jul", "Ago"],
      total_altas: 6,
      variacion_altas: 10,
    };
    assert.deepEqual(unwrapWibiPayload(payload), payload);
  });
});
