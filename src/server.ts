/**
 * Construcción del servidor MCP y registro de herramientas.
 * Reutilizado por stdio y por HTTP/OAuth.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WibiClient } from "./wibiClient.js";
import type { CampaniaInfo } from "./wibiAuth.js";
import { VERSION } from "./version.js";
import { jsonResult } from "./tools/helpers.js";
import { registerInformesTools } from "./tools/informes.js";
import { registerComportamientoTools } from "./tools/comportamiento.js";
import { registerDifusionesTools } from "./tools/difusiones.js";
import { registerSuscripcionesTools } from "./tools/suscripciones.js";

export interface BuildServerOptions {
  campanias?: CampaniaInfo[];
  defaultCampania?: number;
  comercio?: {
    idComercio: number;
    nombre: string;
    idRed: number;
  };
}

export function buildMcpServer(client: WibiClient, opts: BuildServerOptions = {}): McpServer {
  const server = new McpServer({
    name: "wibi-mcp-gateway",
    version: VERSION,
  });

  if (opts.campanias) {
    const campanias = opts.campanias;
    const comercio = opts.comercio;
    server.registerTool(
      "wibi_mis_campanias",
      {
        title: "Mis campañas",
        description:
          "Lista las campañas WIBI a las que el comercio autenticado tiene acceso (id y nombre). Usá idCampania en los demás tools si hay más de una.",
        inputSchema: {},
      },
      async () =>
        jsonResult({
          comercio: comercio ?? null,
          default_campania: opts.defaultCampania ?? client.defaultCampania ?? null,
          campanias,
        })
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
