import { randomUUID } from "node:crypto";
import { z } from "zod";
import { can, errorResult, jsonResult } from "./helpers.js";

export const READONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
};

export const WRITE = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true,
};

export const DESTRUCTIVE = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: true,
};

export const idCampania = z
  .number()
  .int()
  .positive()
  .optional()
  .describe("Campaña destino. Opcional si la sesión ya tiene una campaña.");

export const idCampaniaObligatoria = z
  .number()
  .int()
  .positive()
  .describe("Campaña destino. La API la exige en este método.");

export const idComercio = z
  .number()
  .int()
  .positive()
  .optional()
  .describe("Comercio del alcance. En una campaña con varias sucursales, indicalo.");

export const operationId = z
  .string()
  .min(8)
  .max(80)
  .optional()
  .describe("Identificador para reintentar esta misma ejecución. Si se omite, se genera uno nuevo.");

const SECRETOS = /^(pass|clave|token|apikey|api_key|apitoken)$/i;

/** Un id por ejecución. El reintento interno del cliente reutiliza el body ya armado. */
export function identificadorOperacion(pedido?: string): string {
  const limpio = pedido?.trim();
  return limpio ? limpio : randomUUID();
}

export function ocultarSecretos(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(ocultarSecretos);
  if (!valor || typeof valor !== "object") return valor;
  const salida: Record<string, unknown> = {};
  for (const [clave, contenido] of Object.entries(valor as Record<string, unknown>)) {
    if (SECRETOS.test(clave)) continue;
    salida[clave] = ocultarSecretos(contenido);
  }
  return salida;
}

function mensajeSinSecretos(error: unknown, secretos: string[]): Error {
  const texto = error instanceof Error ? error.message : String(error);
  const limpio = secretos
    .filter((secreto) => secreto.length >= 4)
    .reduce((actual, secreto) => actual.split(secreto).join("[oculto]"), texto);
  return new Error(limpio);
}

export async function ejecutar(
  trabajo: () => Promise<unknown>,
  secretos: Array<string | undefined> = []
): Promise<ReturnType<typeof jsonResult>> {
  const sensibles = secretos.filter((valor): valor is string => Boolean(valor));
  try {
    return jsonResult(ocultarSecretos(await trabajo()));
  } catch (error) {
    return errorResult(mensajeSinSecretos(error, sensibles));
  }
}

export type Permiso = [string, string, string];

export interface ContratoAdmin {
  name: string;
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  path: string;
  permission: Permiso;
  /** El estado de una exportación depende del tipo de la tarea. */
  alternatePermission?: Permiso;
  destructive: boolean;
  operationId: boolean;
}

