import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { WibiClient } from "../wibiClient.js";
import { errorResult, jsonResult, scopeParams } from "./helpers.js";

const READONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
};

const WRITE = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true,
};

const idCampania = z
  .number()
  .int()
  .positive()
  .optional()
  .describe("Campaña destino. Opcional si el comercio opera una sola campaña.");
const idComercio = z
  .number()
  .int()
  .positive()
  .optional()
  .describe("Filtro opcional por comercio para sesiones admin.");

const colorHex = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/, "El color debe tener formato hexadecimal #RRGGBB")
  .optional()
  .describe("Color hexadecimal #RRGGBB. Default #000000 al crear.");

/**
 * ABM de etiquetas (Configuración → Etiquetas).
 * Distinto de wibi_asignar_tags (asignación a clientes).
 */
export function registerTagsTools(server: McpServer, client: WibiClient): void {
  server.registerTool(
    "wibi_listar_tags",
    {
      title: "Listar etiquetas (tags)",
      description:
        "Lista las etiquetas/tags disponibles en la campaña para clasificar clientes. Permite filtrar por título o descripción.",
      inputSchema: {
        idCampania,
        idComercio,
        buscar: z
          .string()
          .min(1)
          .optional()
          .describe("Filtro opcional por título o descripción (LIKE)."),
      },
      annotations: READONLY,
    },
    async (args) => {
      try {
        const data = await client.get("tags", {
          ...scopeParams(client, args),
          ...(args.buscar ? { buscar: args.buscar } : {}),
        });
        return jsonResult(data);
      } catch (e) {
        return errorResult(e);
      }
    }
  );

  server.registerTool(
    "wibi_crear_tag",
    {
      title: "Crear etiqueta (tag)",
      description:
        "Crea una nueva etiqueta en la campaña (Configuración → Etiquetas). El título se normaliza (espacios → _). No asigna el tag a clientes.",
      inputSchema: {
        idCampania,
        idComercio,
        titulo: z.string().min(1).describe("Título de la etiqueta (requerido)."),
        descripcion: z.string().optional().describe("Descripción opcional."),
        color: colorHex,
      },
      annotations: WRITE,
    },
    async (args) => {
      try {
        const data = await client.post(
          "tags",
          {
            titulo: args.titulo,
            ...(args.descripcion !== undefined ? { descripcion: args.descripcion } : {}),
            ...(args.color !== undefined ? { color: args.color } : {}),
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
    "wibi_modificar_tag",
    {
      title: "Modificar etiqueta (tag)",
      description:
        "Modifica título, descripción y/o color de una etiqueta existente. Debés indicar al menos un campo. El tag debe pertenecer a la campaña.",
      inputSchema: {
        idCampania,
        idComercio,
        idTag: z.number().int().positive().describe("ID de la etiqueta a modificar."),
        titulo: z.string().min(1).optional(),
        descripcion: z.string().optional(),
        color: colorHex,
      },
      annotations: WRITE,
    },
    async (args) => {
      try {
        if (
          args.titulo === undefined &&
          args.descripcion === undefined &&
          args.color === undefined
        ) {
          return errorResult(
            new Error("Debés indicar al menos un campo a modificar (titulo, descripcion o color).")
          );
        }

        const body: Record<string, unknown> = {};
        if (args.titulo !== undefined) body.titulo = args.titulo;
        if (args.descripcion !== undefined) body.descripcion = args.descripcion;
        if (args.color !== undefined) body.color = args.color;

        const data = await client.patch(`tags/${args.idTag}`, body, scopeParams(client, args));
        return jsonResult(data);
      } catch (e) {
        return errorResult(e);
      }
    }
  );
}
