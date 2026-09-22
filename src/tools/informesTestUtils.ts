import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WibiClient } from "../wibiClient.js";
import { registerInformeTools, type InformeToolDef } from "./informesRegistry.js";

export function fakeInformeClient(
  calls: Array<{ path: string; params: Record<string, unknown> }>
): WibiClient {
  return {
    defaultCampania: 13793,
    preferredIdComercio: undefined,
    get: async (path: string, params: Record<string, unknown> = {}) => {
      calls.push({ path, params });
      return { ok: true, path };
    },
  } as unknown as WibiClient;
}

export async function collectInformeTools(
  tools: InformeToolDef[],
  handlerArgs: Record<string, unknown> = { idCampania: 13793 }
): Promise<{
  names: string[];
  schemas: Record<string, Record<string, unknown>>;
  calls: Array<{ path: string; params: Record<string, unknown> }>;
}> {
  const names: string[] = [];
  const schemas: Record<string, Record<string, unknown>> = {};
  const calls: Array<{ path: string; params: Record<string, unknown> }> = [];
  const pending: Promise<unknown>[] = [];
  const server = {
    registerTool(
      name: string,
      config: { inputSchema?: Record<string, unknown> },
      handler: (args: Record<string, unknown>) => Promise<unknown>
    ) {
      names.push(name);
      schemas[name] = config.inputSchema ?? {};
      pending.push(handler(handlerArgs));
    },
  } as unknown as McpServer;

  registerInformeTools(server, fakeInformeClient(calls), tools);
  await Promise.all(pending);
  return { names, schemas, calls };
}

export function assertNoUsuarioNiHmac(params: Record<string, unknown>): void {
  if ("IDUsuario" in params || "idUsuario" in params) {
    throw new Error("No se debe enviar IDUsuario");
  }
  if (Object.keys(params).some((key) => key.toLowerCase().includes("hmac"))) {
    throw new Error("No se debe enviar HMAC");
  }
}
