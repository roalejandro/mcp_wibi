/**
 * Construcción del servidor MCP y registro de herramientas.
 * Reutilizado por stdio y por HTTP/OAuth.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { WibiClient } from "./wibiClient.js";
import type { ActorInfo, CampaniaInfo, ComercioInfo } from "./wibiAuth.js";
import { VERSION } from "./version.js";
import { can, errorResult, jsonResult } from "./tools/helpers.js";
import { registerInformesTools } from "./tools/informes.js";
import { registerComportamientoTools } from "./tools/comportamiento.js";
import { registerDifusionesTools } from "./tools/difusiones.js";
import { registerSuscripcionesTools } from "./tools/suscripciones.js";
import { registerExportTools } from "./tools/export.js";
import { registerTagsTools } from "./tools/tags.js";
import { informesCampaniaPermissionMap, registerInformesCampaniaTools } from "./tools/informesCampania.js";
import { informesMarcasPermissionMap, registerInformesMarcasTools } from "./tools/informesMarcas.js";
import { informesDifusionesPermissionMap, registerInformesDifusionesTools } from "./tools/informesDifusiones.js";
import { informesObjetivosPermissionMap, registerInformesObjetivosTools } from "./tools/informesObjetivos.js";
import { informesMetaPermissionMap, registerInformesMetaTools } from "./tools/informesMeta.js";
import {
  informesVentasDetallePermissionMap,
  registerInformesVentasDetalleTools,
} from "./tools/informesVentasDetalle.js";

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
  scopeMode?: "admin" | "comercio";
  permisos?: Record<string, string[]>;
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
          "Devuelve las campañas guardadas en esta sesión al conectarse o al cambiar de comercio. No consulta WIBI en ese momento. Para el listado actual del backend usá wibi_buscar_campanias. Un admin ve las campañas de la sesión y las consultas incluyen por defecto todos los comercios permitidos; puede aplicar un filtro opcional con idComercio.",
        inputSchema: {},
      },
      async () =>
        jsonResult({
          comercio: state.comercio ?? null,
          default_campania: state.defaultCampania ?? client.defaultCampania ?? null,
          campanias: state.campanias,
          es_admin: opts.scopeMode === "admin",
        })
    );
  }

  if (opts.scopeMode === "admin" && opts.scope) {
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
          "Lista los comercios de una campaña WIBI dentro de tu alcance de administrador. Usalo para conocer un idComercio y aplicarlo como filtro opcional en las consultas o exports.",
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
          "Fija la campaña por defecto y una preferencia opcional de filtro idComercio, sin volver a pedir credenciales ni 2FA. No impersona ni restringe la sesión admin: podés reemplazar u omitir idComercio en cada consulta.",
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
          client.setDefaultCampania(nuevoAlcance.defaultCampania);
          client.setPreferredIdComercio(nuevoAlcance.comercio.idComercio);

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

  // Mapeo alineado a WibiPermissionService / comun/menu_opciones del panel.
  const toolPermissions: Record<string, [string, string, string?]> = {
    wibi_listar_movimientos: ["campania", "movimientos"],
    wibi_detalle_movimiento: ["campania", "movimientos"],
    wibi_buscar_clientes: ["campania", "clientes"],
    wibi_cliente_comportamiento: ["campania", "clientes"],
    wibi_analisis_clientes: ["campania", "analisis"],
    wibi_listar_productos: ["configuracion", "productos"],
    wibi_listar_clasificadores: ["campania", "clientes"],
    wibi_listar_marcas: ["configuracion", "marcas"],
    wibi_listar_segmentos: ["configuracion", "segmentosproductos"],
    wibi_listar_segmentos_productos: ["configuracion", "segmentosproductos", "consultar"],
    wibi_listar_tags: ["configuracion", "etiquetas", "consultar"],
    wibi_crear_tag: ["configuracion", "etiquetas", "insertar"],
    wibi_modificar_tag: ["configuracion", "etiquetas", "modificar"],
    wibi_listar_cupones: ["campania", "cupones"],
    wibi_detalle_cupon: ["campania", "cupones"],
    wibi_asignar_tags: ["whatsapp", "difusiones"],
    wibi_crear_plantilla_whatsapp: ["whatsapp", "difusiones"],
    wibi_programar_difusion: ["whatsapp", "difusiones"],
    wibi_consultar_difusiones: ["whatsapp", "difusiones"],
    wibi_detalle_difusion: ["whatsapp", "difusiones"],
    wibi_crear_tipo_alerta: ["configuracion", "tiposalerta"],
    wibi_crear_suscripcion: ["campania", "suscripciones"],
    wibi_consultar_suscripciones: ["campania", "suscripciones"],
    wibi_exportar_clientes: ["campania", "clientes", "exportar"],
    wibi_exportar_movimientos: ["campania", "movimientos", "exportar"],
    ...informesCampaniaPermissionMap(),
    ...informesMarcasPermissionMap(),
    ...informesDifusionesPermissionMap(),
    ...informesObjetivosPermissionMap(),
    ...informesMetaPermissionMap(),
    ...informesVentasDetallePermissionMap(),
  };
  const permissionedServer = new Proxy(server, {
    get(target, property, receiver) {
      if (property !== "registerTool") return Reflect.get(target, property, receiver);
      return (name: string, ...args: unknown[]) => {
        const permission = toolPermissions[name];
        if (!permission || can(opts.permisos, permission[0], permission[1], permission[2])) {
          return (target.registerTool as (...toolArgs: unknown[]) => unknown)(name, ...args);
        }
      };
    },
  }) as McpServer;

  registerInformesTools(permissionedServer, client);
  registerInformesCampaniaTools(permissionedServer, client);
  registerInformesMarcasTools(permissionedServer, client);
  registerInformesDifusionesTools(permissionedServer, client);
  registerInformesObjetivosTools(permissionedServer, client);
  registerInformesMetaTools(permissionedServer, client);
  registerInformesVentasDetalleTools(permissionedServer, client);
  registerComportamientoTools(permissionedServer, client);
  registerDifusionesTools(permissionedServer, client);
  registerSuscripcionesTools(permissionedServer, client);
  registerExportTools(permissionedServer, client);
  registerTagsTools(permissionedServer, client);

  return server;
}

/** Alias de compatibilidad. */
export function createMcpServer(client: WibiClient): McpServer {
  return buildMcpServer(client);
}
