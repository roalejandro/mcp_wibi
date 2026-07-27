import type { WibiClient } from "../wibiClient.js";

/** Resultado de herramienta MCP en formato texto JSON. */
export function jsonResult(data: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

/** Resultado de error legible por el modelo. */
export function errorResult(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return {
    isError: true,
    content: [{ type: "text" as const, text: `Error: ${message}` }],
  };
}

/**
 * Construye el query param idCampania (minúscula, como espera Laravel).
 * Usa el valor del modelo o el default del cliente.
 */
export function campaniaParam(
  client: WibiClient,
  idCampania?: number
): Record<string, unknown> {
  const value = idCampania ?? client.defaultCampania;
  return value ? { idCampania: value } : {};
}
