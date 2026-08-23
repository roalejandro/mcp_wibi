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
import { buildMcpServer } from "./server.js";
import { startHttpServer } from "./http/httpServer.js";
import { createStdioRuntime } from "./stdioSession.js";

async function main(): Promise<void> {
  const transport = resolveTransport(process.argv.slice(2));
  const conn = loadConnectionConfig();

  if (transport === "http") {
    await startHttpServer(conn, loadHttpConfig());
    return;
  }

  const creds = loadStdioAuth();
  const runtime = await createStdioRuntime(conn, creds);
  const server = buildMcpServer(runtime.client, runtime.serverOpts);
  const stdio = new StdioServerTransport();
  await server.connect(stdio);
  const actor = runtime.session.actor?.nombre ?? creds.user;
  const modo = runtime.session.scopeMode ?? "comercio";
  console.error(
    `[wibi-mcp-gateway] stdio conectado. base=${conn.baseUrl} modo=${modo} actor=${actor}` +
      (runtime.serverOpts.defaultCampania ? ` campania=${runtime.serverOpts.defaultCampania}` : "")
  );
}

main().catch((err) => {
  console.error("[wibi-mcp-gateway] error fatal al iniciar:", err);
  process.exit(1);
});
