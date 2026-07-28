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

/** Construye alcance de campaña y filtro de comercio para consultas admin. */
export function scopeParams(
  client: WibiClient,
  args: { idCampania?: number; idComercio?: number }
): Record<string, unknown> {
  const idComercio = args.idComercio ?? client.preferredIdComercio;
  return {
    ...campaniaParam(client, args.idCampania),
    ...(idComercio ? { idComercio } : {}),
  };
}

/**
 * Comprueba permisos del panel. Una sesión de comercio sin mapa conserva el
 * comportamiento histórico y puede registrar todas las herramientas.
 * Alineado a WibiPermissionService (Laravel): consultar acepta acceso; exportar=imprimir.
 */
export function can(
  permisos: Record<string, string[]> | undefined,
  seccion: string,
  opcion: string,
  accion = "consultar"
): boolean {
  if (!permisos) return true;
  if (permisos["*"]) return true;

  const actions = permisos[`${seccion}.${opcion}`] ?? [];
  if (actions.length === 0) return false;

  const needed =
    accion === "exportar" || accion === "imprimir" || accion === "exportar_detalle"
      ? "exportar"
      : accion;

  if (needed === "consultar" || needed === "ver" || needed === "listar") {
    return (
      actions.includes("consultar") ||
      actions.includes("acceso") ||
      actions.includes("*") ||
      actions.length > 0
    );
  }

  return actions.includes("*") || actions.includes(needed);
}
