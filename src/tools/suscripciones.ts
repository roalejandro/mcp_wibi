import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { WibiClient } from "../wibiClient.js";
import { errorResult, jsonResult, scopeParams } from "./helpers.js";
import { DESTRUCTIVE, READONLY as LECTURA, ejecutar, idCampaniaObligatoria, identificadorOperacion, operationId } from "./adminShared.js";

const WRITE = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true,
};

const READONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
};

const idCampania = z
  .number()
  .int()
  .positive()
  .optional()
  .describe("Campaña destino. Opcional si el comercio opera una sola campaña.");
const idComercio = z.number().int().positive().optional().describe("Filtro opcional por comercio.");

/**
 * Herramientas de Fase 2: Suscripciones.
 * idCampania siempre viaja por query string (requerimiento API v2).
 */
export function registerSuscripcionesTools(server: McpServer, client: WibiClient): void {
  server.registerTool(
    "wibi_crear_tipo_alerta",
    {
      title: "Crear tipo de alerta",
      description:
        "Crea un tipo de alerta en la campaña (p. ej. recompra de medicamento), con días de anticipación.",
      inputSchema: {
        idCampania,
        idComercio,
        nombre: z.string().min(1),
        diferenciaDias: z.number().int().min(0).optional(),
        activo: z.boolean().optional(),
      },
      annotations: WRITE,
    },
    async (args) => {
      try {
        const data = await client.post(
          "suscripciones/tipos-alerta",
          {
            nombre: args.nombre,
            diferenciaDias: args.diferenciaDias,
            activo: args.activo,
          },
          scopeParams(client, args)
        );
        return jsonResult(data);
      } catch (e) {
        return errorResult(e);
      }
    }
  );

  server.registerTool(
    "wibi_crear_suscripcion",
    {
      title: "Crear suscripción",
      description:
        "Crea una suscripción para un cliente. Mensual: dia del mes obligatorio. Cada 60 o 90 días: frecuenciaDias y fechaBase (YYYY-MM-DD); dia no se usa. Valida cliente y tipo de alerta del comercio.",
      inputSchema: {
        idCampania,
        idComercio,
        idCliente: z.number().int().positive(),
        idTipoAlerta: z.number().int().positive(),
        dia: z.number().int().min(1).max(31).optional(),
        frecuenciaDias: z.union([z.literal(60), z.literal(90)]).optional(),
        fechaBase: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional()
          .describe("Fecha de inicio del ciclo, obligatoria si frecuenciaDias es 60 o 90."),
        activo: z.boolean().optional(),
        notas: z.string().optional(),
        productos: z
          .array(
            z.object({
              IdProducto: z.number().int().positive(),
              Cantidad: z.number().positive().optional(),
            })
          )
          .optional(),
      },
      annotations: WRITE,
    },
    async (args) => {
      try {
        const frecuencia = args.frecuenciaDias;
        if (frecuencia === 60 || frecuencia === 90) {
          if (!args.fechaBase) {
            return errorResult(new Error("fechaBase es obligatoria para una frecuencia de 60 o 90 días"));
          }
        } else if (args.dia == null) {
          return errorResult(new Error("dia es obligatorio para una suscripción mensual"));
        }

        const body: Record<string, unknown> = {
          idCliente: args.idCliente,
          idTipoAlerta: args.idTipoAlerta,
          activo: args.activo,
          notas: args.notas,
          productos: args.productos ?? [],
        };
        if (args.dia != null) {
          body.dia = args.dia;
        }
        if (frecuencia != null) {
          body.frecuenciaDias = frecuencia;
          body.fechaBase = args.fechaBase;
        }

        const data = await client.post(
          "suscripciones",
          body,
          scopeParams(client, args)
        );
        return jsonResult(data);
      } catch (e) {
        return errorResult(e);
      }
    }
  );

  server.registerTool(
    "wibi_consultar_suscripciones",
    {
      title: "Consultar suscripciones",
      description: "Lista las suscripciones del comercio autenticado.",
      inputSchema: { idCampania, idComercio },
      annotations: READONLY,
    },
    async (args) => {
      try {
        const data = await client.get("suscripciones", scopeParams(client, args));
        return jsonResult(data);
      } catch (e) {
        return errorResult(e);
      }
    }
  );
}

