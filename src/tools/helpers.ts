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
 * Construye el parámetro IdCampania a enviar: usa el provisto por el modelo
 * o, si no, el configurado por defecto. Si no hay ninguno, deja que el API
 * resuelva la campaña única del comercio.
 */
export function campaniaParam(
  client: WibiClient,
  idCampania?: number
): Record<string, unknown> {
  const value = idCampania ?? client.defaultCampania;
  return value ? { IdCampania: value } : {};
}
