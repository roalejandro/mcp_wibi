/**
 * Arranque stdio con login v2 (comercio o admin del panel).
 * El XML /onzecrm/token no autentica usuarios de la tabla `usuarios`.
 */

import type { ConnectionConfig, StdioAuthConfig } from "./config.js";
import type { WibiSession } from "./wibiAuth.js";
import { WibiAuthService } from "./wibiAuth.js";
import { WibiClient } from "./wibiClient.js";
import type { BuildServerOptions } from "./server.js";

export interface StdioRuntime {
  client: WibiClient;
  serverOpts: BuildServerOptions;
  session: WibiSession;
}

export async function createStdioRuntime(
  conn: ConnectionConfig,
  creds: StdioAuthConfig
): Promise<StdioRuntime> {
  const auth = new WibiAuthService(conn);
  const signedIn = await auth.signInWithCredentials(creds.user, creds.pass);

  if (signedIn.kind === "needs_otp") {
    throw new Error(
      "Este admin tiene 2FA. El modo stdio no puede pedir el código del email. Usá el conector HTTP o un admin sin 2FA."
    );
  }
  if (signedIn.kind === "needs_selection") {
    throw new Error(
      "El login pidió elegir campaña/comercio. En stdio hace falta una sesión admin multi-comercio o el conector HTTP."
    );
  }
  if (signedIn.kind === "error") {
    throw new Error(`Autenticación WIBI fallida: ${signedIn.message}`);
  }

  const living: WibiSession = { ...signedIn.session };
  if (creds.defaultCampania) {
    living.defaultCampania = creds.defaultCampania;
  }

  const client = new WibiClient(
    {
      baseUrl: conn.baseUrl,
      apiKey: conn.apiKey,
      timeoutMs: conn.timeoutMs,
      defaultCampania: living.defaultCampania,
    },
    {
      session: auth.toTokenBundle(living),
      refresher: async (refreshToken) => {
        const refreshed = await auth.refresh(refreshToken);
        if (refreshed.kind !== "ok") {
          throw new Error(
            refreshed.kind === "error"
              ? refreshed.message
              : "No se pudo renovar la sesión WIBI."
          );
        }
        living.wibiToken = refreshed.session.wibiToken;
        living.refreshToken = refreshed.session.refreshToken;
        living.tokenExpiryMs = refreshed.session.tokenExpiryMs;
        living.campanias = refreshed.session.campanias;
        living.scopeMode = refreshed.session.scopeMode ?? living.scopeMode;
        living.permisos = refreshed.session.permisos ?? living.permisos;
        living.preferredIdComercio =
          refreshed.session.preferredIdComercio ?? living.preferredIdComercio;
        return auth.toTokenBundle(living);
      },
    }
  );
  client.setPreferredIdComercio(living.preferredIdComercio);

  const scope: BuildServerOptions["scope"] =
    living.scopeMode === "admin"
      ? {
          listComercios: async (idCampania) => {
            const result = await auth.myScopedComercios(living.wibiToken, idCampania);
            if (result.kind === "error") {
              throw new Error(result.message);
            }
            return result.data.comercios;
          },
          listCampanias: async (opts) => {
            const result = await auth.misCampanias(living.wibiToken, opts);
            if (result.kind === "error") {
              throw new Error(result.message);
            }
            return result.data;
          },
          switchScope: async (idCampania, idComercio) => {
            const switched = await auth.switchScope(living.wibiToken, idCampania, idComercio);
            if (switched.kind !== "ok") {
              throw new Error(
                switched.kind === "error"
                  ? switched.message
                  : "No se pudo cambiar de comercio."
              );
            }

            living.idComercio = switched.session.idComercio;
            living.nombreComercio = switched.session.nombreComercio;
            living.idRed = switched.session.idRed;
            living.campanias = switched.session.campanias;
            living.defaultCampania = idCampania;
            living.preferredIdComercio = idComercio;
            living.scopeMode = switched.session.scopeMode ?? living.scopeMode;
            living.permisos = switched.session.permisos ?? living.permisos;
            living.wibiToken = switched.session.wibiToken;
            living.refreshToken = switched.session.refreshToken;
            living.tokenExpiryMs = switched.session.tokenExpiryMs;

            client.setSession(auth.toTokenBundle(living));
            client.setDefaultCampania(idCampania);
            client.setPreferredIdComercio(idComercio);

            return {
              comercio: {
                idComercio,
                nombre:
                  living.idComercio === idComercio
                    ? living.nombreComercio
                    : `Comercio ${idComercio}`,
                idRed: living.idRed,
              },
              campanias: living.campanias,
              defaultCampania: idCampania,
            };
          },
        }
      : undefined;

  return {
    client,
    session: living,
    serverOpts: {
      campanias: living.campanias,
      defaultCampania: living.defaultCampania,
      comercio: {
        idComercio: living.idComercio,
        nombre: living.nombreComercio,
        idRed: living.idRed,
      },
      actor: living.actor,
      scopeMode: living.scopeMode,
      permisos: living.permisos,
      scope,
    },
  };
}
