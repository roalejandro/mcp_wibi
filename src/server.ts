/**
 * Construcción del servidor MCP y registro de herramientas.
 * Reutilizado por stdio y por HTTP/OAuth.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { WibiClient } from "./wibiClient.js";
import type { ActorInfo, CampaniaInfo, ComercioInfo } from "./wibiAuth.js";
import { VERSION } from "./version.js";
import { errorResult, jsonResult } from "./tools/helpers.js";
import { registerInformesTools } from "./tools/informes.js";
import { registerComportamientoTools } from "./tools/comportamiento.js";
import { registerDifusionesTools } from "./tools/difusiones.js";
import { registerSuscripcionesTools } from "./tools/suscripciones.js";

export interface ScopeInfo {
  comercio: { idComercio: number; nombre: string; idRed: number };
  campanias: CampaniaInfo[];
  defaultCampania?: number;
}

export interface ScopeSwitcher {
  /** Lista los comercios de una campaña dentro del alcance del actor real de la sesión. */
  listComercios: (idCampania: number) => Promise<ComercioInfo[]>;
  /**
   * Busca campañas dentro del alcance del actor real de la sesión, con filtro opcional por
   * nombre (para encontrar el idCampania sin que el usuario lo conozca de antemano).
   */
  listCampanias: (opts?: {
    q?: string;
    page?: number;
    perPage?: number;
  }) => Promise<{
    campanias: CampaniaInfo[];
    total: number;
    page: number;
    perPage: number;
    hasMore: boolean;
  }>;
  /** Cambia el comercio/campaña activos de la sesión y devuelve el nuevo alcance. */
  switchScope: (idCampania: number, idComercio: number) => Promise<ScopeInfo>;
}

export interface BuildServerOptions {
  campanias?: CampaniaInfo[];
  defaultCampania?: number;
  comercio?: {
    idComercio: number;
    nombre: string;
    idRed: number;
  };
  /** Presente solo cuando la sesión se originó en un login admin (impersonación). */
  actor?: ActorInfo;
  /** Solo se registra cuando `actor` está presente: permite cambiar de comercio sin relogin. */
  scope?: ScopeSwitcher;
}

export function buildMcpServer(client: WibiClient, opts: BuildServerOptions = {}): McpServer {
  const server = new McpServer({
    name: "wibi-mcp-gateway",
    version: VERSION,
  });

  // Estado mutable de la sesión: `wibi_cambiar_comercio` lo actualiza para que
  // `wibi_mis_campanias` siempre refleje el comercio/campañas vigentes.
  const state: { campanias: CampaniaInfo[]; defaultCampania?: number; comercio?: ScopeInfo["comercio"] } = {
    campanias: opts.campanias ?? [],
    defaultCampania: opts.defaultCampania,
    comercio: opts.comercio,
  };

  if (opts.campanias) {
    server.registerTool(
      "wibi_mis_campanias",
      {
        title: "Mis campañas",
        description:
          "Lista las campañas WIBI a las que la sesión actual tiene acceso (id y nombre) y el comercio activo. Usá idCampania en los demás tools si hay más de una. Si `es_admin` es true, esto solo muestra la campaña del comercio activo (no todo tu alcance de admin): usá wibi_buscar_campanias para encontrar otras campañas por nombre, wibi_comercios_de_campania para ver sus comercios, y wibi_cambiar_comercio para operar otro comercio sin volver a iniciar sesión.",
        inputSchema: {},
      },
      async () =>
        jsonResult({
          comercio: state.comercio ?? null,
          default_campania: state.defaultCampania ?? client.defaultCampania ?? null,
          campanias: state.campanias,
          es_admin: Boolean(opts.actor),
        })
    );
  }

  if (opts.actor && opts.scope) {
    const { listComercios, listCampanias, switchScope } = opts.scope;

    server.registerTool(
      "wibi_buscar_campanias",
      {
        title: "Listar / buscar campañas del admin",
        description:
          "Lista TODAS las campañas WIBI del alcance del administrador (no solo la del comercio activo). Sin `q` lista en páginas (por defecto 100). Con `q` filtra por nombre. Si `hasMore` es true, pedí la página siguiente. Usalo cuando el usuario diga 'pasame las campañas', 'quiero cambiar de campaña' o dé un nombre parcial. Después usá wibi_comercios_de_campania y wibi_cambiar_comercio.",
        inputSchema: {
          q: z
            .string()
            .min(1)
            .max(100)
            .optional()
            .describe("Filtro opcional por nombre. Omitilo para listar todas."),
          page: z
            .number()
            .int()
            .positive()
            .optional()
            .describe("Página (default 1)."),
          perPage: z
            .number()
            .int()
            .positive()
            .max(200)
            .optional()
            .describe("Cantidad por página (default 100, máx 200)."),
        },
      },
      async ({ q, page, perPage }) => {
        try {
          const result = await listCampanias({ q, page, perPage });
          return jsonResult(result);
        } catch (e) {
          return errorResult(e);
        }
      }
    );

    server.registerTool(
      "wibi_comercios_de_campania",
      {
        title: "Comercios de una campaña",
        description:
          "Lista los comercios de una campaña WIBI dentro de tu alcance de administrador. Usalo antes de wibi_cambiar_comercio para saber qué idComercio pasar.",
        inputSchema: {
          idCampania: z.number().int().positive().describe("Campaña a consultar."),
        },
      },
      async ({ idCampania }) => {
        try {
          const comercios = await listComercios(idCampania);
          return jsonResult({ idCampania, comercios });
        } catch (e) {
          return errorResult(e);
        }
      }
    );

    server.registerTool(
      "wibi_cambiar_comercio",
      {
        title: "Cambiar de comercio",
        description:
          "Cambia el comercio y la campaña activos de esta sesión, sin volver a pedir credenciales ni 2FA (solo disponible para administradores del panel WIBI impersonando un comercio). A partir de la respuesta, todos los demás tools operan sobre el nuevo comercio.",
        inputSchema: {
          idCampania: z.number().int().positive(),
          idComercio: z.number().int().positive(),
        },
      },
      async ({ idCampania, idComercio }) => {
        try {
          const nuevoAlcance = await switchScope(idCampania, idComercio);
          state.comercio = nuevoAlcance.comercio;
          state.campanias = nuevoAlcance.campanias;
          state.defaultCampania = nuevoAlcance.defaultCampania;

          return jsonResult({
            ok: true,
            comercio: nuevoAlcance.comercio,
            campanias: nuevoAlcance.campanias,
          });
        } catch (e) {
          return errorResult(e);
        }
      }
    );
  }

  registerInformesTools(server, client);
  registerComportamientoTools(server, client);
  registerDifusionesTools(server, client);
  registerSuscripcionesTools(server, client);

  return server;
}

/** Alias de compatibilidad. */
export function createMcpServer(client: WibiClient): McpServer {
  return buildMcpServer(client);
}
