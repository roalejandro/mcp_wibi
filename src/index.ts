#!/usr/bin/env node
/**
 * WIBI MCP Gateway
 *
 * Transportes:
 *  - stdio (default): credenciales fijas WIBI_USER/WIBI_PASS (desarrollo local).
 *  - http (--http / MCP_TRANSPORT=http): OAuth 2.1 multi-tenant para claude.ai.
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  loadConnectionConfig,
  loadHttpConfig,
  loadStdioAuth,
  resolveTransport,
} from "./config.js";
import { WibiClient } from "./wibiClient.js";
import { buildMcpServer } from "./server.js";
import { startHttpServer } from "./http/httpServer.js";

async function main(): Promise<void> {
  const transport = resolveTransport(process.argv.slice(2));
  const conn = loadConnectionConfig();

  if (transport === "http") {
    await startHttpServer(conn, loadHttpConfig());
    return;
  }

  const auth = loadStdioAuth();
  const client = new WibiClient({ ...conn, ...auth });
  const server = buildMcpServer(client);
  const stdio = new StdioServerTransport();
  await server.connect(stdio);
  console.error(
    `[wibi-mcp-gateway] stdio conectado. base=${conn.baseUrl}` +
      (auth.defaultCampania ? ` campania=${auth.defaultCampania}` : "")
  );
}

main().catch((err) => {
  console.error("[wibi-mcp-gateway] error fatal al iniciar:", err);
  process.exit(1);
});
