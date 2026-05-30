#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { WibiClient } from "./wibiClient.js";
import { registerInformesTools } from "./tools/informes.js";
import { registerComportamientoTools } from "./tools/comportamiento.js";
import { registerDifusionesTools } from "./tools/difusiones.js";
import { registerSuscripcionesTools } from "./tools/suscripciones.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const client = new WibiClient(config);

  const server = new McpServer({
    name: "wibi-mcp-gateway",
    version: "0.1.0",
  });

  // Fase 1: lectura (informes y comportamiento de clientes).
  registerInformesTools(server, client);
  registerComportamientoTools(server, client);

  // Fase 2: acciones (difusiones y suscripciones).
  registerDifusionesTools(server, client);
  registerSuscripcionesTools(server, client);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // stderr: stdout está reservado para el transporte JSON-RPC.
  console.error("WIBI MCP Gateway en ejecución (stdio).");
}

main().catch((err) => {
  console.error("Fallo al iniciar el WIBI MCP Gateway:", err);
  process.exit(1);
});
