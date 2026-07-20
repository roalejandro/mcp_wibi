#!/usr/bin/env node
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { loadConfig, loadHttpConfig, type WibiConfig } from "./config.js";
import { WibiClient } from "./wibiClient.js";
import { registerInformesTools } from "./tools/informes.js";
import { registerComportamientoTools } from "./tools/comportamiento.js";
import { registerDifusionesTools } from "./tools/difusiones.js";
import { registerSuscripcionesTools } from "./tools/suscripciones.js";

function createMcpServer(client: WibiClient): McpServer {
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

  return server;
}

function isAuthorized(req: IncomingMessage, expectedToken: string): boolean {
  const header = req.headers.authorization;
  if (!header) return false;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) return false;
  return match[1] === expectedToken;
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

async function startStdio(config: WibiConfig): Promise<void> {
  const client = new WibiClient(config);
  const server = createMcpServer(client);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stderr: stdout está reservado para el transporte JSON-RPC.
  console.error("WIBI MCP Gateway en ejecución (stdio).");
}

async function startHttp(config: WibiConfig): Promise<void> {
  const httpConfig = loadHttpConfig();
  const client = new WibiClient(config);

  const httpServer = createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const path = url.pathname.replace(/\/+$/, "") || "/";

    if (req.method === "GET" && path === "/health") {
      sendJson(res, 200, { ok: true, service: "wibi-mcp-gateway" });
      return;
    }

    if (path !== "/mcp") {
      sendJson(res, 404, { error: "Not found" });
      return;
    }

    if (!isAuthorized(req, httpConfig.token)) {
      sendJson(res, 401, { error: "Unauthorized" });
      return;
    }

    if (req.method === "POST") {
      const server = createMcpServer(client);
      try {
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
        });
        await server.connect(transport);
        await transport.handleRequest(req, res);
        res.on("close", () => {
          void transport.close();
          void server.close();
        });
      } catch (error) {
        console.error("Error handling MCP request:", error);
        if (!res.headersSent) {
          sendJson(res, 500, {
            jsonrpc: "2.0",
            error: { code: -32603, message: "Internal server error" },
            id: null,
          });
        }
        void server.close();
      }
      return;
    }

    // Stateless: GET/DELETE no mantienen sesión SSE.
    sendJson(res, 405, {
      jsonrpc: "2.0",
      error: { code: -32000, message: "Method not allowed." },
      id: null,
    });
  });

  // Dentro del contenedor Docker debe escuchar 0.0.0.0;
  // el aislamiento se hace publicando solo 127.0.0.1:3939 en el host.
  await new Promise<void>((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(httpConfig.port, "0.0.0.0", () => resolve());
  });

  console.error(
    `WIBI MCP Gateway en ejecución (HTTP) en 0.0.0.0:${httpConfig.port} — /mcp + /health`
  );
}

async function main(): Promise<void> {
  const config = loadConfig();
  const transport = (process.env.MCP_TRANSPORT || "stdio").toLowerCase();

  if (transport === "http") {
    await startHttp(config);
    return;
  }

  if (transport !== "stdio") {
    console.error(`ERROR: MCP_TRANSPORT inválido: ${transport} (use stdio|http)`);
    process.exit(1);
  }

  await startStdio(config);
}

main().catch((err) => {
  console.error("Fallo al iniciar el WIBI MCP Gateway:", err);
  process.exit(1);
});
