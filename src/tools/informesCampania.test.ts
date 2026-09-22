import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WibiClient } from "../wibiClient.js";
import { can } from "./helpers.js";
import {
  INFORMES_CAMPANIA_TOOLS,
  informesCampaniaPermissionMap,
  registerInformesCampaniaTools,
} from "./informesCampania.js";

function fakeClient(calls: Array<{ path: string; params: Record<string, unknown> }>): WibiClient {
  return {
    defaultCampania: 13793,
    preferredIdComercio: undefined,
    get: async (path: string, params: Record<string, unknown> = {}) => {
      calls.push({ path, params });
      return { ok: true, path };
    },
  } as unknown as WibiClient;
}

async function collectTools(): Promise<{
  names: string[];
  schemas: Record<string, Record<string, unknown>>;
  calls: Array<{ path: string; params: Record<string, unknown> }>;
}> {
  const names: string[] = [];
  const schemas: Record<string, Record<string, unknown>> = {};
  const calls: Array<{ path: string; params: Record<string, unknown> }> = [];
  const pending: Promise<unknown>[] = [];
  const server = {
    registerTool(
      name: string,
      config: { inputSchema?: Record<string, unknown> },
      handler: (args: Record<string, unknown>) => Promise<unknown>
    ) {
      names.push(name);
      schemas[name] = config.inputSchema ?? {};
      pending.push(handler({ idCampania: 13793, fechaDesde: "2026-08-01", fechaHasta: "2026-08-22" }));
    },
  } as unknown as McpServer;

  registerInformesCampaniaTools(server, fakeClient(calls));
  await Promise.all(pending);
  return { names, schemas, calls };
}

describe("informes de campaña MCP", () => {
  it("registra exactamente 14 tools wibi_informe_*", async () => {
    const { names } = await collectTools();
    assert.equal(INFORMES_CAMPANIA_TOOLS.length, 14);
    assert.deepEqual(names, INFORMES_CAMPANIA_TOOLS.map((tool) => tool.name));
    assert.equal(new Set(names).size, 14);
    for (const name of names) {
      assert.match(name, /^wibi_informe_/);
    }
  });

  it("mapea rutas Laravel y no expone IDUsuario ni HMAC", async () => {
    const { schemas, calls } = await collectTools();
    const expected = {
      wibi_informe_estadisticas_ventas: "informes/ventas",
      wibi_informe_estadisticas_clientes: "informes/clientes",
      wibi_informe_altas_clientes: "informes/altasclientes",
      wibi_informe_clientes_totales: "informes/clientestotales",
      wibi_informe_movimientos: "informes/movimientos",
      wibi_informe_kpis_loyalty: "informes/kpisloyalty",
      wibi_informe_ventas_resumen: "informes/informesventas",
      wibi_informe_ventas_por_fecha: "informes/informesventasfecha",
      wibi_informe_ventas_por_hora: "informes/informesventasventashoras",
      wibi_informe_ventas_por_comercio: "informes/informesventascomercio",
      wibi_informe_ventas_por_categoria: "informes/informesventascategorias",
      wibi_informe_altas_por_comercio: "informes/informesclientescomercio",
      wibi_informe_ventas_por_vendedor: "informes/informesventasvendedor",
      wibi_informe_ventas_por_obra_social: "informes/informesventasobrasocial",
    };

    for (const tool of INFORMES_CAMPANIA_TOOLS) {
      assert.equal(tool.path, expected[tool.name as keyof typeof expected]);
      assert.ok(!( "IDUsuario" in schemas[tool.name]));
      assert.ok(!("fechaDesde" in schemas[tool.name]) === !tool.fechas);
    }

    assert.equal(calls.length, 14);
    for (const call of calls) {
      assert.ok(!("IDUsuario" in call.params));
      assert.ok(!Object.keys(call.params).some((key) => key.toLowerCase().includes("hmac")));
    }
  });

  it("solo las 8 tools detalladas aceptan fechas", () => {
    const dashboard = INFORMES_CAMPANIA_TOOLS.filter((tool) => !tool.fechas);
    const detalle = INFORMES_CAMPANIA_TOOLS.filter((tool) => tool.fechas);
    assert.equal(dashboard.length, 6);
    assert.equal(detalle.length, 8);
    assert.ok(dashboard.every((tool) => tool.permiso === "informacion"));
    assert.ok(detalle.every((tool) => tool.permiso === "informes"));
  });

  it("el proxy de permisos oculta cada grupo", () => {
    const map = informesCampaniaPermissionMap();
    assert.equal(Object.keys(map).length, 14);

    const soloDashboard = { "campania.informacion": ["consultar"] };
    const soloInformes = { "campania.informes": ["consultar"] };

    for (const tool of INFORMES_CAMPANIA_TOOLS) {
      const [seccion, opcion] = map[tool.name];
      assert.equal(seccion, "campania");
      const visibleDashboard = can(soloDashboard, seccion, opcion);
      const visibleInformes = can(soloInformes, seccion, opcion);
      if (tool.permiso === "informacion") {
        assert.equal(visibleDashboard, true, tool.name);
        assert.equal(visibleInformes, false, tool.name);
      } else {
        assert.equal(visibleDashboard, false, tool.name);
        assert.equal(visibleInformes, true, tool.name);
      }
    }
  });
});