export const CONTRATOS_ADMIN: ContratoAdmin[] = [
  { name: "wibi_alta_cliente", method: "POST", path: "clientes/guardar", permission: ["campania", "clientes", "insertar"], destructive: false, operationId: true },
  { name: "wibi_editar_cliente", method: "POST", path: "clientes/guardar", permission: ["campania", "clientes", "modificar"], destructive: true, operationId: true },
  { name: "wibi_ficha_cliente", method: "GET", path: "clientes/{id}/ficha", permission: ["campania", "clientes", "consultar"], destructive: false, operationId: false },
  { name: "wibi_resumen_cliente", method: "GET", path: "clientes/{id}/resumen", permission: ["campania", "clientes", "consultar"], destructive: false, operationId: false },
  { name: "wibi_transacciones_cliente", method: "GET", path: "clientes/{id}/transacciones", permission: ["campania", "clientes", "consultar"], destructive: false, operationId: false },
  { name: "wibi_estado_cliente", method: "PATCH", path: "clientes/{id}/estado", permission: ["campania", "clientes", "desactivar"], destructive: true, operationId: true },
  { name: "wibi_reset_clave_cliente", method: "POST", path: "clientes/{id}/reset-clave", permission: ["campania", "clientes", "modificar"], destructive: true, operationId: true },
  { name: "wibi_reemplazar_tags_cliente", method: "PUT", path: "clientes/etiquetas", permission: ["configuracion", "etiquetas", "modificar"], destructive: true, operationId: false },
  { name: "wibi_sumar_puntos", method: "POST", path: "movimientos/comando", permission: ["campania", "movimientos", "insertar"], destructive: true, operationId: true },
  { name: "wibi_restar_puntos", method: "POST", path: "movimientos/comando", permission: ["campania", "movimientos", "insertar"], destructive: true, operationId: true },
  { name: "wibi_anular_puntos", method: "POST", path: "movimientos/comando", permission: ["campania", "movimientos", "eliminar"], destructive: true, operationId: true },
  { name: "wibi_registrar_venta", method: "POST", path: "ventas/comando", permission: ["campania", "movimientos", "insertar"], destructive: true, operationId: true },
  { name: "wibi_devolver_venta", method: "POST", path: "ventas/comando", permission: ["campania", "movimientos", "insertar"], destructive: true, operationId: true },
  { name: "wibi_anular_venta", method: "POST", path: "ventas/comando", permission: ["campania", "movimientos", "insertar"], destructive: true, operationId: true },
  { name: "wibi_alta_producto", method: "POST", path: "productos", permission: ["configuracion", "productos", "insertar"], destructive: false, operationId: false },
  { name: "wibi_editar_producto", method: "PATCH", path: "productos/{id}", permission: ["configuracion", "productos", "modificar"], destructive: true, operationId: false },
  { name: "wibi_precios_producto", method: "PATCH", path: "productos/{id}/precios", permission: ["configuracion", "productos", "modificar"], destructive: true, operationId: false },
  { name: "wibi_estado_producto", method: "PATCH", path: "productos/{id}/estado", permission: ["configuracion", "productos", "activar"], destructive: true, operationId: false },
  { name: "wibi_asignar_marca_productos", method: "POST", path: "productos/asignar", permission: ["configuracion", "productos", "modificar"], destructive: true, operationId: false },
  { name: "wibi_asignar_segmento_productos", method: "POST", path: "productos/asignar", permission: ["configuracion", "productos", "modificar"], destructive: true, operationId: false },
  { name: "wibi_asignar_stock_productos", method: "POST", path: "productos/asignar", permission: ["configuracion", "productos", "modificar"], destructive: true, operationId: false },
  { name: "wibi_crear_marca", method: "POST", path: "marcas", permission: ["configuracion", "marcas", "insertar"], destructive: false, operationId: false },
  { name: "wibi_modificar_marca", method: "PATCH", path: "marcas/{id}", permission: ["configuracion", "marcas", "modificar"], destructive: true, operationId: false },
  { name: "wibi_eliminar_marca", method: "DELETE", path: "marcas/{id}", permission: ["configuracion", "marcas", "eliminar"], destructive: true, operationId: false },
  { name: "wibi_importar_marcas", method: "POST", path: "marcas/importar", permission: ["configuracion", "marcas", "insertar"], destructive: false, operationId: false },
  { name: "wibi_eliminar_tag", method: "DELETE", path: "tags/{id}", permission: ["configuracion", "etiquetas", "eliminar"], destructive: true, operationId: false },
  { name: "wibi_grilla_cupones", method: "GET", path: "cupones/grilla", permission: ["campania", "cupones", "consultar"], destructive: false, operationId: false },
  { name: "wibi_alta_cupon", method: "POST", path: "cupones/comando", permission: ["campania", "cupones", "nuevo"], destructive: false, operationId: true },
  { name: "wibi_editar_cupon", method: "POST", path: "cupones/comando", permission: ["campania", "cupones", "nuevo"], destructive: true, operationId: true },
  { name: "wibi_eliminar_cupon", method: "POST", path: "cupones/comando", permission: ["campania", "cupones", "nuevo"], destructive: true, operationId: true },
  { name: "wibi_activar_cupon", method: "POST", path: "cupones/comando", permission: ["campania", "cupones", "nuevo"], destructive: true, operationId: true },
  { name: "wibi_asignar_cupon", method: "POST", path: "cupones/comando", permission: ["campania", "cupones", "modificar"], destructive: true, operationId: true },
  { name: "wibi_desasignar_cupon", method: "POST", path: "cupones/comando", permission: ["campania", "cupones", "modificar"], destructive: true, operationId: true },
  { name: "wibi_validar_cupon", method: "POST", path: "cupones/comando", permission: ["campania", "cupones", "modificar"], destructive: false, operationId: true },
  { name: "wibi_usar_cupon", method: "POST", path: "cupones/comando", permission: ["campania", "cupones", "modificar"], destructive: true, operationId: true },
  { name: "wibi_grilla_tipos_alerta", method: "GET", path: "tipos-alerta/grilla", permission: ["campania", "suscripciones", "consultar"], destructive: false, operationId: false },
  { name: "wibi_guardar_tipo_alerta", method: "POST", path: "tipos-alerta/guardar", permission: ["campania", "suscripciones", "modificar"], destructive: true, operationId: true },
  { name: "wibi_grilla_difusiones", method: "GET", path: "difusiones/grilla", permission: ["whatsapp", "difusiones", "consultar"], destructive: false, operationId: false },
  { name: "wibi_audiencia_difusion", method: "GET", path: "difusiones/audiencia", permission: ["whatsapp", "difusiones", "consultar"], destructive: false, operationId: false },
  { name: "wibi_listar_plantillas_whatsapp", method: "GET", path: "difusiones/plantillas", permission: ["whatsapp", "difusiones", "consultar"], destructive: false, operationId: false },
  { name: "wibi_pausar_difusion", method: "POST", path: "difusiones/{id}/pausar", permission: ["whatsapp", "difusiones", "modificar"], destructive: true, operationId: false },
  { name: "wibi_reanudar_difusion", method: "POST", path: "difusiones/{id}/reanudar", permission: ["whatsapp", "difusiones", "modificar"], destructive: true, operationId: false },
  { name: "wibi_eliminar_difusion", method: "DELETE", path: "difusiones/{id}", permission: ["whatsapp", "difusiones", "eliminar"], destructive: true, operationId: false },
  { name: "wibi_pausar_detalle_difusion", method: "POST", path: "difusiones/detalles/{id}/pausar", permission: ["whatsapp", "difusiones", "modificar"], destructive: true, operationId: false },
  { name: "wibi_reanudar_detalle_difusion", method: "POST", path: "difusiones/detalles/{id}/reanudar", permission: ["whatsapp", "difusiones", "modificar"], destructive: true, operationId: false },
  { name: "wibi_grilla_suscripciones", method: "GET", path: "suscripciones/grilla", permission: ["campania", "suscripciones", "consultar"], destructive: false, operationId: false },
  { name: "wibi_tipos_pantalla_suscripcion", method: "GET", path: "suscripciones/tipos-pantalla", permission: ["campania", "suscripciones", "consultar"], destructive: false, operationId: false },
  { name: "wibi_listar_tipos_alerta", method: "GET", path: "suscripciones/tipos-alerta", permission: ["configuracion", "tiposalerta", "consultar"], destructive: false, operationId: false },
  { name: "wibi_detalle_suscripcion", method: "GET", path: "suscripciones/{id}", permission: ["campania", "suscripciones", "consultar"], destructive: false, operationId: false },
  { name: "wibi_editar_suscripcion", method: "PATCH", path: "suscripciones/{id}", permission: ["campania", "suscripciones", "modificar"], destructive: true, operationId: false },
  { name: "wibi_estado_suscripcion", method: "PATCH", path: "suscripciones/{id}/estado", permission: ["campania", "suscripciones", "activar"], destructive: true, operationId: false },
  { name: "wibi_eliminar_suscripcion", method: "DELETE", path: "suscripciones/{id}", permission: ["campania", "suscripciones", "eliminar"], destructive: true, operationId: false },
  { name: "wibi_alta_comercio", method: "POST", path: "comercios/guardar", permission: ["configuracion", "comercios", "insertar"], destructive: false, operationId: false },
  { name: "wibi_editar_comercio", method: "POST", path: "comercios/guardar", permission: ["configuracion", "comercios", "modificar"], destructive: true, operationId: false },
  { name: "wibi_alta_usuario", method: "POST", path: "usuarios/guardar", permission: ["configuracion", "usuarios", "insertar"], destructive: false, operationId: false },
  { name: "wibi_editar_usuario", method: "POST", path: "usuarios/guardar", permission: ["configuracion", "usuarios", "modificar"], destructive: true, operationId: false },
  { name: "wibi_guardar_parametro", method: "POST", path: "parametros/guardar", permission: ["configuracion", "parametros", "modificar"], destructive: true, operationId: false },
  { name: "wibi_eliminar_parametro", method: "POST", path: "parametros/guardar", permission: ["configuracion", "parametros", "modificar"], destructive: true, operationId: false },
  { name: "wibi_alta_flujo", method: "POST", path: "flujos/guardar", permission: ["automatizacion", "flujos", "modificar"], destructive: false, operationId: false },
  { name: "wibi_editar_flujo", method: "POST", path: "flujos/guardar", permission: ["automatizacion", "flujos", "modificar"], destructive: true, operationId: false },
  { name: "wibi_guardar_dibujo_flujo", method: "POST", path: "flujos/guardar", permission: ["automatizacion", "flujos", "modificar"], destructive: true, operationId: false },
  { name: "wibi_activar_flujo", method: "POST", path: "flujos/guardar", permission: ["automatizacion", "flujos", "modificar"], destructive: true, operationId: false },
  { name: "wibi_eliminar_flujo", method: "POST", path: "flujos/guardar", permission: ["automatizacion", "flujos", "modificar"], destructive: true, operationId: false },
  { name: "wibi_enviar_whatsapp", method: "POST", path: "whatsapp/operativo", permission: ["whatsapp", "canales", "modificar"], destructive: true, operationId: false },
  { name: "wibi_alta_campania", method: "POST", path: "campanias/superadmin", permission: ["configuracion", "campanias", "nuevo"], destructive: false, operationId: false },
  { name: "wibi_crear_export_tarea", method: "POST", path: "export/tareas", permission: ["campania", "clientes", "exportar"], alternatePermission: ["campania", "movimientos", "exportar"], destructive: false, operationId: false },
  { name: "wibi_estado_export_tarea", method: "GET", path: "export/tareas/{id}", permission: ["campania", "clientes", "exportar"], alternatePermission: ["campania", "movimientos", "exportar"], destructive: false, operationId: false },
  { name: "wibi_cancelar_export_tarea", method: "POST", path: "export/tareas/{id}/cancelar", permission: ["campania", "clientes", "exportar"], alternatePermission: ["campania", "movimientos", "exportar"], destructive: true, operationId: false },
  { name: "wibi_descargar_export_tarea", method: "GET", path: "export/tareas/{id}/descarga", permission: ["campania", "clientes", "exportar"], alternatePermission: ["campania", "movimientos", "exportar"], destructive: false, operationId: false },
];

export const NOMBRES_ADMIN = new Set(CONTRATOS_ADMIN.map((contrato) => contrato.name));

export function permisosAdmin(): Record<string, Permiso> {
  return Object.fromEntries(CONTRATOS_ADMIN.map((contrato) => [contrato.name, contrato.permission]));
}

/**
 * Una herramienta del catálogo admin sin permiso explícito no se registra.
 * El resto mantiene el comportamiento anterior: sin mapeo, se registra.
 */
export function debeRegistrar(
  name: string,
  permisos: Record<string, string[]> | undefined,
  permission?: readonly [string, string, string?]
): boolean {
  if (NOMBRES_ADMIN.has(name)) {
    if (!permission) return false;
    if (can(permisos, permission[0], permission[1], permission[2])) return true;
    const alterno = CONTRATOS_ADMIN.find((contrato) => contrato.name === name)?.alternatePermission;
    return Boolean(alterno && can(permisos, alterno[0], alterno[1], alterno[2]));
  }
  if (!permission) return true;
  return can(permisos, permission[0], permission[1], permission[2]);
}
