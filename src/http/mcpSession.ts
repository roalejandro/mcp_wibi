/**
 * Recuperación de sesión Streamable HTTP.
 * El transport vive en RAM; el OAuth vive en Redis. Un session-id viejo
 * no debe forzar relogin si el Bearer sigue válido.
 */

export type McpSessionAction = "handle_existing" | "initialize_new" | "not_found";

export function resolveMcpSessionAction(input: {
  hasBoundTransport: boolean;
  isInitialize: boolean;
}): McpSessionAction {
  if (input.hasBoundTransport) {
    return "handle_existing";
  }
  if (input.isInitialize) {
    return "initialize_new";
  }
  return "not_found";
}