/** Lecturas y cambios administrativos de suscripciones y tipos de alerta. */
export function registerSuscripcionesAdminTools(server: McpServer, client: WibiClient): void {
  const campania = { idCampania: idCampaniaObligatoria, idComercio };

  server.registerTool("wibi_grilla_suscripciones", {
    title: "Grilla de suscripciones",
    description: "Lista la grilla administrativa de suscripciones.",
    inputSchema: {
      ...campania,
      idCliente: z.number().int().positive().optional(),
      idTipoAlerta: z.number().int().positive().optional(),
      buscar: z.string().optional(),
      activo: z.boolean().optional(),
    },
    annotations: LECTURA,
  }, async (args) => ejecutar(() => client.get("suscripciones/grilla", {
    ...scopeParams(client, args),
    idCliente: args.idCliente,
    idTipoAlerta: args.idTipoAlerta,
    buscar: args.buscar,
    activo: args.activo,
  })));

  server.registerTool("wibi_tipos_pantalla_suscripcion", {
    title: "Tipos de pantalla de suscripción",
    description: "Devuelve los tipos de alerta que se pueden elegir en la pantalla de suscripciones.",
    inputSchema: campania,
    annotations: LECTURA,
  }, async (args) => ejecutar(() => client.get("suscripciones/tipos-pantalla", scopeParams(client, args))));

  server.registerTool("wibi_listar_tipos_alerta", {
    title: "Listar tipos de alerta",
    description: "Lista los tipos de alerta de la campaña.",
    inputSchema: campania,
    annotations: LECTURA,
  }, async (args) => ejecutar(() => client.get("suscripciones/tipos-alerta", scopeParams(client, args))));

  server.registerTool("wibi_detalle_suscripcion", {
    title: "Detalle de suscripción",
    description: "Devuelve una suscripción y sus productos.",
    inputSchema: { ...campania, idSuscripcion: z.number().int().positive() },
    annotations: LECTURA,
  }, async (args) => ejecutar(() => client.get(`suscripciones/${args.idSuscripcion}`, scopeParams(client, args))));

  server.registerTool("wibi_editar_suscripcion", {
    title: "Editar suscripción",
    description: "Modifica una suscripción existente.",
    inputSchema: {
      ...campania,
      idSuscripcion: z.number().int().positive(),
      idCliente: z.number().int().positive(),
      idTipoAlerta: z.number().int().positive(),
      dia: z.number().int().min(1).max(31).optional(),
      notas: z.string().optional(),
    },
    annotations: DESTRUCTIVE,
  }, async (args) => ejecutar(() => client.patch(`suscripciones/${args.idSuscripcion}`, {
    idCliente: args.idCliente,
    idTipoAlerta: args.idTipoAlerta,
    dia: args.dia,
    notas: args.notas,
  }, scopeParams(client, args))));

  server.registerTool("wibi_estado_suscripcion", {
    title: "Activar o desactivar suscripción",
    description: "Cambia el estado de una suscripción.",
    inputSchema: { ...campania, idSuscripcion: z.number().int().positive(), activo: z.boolean() },
    annotations: DESTRUCTIVE,
  }, async (args) => ejecutar(() => client.patch(
    `suscripciones/${args.idSuscripcion}/estado`,
    { activo: args.activo },
    scopeParams(client, args)
  )));

  server.registerTool("wibi_eliminar_suscripcion", {
    title: "Eliminar suscripción",
    description: "Elimina una suscripción de la campaña.",
    inputSchema: { ...campania, idSuscripcion: z.number().int().positive() },
    annotations: DESTRUCTIVE,
  }, async (args) => ejecutar(() => client.delete(`suscripciones/${args.idSuscripcion}`, scopeParams(client, args))));

  server.registerTool("wibi_grilla_tipos_alerta", {
    title: "Grilla de tipos de alerta",
    description: "Lista los tipos de alerta con el formato de la pantalla del panel.",
    inputSchema: campania,
    annotations: LECTURA,
  }, async (args) => ejecutar(() => client.get("tipos-alerta/grilla", scopeParams(client, args))));

  server.registerTool("wibi_guardar_tipo_alerta", {
    title: "Guardar tipo de alerta",
    description: "Crea o modifica un tipo de alerta de la pantalla del panel. No reemplaza el alta simple existente.",
    inputSchema: {
      ...campania,
      operationId,
      idTipoAlerta: z.number().int().positive().optional(),
      nombre: z.string().min(1),
      diferenciaDias: z.number().int().min(0).optional(),
      activo: z.enum(["S", "N"]).optional(),
    },
    annotations: DESTRUCTIVE,
  }, async (args) => ejecutar(() => client.post("tipos-alerta/guardar", {
    idTipoAlerta: args.idTipoAlerta,
    nombre: args.nombre,
    diferenciaDias: args.diferenciaDias,
    activo: args.activo,
    operation_id: identificadorOperacion(args.operationId),
  }, scopeParams(client, args))));
}
