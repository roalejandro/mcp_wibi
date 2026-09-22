import type { Response } from "express";

export const INVALID_TOKEN_BODY = JSON.stringify({
  error: "invalid_token",
  error_description: "Sesión WIBI inválida o expirada. Volvé a conectar el conector.",
});

/**
 * Si el refresh WIBI queda muerto durante el request, la respuesta HTTP sale
 * como 401 invalid_token. El SDK de MCP envolvería el fallo como resultado de tool.
 */
export function installInvalidTokenOverride(
  res: Response,
  signal: { expired: boolean }
): void {
  const writeHead = res.writeHead.bind(res) as (...args: unknown[]) => unknown;
  let replaced = false;

  res.writeHead = ((status: number, headers?: unknown, ...rest: unknown[]) => {
    if (!signal.expired || res.headersSent) {
      return writeHead(status, headers, ...rest);
    }
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
    if (!signal.expired) return write(chunk, ...args);
    if (replaced) return true;
    replaced = true;
    return write(INVALID_TOKEN_BODY, ...args);
  }) as typeof res.write;

  const end = res.end.bind(res) as (chunk?: unknown, ...args: unknown[]) => unknown;
  res.end = ((chunk?: unknown, ...args: unknown[]) => {
    if (!signal.expired) return end(chunk, ...args);
    if (replaced) return end(undefined, ...args);
    replaced = true;
    return end(INVALID_TOKEN_BODY, ...args);
  }) as typeof res.end;
}
