import type { Response } from "express";

export const INVALID_TOKEN_BODY = JSON.stringify({
  error: "invalid_token",
  error_description: "Sesión WIBI inválida o expirada. Volvé a conectar el conector.",
});

/**
 * Si el refresh WIBI queda muerto durante el request, la respuesta HTTP sale
 * como 401 invalid_token. El SDK de MCP envolvería el fallo como resultado de tool.
 *
 * Sólo se reemplaza el cuerpo cuando también se pudo reemplazar el status. Una
 * respuesta SSE ya manda el 200 `text/event-stream` antes de correr la tool: si
 * ahí se pisara el evento con este JSON, el cliente no recibe nunca la respuesta
 * JSON-RPC y queda colgado hasta su timeout. En ese caso el resultado de error
 * de la tool pasa intacto y el siguiente request recibe el 401 (la sesión ya
 * quedó revocada en el store).
 */
export function installInvalidTokenOverride(
  res: Response,
  signal: { expired: boolean }
): void {
  const writeHead = res.writeHead.bind(res) as (...args: unknown[]) => unknown;
  let headReplaced = false;
  let replaced = false;

  res.writeHead = ((status: number, headers?: unknown, ...rest: unknown[]) => {
    if (!signal.expired || res.headersSent) {
      return writeHead(status, headers, ...rest);
    }
    headReplaced = true;
    const nextHeaders =
      headers && typeof headers === "object" && !Array.isArray(headers)
        ? { ...(headers as Record<string, unknown>) }
        : undefined;
    if (nextHeaders) {
      delete nextHeaders["Content-Length"];
      delete nextHeaders["content-length"];
      nextHeaders["Content-Type"] = "application/json";
      nextHeaders["WWW-Authenticate"] = 'Bearer error="invalid_token"';
      return writeHead(401, nextHeaders, ...rest);
    }
    res.removeHeader("Content-Length");
    res.setHeader("Content-Type", "application/json");
    res.setHeader("WWW-Authenticate", 'Bearer error="invalid_token"');
    return writeHead(401, headers, ...rest);
  }) as typeof res.writeHead;

  const write = res.write.bind(res) as (chunk: unknown, ...args: unknown[]) => unknown;
  res.write = ((chunk: unknown, ...args: unknown[]) => {
    if (!signal.expired || !headReplaced) return write(chunk, ...args);
    if (replaced) return true;
    replaced = true;
    return write(INVALID_TOKEN_BODY, ...args);
  }) as typeof res.write;

  const end = res.end.bind(res) as (chunk?: unknown, ...args: unknown[]) => unknown;
  res.end = ((chunk?: unknown, ...args: unknown[]) => {
    if (!signal.expired || !headReplaced) return end(chunk, ...args);
    if (replaced) return end(undefined, ...args);
    replaced = true;
    return end(INVALID_TOKEN_BODY, ...args);
  }) as typeof res.end;
}
