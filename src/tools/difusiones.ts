import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { WibiClient } from "../wibiClient.js";
import { campaniaParam, errorResult, jsonResult } from "./helpers.js";

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

/**
 * Herramientas de Fase 2: Difusiones.
 */
export function registerDifusionesTools(server: McpServer, client: WibiClient): void {
  server.registerTool(
    "wibi_asignar_tags",
    {
      title: "Asignar tags a clientes",
      description:
        "Asigna una o más etiquetas (tags) a una lista de clientes. Valida que tags y clientes pertenezcan a la campaña.",
      inputSchema: {
        idCampania,
        idClientes: z.array(z.number().int().positive()).min(1),
        idTags: z.array(z.number().int().positive()).min(1),
      },
      annotations: WRITE,
    },
    async (args) => {
      try {
        const data = await client.post("difusiones/tags", {
          ...campaniaParam(client, args.idCampania),
          idClientes: args.idClientes,
          idTags: args.idTags,
        });
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
        const data = await client.post("difusiones/plantillas/whatsapp", {
          ...campaniaParam(client, args.idCampania),
          nombre: args.nombre,
          idPlantilla: args.idPlantilla,
          idMetaCloudApi: args.idMetaCloudApi,
          idioma: args.idioma,
          categoria: args.categoria,
          encabezado: args.encabezado,
          estado: args.estado,
        });
        return jsonResult(data);
      } catch (e) {
        return errorResult(e);
      }
    }
  );

  server.registerTool(
    "wibi_crear_plantilla_email",
    {
      title: "Crear plantilla de email",
      description: "Crea una plantilla de email (asunto + contenido HTML/texto) en la campaña.",
      inputSchema: {
        idCampania,
        nombre: z.string().min(1),
        asunto: z.string().min(1),
        contenidoHTML: z.string().optional(),
        contenidoTexto: z.string().optional(),
      },
      annotations: WRITE,
    },
    async (args) => {
      try {
        const data = await client.post("difusiones/plantillas/email", {
          ...campaniaParam(client, args.idCampania),
          nombre: args.nombre,
          asunto: args.asunto,
          contenidoHTML: args.contenidoHTML,
          contenidoTexto: args.contenidoTexto,
        });
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
        "Programa una difusión (cabecera + destinatarios) para una fecha/hora. Valida que los clientes pertenezcan a la campaña.",
      inputSchema: {
        idCampania,
        nombre: z.string().min(1),
        fechaHora: z.string().optional().describe("YYYY-MM-DD HH:mm:ss"),
        idClientes: z.array(z.number().int().positive()).optional(),
      },
      annotations: WRITE,
    },
    async (args) => {
      try {
        const data = await client.post("difusiones", {
          ...campaniaParam(client, args.idCampania),
          nombre: args.nombre,
          fechaHora: args.fechaHora,
          idClientes: args.idClientes ?? [],
        });
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
      inputSchema: { idCampania },
      annotations: READONLY,
    },
    async (args) => {
      try {
        const data = await client.get("difusiones", campaniaParam(client, args.idCampania));
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
      },
      annotations: READONLY,
    },
    async (args) => {
      try {
        const data = await client.get(
          `difusiones/${args.idDifusion}`,
          campaniaParam(client, args.idCampania)
        );
        return jsonResult(data);
      } catch (e) {
        return errorResult(e);
      }
    }
  );
}
