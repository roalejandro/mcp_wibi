import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { WibiSession } from "../wibiAuth.js";
import type { TokenBundle } from "../wibiClient.js";
import { createAdminScope } from "./adminScope.js";

function session(): WibiSession {
  return {
    wibiToken: "jwt-viejo",
    refreshToken: "R0",
    tokenExpiryMs: Date.now() + 60_000,
    idComercio: 1,
    nombreComercio: "Viejo",
    idRed: 2,
    campanias: [],
    scopeMode: "admin",
  };
}

describe("createAdminScope", () => {
  it("busca, lista comercios y cambia de comercio con el JWT vigente", async () => {
    const current = session();
    const seen: string[] = [];
    let persisted: WibiSession | undefined;
    let applied: TokenBundle | undefined;
    let commerceId = -1;

    const scope = createAdminScope({
      auth: {
        myScopedComercios: async (token) => {
          seen.push(token);
          return { kind: "ok", data: { comercios: [] } };
        },
        misCampanias: async (token) => {
          seen.push(token);
          return {
            kind: "ok",
            data: { campanias: [], total: 0, page: 1, perPage: 0, hasMore: false },
          };
        },
        switchScope: async (token) => {
          seen.push(token);
          return {
            kind: "ok",
            session: {
              ...current,
              wibiToken: "jwt-nuevo",
              refreshToken: "R1",
              idComercio: 9,
              nombreComercio: "Nuevo",
              idRed: 3,
              campanias: [{ idCampania: 4, nombre: "Campaña" }],
            },
          };
        },
      },
      client: {
        getValidAccessToken: async () => "jwt-fresh",
        setSession: (bundle) => {
          applied = bundle;
        },
        setDefaultCampania: () => {},
        setPreferredIdComercio: () => {},
      },
      session: current,
      persist: async (next) => {
        persisted = { ...next };
      },
      onCommerceChange: (idComercio) => {
        commerceId = idComercio;
      },
    });

    await scope.listCampanias();
    await scope.listComercios(4);
    const changed = await scope.switchScope(4, 9);

    assert.deepEqual(seen, ["jwt-fresh", "jwt-fresh", "jwt-fresh"]);
    assert.equal(persisted?.wibiToken, "jwt-nuevo");
    assert.equal(persisted?.refreshToken, "R1");
    assert.equal(applied?.accessToken, "jwt-nuevo");
    assert.equal(commerceId, 0);
    assert.equal(changed.defaultCampania, 4);
    assert.equal(changed.comercio.nombre, "Nuevo");
  });
});
