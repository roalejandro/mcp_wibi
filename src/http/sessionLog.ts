/** Log de sesión sin JWT, refresh tokens ni hashes completos. */
export function logSessionEvent(
  sessionId: string | undefined,
  event: string,
  result: string
): void {
  const label = sessionId ? sessionId.slice(0, 8) : "none";
  console.error(`[wibi-mcp-gateway] session=${label} event=${event} result=${result}`);
}
