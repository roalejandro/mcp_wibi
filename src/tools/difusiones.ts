import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { WibiClient } from "../wibiClient.js";
import { errorResult, jsonResult, scopeParams } from "./helpers.js";
import { DESTRUCTIVE, READONLY as LECTURA, ejecutar, idCampaniaObligatoria } from "./adminShared.js";

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
 * Herramientas de Fase 2: Difusiones.
 * idCampania siempre viaja por query string (requerimiento API v2).
 */
export function registerDifusionesTools(server: McpServer, client: WibiClient): void {
  server.registerTool(
    "wibi_asignar_tags",
    {
      title: "Asignar tags a clientes",
      description:
        "Asigna una o más etiquetas (tags) a una lista de clientes. Valida que tags y clientes pertenezcan a la campaña/comercio.",
      inputSchema: {
        idCampania,
        idComercio,
        idClientes: z.array(z.number().int().positive()).min(1),
        idTags: z.array(z.number().int().positive()).min(1),
      },
      annotations: WRITE,
    },
    async (args) => {
      try {
        const data = await client.post(
          "difusiones/tags",
          {
            idClientes: args.idClientes,
            idTags: args.idTags,
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
    "wibi_crear_plantilla_whatsapp",
    {
      title: "Crear plantilla de WhatsApp",
      description:
        "Registra una plantilla de WhatsApp asociada al canal Meta Cloud API de la campaña.",
      inputSchema: {
        idCampania,
        idComercio,
        nombre: z.string().min(1),
        idPlantilla: z.string().optional().describe("ID de plantilla en Meta (si ya existe)"),
        idMetaCloudApi: z.number().int().positive().optional(),
        idioma: z.string().optional().describe("p. ej. es, es_AR"),
        categoria: z.string().optional().describe("MARKETING, UTILITY, AUTHENTICATION"),
        encabezado: z.string().optional(),
        estado: z.string().optional(),
      },
      annotations: WRITE,
    },
    async (args) => {
      try {
        const data = await client.post(
          "difusiones/plantillas/whatsapp",
          {
            nombre: args.nombre,
            idPlantilla: args.idPlantilla,
            idMetaCloudApi: args.idMetaCloudApi,
            idioma: args.idioma,
            categoria: args.categoria,
            encabezado: args.encabezado,
            estado: args.estado,
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
    "wibi_programar_difusion",
    {
      title: "Programar difusión",
      description:
        "Programa una difusión (cabecera + destinatarios) para una fecha/hora. Valida que los clientes pertenezcan al comercio. El límite diario de WhatsApp es 1-1000; si se omite, la API usa 1000.",
      inputSchema: {
        idCampania,
        idComercio,
        nombre: z.string().min(1),
        fechaHora: z.string().optional().describe("YYYY-MM-DD HH:mm:ss"),
        idClientes: z.array(z.number().int().positive()).optional(),
        limiteDiario: z
          .number()
          .int()
          .min(1)
          .max(1000)
          .optional()
          .describe("Tope diario de envíos WhatsApp (1-1000). Si se omite, la API usa 1000."),
      },
      annotations: WRITE,
    },
    async (args) => {
      try {
        const data = await client.post(
          "difusiones",
          {
            nombre: args.nombre,
            fechaHora: args.fechaHora,
            idClientes: args.idClientes ?? [],
            ...(args.limiteDiario !== undefined ? { limiteDiario: args.limiteDiario } : {}),
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
    "wibi_consultar_difusiones",
    {
      title: "Consultar difusiones",
      description: "Lista las difusiones de la campaña.",
      inputSchema: { idCampania, idComercio },
      annotations: READONLY,
    },
    async (args) => {
      try {
        const data = await client.get("difusiones", scopeParams(client, args));
        return jsonResult(data);
      } catch (e) {
        return errorResult(e);
      }
    }
  );

  server.registerTool(
    "wibi_detalle_difusion",
    {
      title: "Detalle de difusión",
      description: "Devuelve una difusión con sus métricas de destinatarios.",
      inputSchema: {
        idDifusion: z.number().int().positive(),
        idCampania,
        idComercio,
      },
      annotations: READONLY,
    },
    async (args) => {
      try {
        const data = await client.get(
          `difusiones/${args.idDifusion}`,
          scopeParams(client, args)
        );
        return jsonResult(data);
      } catch (e) {
        return errorResult(e);
      }
    }
  );
}

/** Operaciones administrativas que no estaban en el listado original. */
export function registerDifusionesAdminTools(server: McpServer, client: WibiClient): void {
  const campania = { idCampania: idCampaniaObligatoria, idComercio };

  server.registerTool("wibi_grilla_difusiones", {
    title: "Grilla de difusiones",
    description: "Devuelve la grilla administrativa de difusiones de la campaña.",
    inputSchema: campania,
    annotations: LECTURA,
  }, async (args) => ejecutar(() => client.get("difusiones/grilla", scopeParams(client, args))));

  server.registerTool("wibi_audiencia_difusion", {
    title: "Audiencia de difusión",
    description: "Calcula la audiencia por etiquetas incluidas y excluidas.",
    inputSchema: {
      ...campania,
      tags: z.array(z.number().int().positive()).optional(),
      excluir: z.array(z.number().int().positive()).optional(),
      clientes: z.array(z.number().int().positive()).optional(),
      soloSuscriptos: z.boolean().optional(),
      soloActivos: z.boolean().optional(),
    },
    annotations: LECTURA,
  }, async (args) => ejecutar(() => client.get("difusiones/audiencia", {
    ...scopeParams(client, args),
    tags: args.tags,
    excluir: args.excluir,
    clientes: args.clientes,
    soloSuscriptos: args.soloSuscriptos ? "1" : undefined,
    soloActivos: args.soloActivos ? "1" : undefined,
  })));

  server.registerTool("wibi_listar_plantillas_whatsapp", {
    title: "Listar plantillas de WhatsApp",
    description: "Lista las plantillas de WhatsApp disponibles para la campaña.",
    inputSchema: campania,
    annotations: LECTURA,
  }, async (args) => ejecutar(() => client.get("difusiones/plantillas", scopeParams(client, args))));

  const postEstado = (nombre: string, titulo: string, ruta: (id: number) => string) => {
    server.registerTool(nombre, {
      title: titulo,
      description: titulo,
      inputSchema: { ...campania, id: z.number().int().positive() },
      annotations: DESTRUCTIVE,
    }, async (args) => ejecutar(() => client.post(ruta(args.id), {}, scopeParams(client, args))));
  };
  postEstado("wibi_pausar_difusion", "Pausar difusión", (id) => `difusiones/${id}/pausar`);
  postEstado("wibi_reanudar_difusion", "Reanudar difusión", (id) => `difusiones/${id}/reanudar`);
  postEstado("wibi_pausar_detalle_difusion", "Pausar destinatario", (id) => `difusiones/detalles/${id}/pausar`);
  postEstado("wibi_reanudar_detalle_difusion", "Reanudar destinatario", (id) => `difusiones/detalles/${id}/reanudar`);

  server.registerTool("wibi_eliminar_difusion", {
    title: "Eliminar difusión",
    description: "Elimina una difusión de la campaña.",
    inputSchema: { ...campania, id: z.number().int().positive() },
    annotations: DESTRUCTIVE,
  }, async (args) => ejecutar(() => client.delete(`difusiones/${args.id}`, scopeParams(client, args))));
}
