import type { WibiClient } from "../wibiClient.js";
import type { ScopeSwitcher } from "../server.js";
import type { WibiAuthService, WibiSession } from "../wibiAuth.js";

type AdminAuthApi = Pick<
  WibiAuthService,
  "myScopedComercios" | "misCampanias" | "switchScope"
>;

/**
 * Las tools de alcance admin piden el JWT vigente al mismo cliente que refresca
 * el resto de las consultas. `wibi_mis_campanias` no entra acá: es un snapshot local.
 */
export function createAdminScope(input: {
  auth: AdminAuthApi;
  client: Pick<
    WibiClient,
    "getValidAccessToken" | "setSession" | "setDefaultCampania" | "setPreferredIdComercio"
  >;
  session: WibiSession;
  persist: (session: WibiSession) => Promise<void>;
  onCommerceChange?: (idComercio: number) => void;
}): ScopeSwitcher {
  const { auth, client, session, persist, onCommerceChange } = input;

  return {
    listComercios: async (idCampania) => {
      const token = await client.getValidAccessToken();
      const result = await auth.myScopedComercios(token, idCampania);
      if (result.kind === "error") throw new Error(result.message);
      return result.data.comercios;
    },
    listCampanias: async (opts = {}) => {
      const token = await client.getValidAccessToken();
      const result = await auth.misCampanias(token, opts);
      if (result.kind === "error") throw new Error(result.message);
      return result.data;
    },
    switchScope: async (idCampania, idComercio) => {
      const token = await client.getValidAccessToken();
      const switched = await auth.switchScope(token, idCampania, idComercio);
      if (switched.kind !== "ok") {
        throw new Error(
          switched.kind === "error" ? switched.message : "No se pudo cambiar de comercio."
        );
      }

      session.idComercio = switched.session.idComercio;
      session.nombreComercio = switched.session.nombreComercio;
      session.idRed = switched.session.idRed;
      session.campanias = switched.session.campanias;
      session.defaultCampania = idCampania;
      session.preferredIdComercio = idComercio;
      session.scopeMode = switched.session.scopeMode ?? session.scopeMode;
      session.permisos = switched.session.permisos ?? session.permisos;
      session.wibiToken = switched.session.wibiToken;
      session.refreshToken = switched.session.refreshToken;
      session.tokenExpiryMs = switched.session.tokenExpiryMs;

      await persist(session);
      client.setSession({
        accessToken: session.wibiToken,
        refreshToken: session.refreshToken,
        expiresAtMs: session.tokenExpiryMs,
      });
      client.setDefaultCampania(idCampania);
      client.setPreferredIdComercio(idComercio);
      onCommerceChange?.(session.scopeMode === "admin" ? 0 : session.idComercio);

      return {
        comercio: {
          idComercio,
          nombre:
            session.idComercio === idComercio
              ? session.nombreComercio
              : `Comercio ${idComercio}`,
          idRed: session.idRed,
        },
        campanias: session.campanias,
        defaultCampania: idCampania,
      };
    },
  };
}
