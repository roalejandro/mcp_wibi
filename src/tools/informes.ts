import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { WibiClient } from "../wibiClient.js";
import { campaniaParam, errorResult, jsonResult } from "./helpers.js";

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
  .describe("Campaña a consultar. Opcional si el comercio opera una sola campaña.");

/**
 * Herramientas de Fase 1: Informes y consultas (solo lectura).
 * El IdComercio nunca se pasa: lo deriva el API del token del comercio.
 */
export function registerInformesTools(server: McpServer, client: WibiClient): void {
  server.registerTool(
    "wibi_listar_movimientos",
    {
      title: "Listar movimientos",
      description:
        "Lista movimientos (ventas, canjes, ajustes) de la campaña del comercio, con filtros por fecha, cliente y tipo. Datos acotados a la campaña.",
      inputSchema: {
        idCampania,
        fechaDesde: z.string().optional().describe("YYYY-MM-DD"),
        fechaHasta: z.string().optional().describe("YYYY-MM-DD"),
        idCliente: z.number().int().positive().optional(),
        idTipoMovimiento: z.number().int().positive().optional().describe("1=venta, 2=canje"),
        page: z.number().int().positive().optional(),
        perPage: z.number().int().positive().max(200).optional(),
      },
      annotations: READONLY,
    },
    async (args) => {
      try {
        const data = await client.get("movimientos", {
          ...campaniaParam(client, args.idCampania),
          fechaDesde: args.fechaDesde,
          fechaHasta: args.fechaHasta,
          idCliente: args.idCliente,
          idTipoMovimiento: args.idTipoMovimiento,
          page: args.page,
          perPage: args.perPage,
        });
        return jsonResult(data);
      } catch (e) {
        return errorResult(e);
      }
    }
  );

  server.registerTool(
    "wibi_detalle_movimiento",
    {
      title: "Detalle de movimiento",
      description:
        "Devuelve la cabecera, productos y premios de un movimiento. Valida que pertenezca a la campaña del comercio.",
      inputSchema: {
        idMovimiento: z.number().int().positive(),
        idCampania,
      },
      annotations: READONLY,
    },
    async (args) => {
      try {
        const data = await client.get(`movimientos/${args.idMovimiento}`, {
          ...campaniaParam(client, args.idCampania),
        });
        return jsonResult(data);
      } catch (e) {
        return errorResult(e);
      }
    }
  );

  server.registerTool(
    "wibi_buscar_clientes",
    {
      title: "Buscar clientes",
      description:
        "Busca/lista clientes de la campaña por nombre, DNI, tarjeta o email, con filtros por categoría y segmento.",
      inputSchema: {
        idCampania,
        buscar: z.string().optional(),
        idCategoria: z.number().int().positive().optional(),
        idGrupoInteres: z.number().int().positive().optional(),
        activo: z.number().int().min(0).max(1).optional(),
        page: z.number().int().positive().optional(),
        perPage: z.number().int().positive().max(200).optional(),
      },
      annotations: READONLY,
    },
    async (args) => {
      try {
        const data = await client.get("clientes", {
          ...campaniaParam(client, args.idCampania),
          buscar: args.buscar,
          idCategoria: args.idCategoria,
          idGrupoInteres: args.idGrupoInteres,
          activo: args.activo,
          page: args.page,
          perPage: args.perPage,
        });
        return jsonResult(data);
      } catch (e) {
        return errorResult(e);
      }
    }
  );

  server.registerTool(
    "wibi_listar_productos",
    {
      title: "Listar productos",
      description: "Lista productos del catálogo de la red del comercio.",
      inputSchema: {
        idCampania,
        buscar: z.string().optional(),
        soloActivos: z.boolean().optional(),
        idMarca: z.number().int().positive().optional(),
        page: z.number().int().positive().optional(),
        perPage: z.number().int().positive().max(200).optional(),
      },
      annotations: READONLY,
    },
    async (args) => {
      try {
        const data = await client.get("productos", {
          ...campaniaParam(client, args.idCampania),
          buscar: args.buscar,
          soloActivos: args.soloActivos,
          idMarca: args.idMarca,
          page: args.page,
          perPage: args.perPage,
        });
        return jsonResult(data);
      } catch (e) {
        return errorResult(e);
      }
    }
  );

  server.registerTool(
    "wibi_listar_clasificadores",
    {
      title: "Listar clasificadores",
      description: "Lista los clasificadores de productos de la red del comercio.",
      inputSchema: { idCampania },
      annotations: READONLY,
    },
    async (args) => {
      try {
        const data = await client.get("clasificadores", campaniaParam(client, args.idCampania));
        return jsonResult(data);
      } catch (e) {
        return errorResult(e);
      }
    }
  );

  server.registerTool(
    "wibi_listar_marcas",
    {
      title: "Listar marcas",
      description: "Lista las marcas presentes en el catálogo de la red del comercio.",
      inputSchema: { idCampania },
      annotations: READONLY,
    },
    async (args) => {
      try {
        const data = await client.get("marcas", campaniaParam(client, args.idCampania));
        return jsonResult(data);
      } catch (e) {
        return errorResult(e);
      }
    }
  );

  server.registerTool(
    "wibi_listar_segmentos",
    {
      title: "Listar segmentos",
      description: "Lista los segmentos (grupos de interés) de la campaña.",
      inputSchema: { idCampania },
      annotations: READONLY,
    },
    async (args) => {
      try {
        const data = await client.get("segmentos", campaniaParam(client, args.idCampania));
        return jsonResult(data);
      } catch (e) {
        return errorResult(e);
      }
    }
  );

  server.registerTool(
    "wibi_listar_tags",
    {
      title: "Listar etiquetas (tags)",
      description: "Lista las etiquetas/tags disponibles en la campaña para clasificar clientes.",
      inputSchema: { idCampania },
      annotations: READONLY,
    },
    async (args) => {
      try {
        const data = await client.get("tags", campaniaParam(client, args.idCampania));
        return jsonResult(data);
      } catch (e) {
        return errorResult(e);
      }
    }
  );

  server.registerTool(
    "wibi_listar_cupones",
    {
      title: "Listar cupones",
      description: "Lista cupones de la campaña, con filtros por estado y vigencia.",
      inputSchema: {
        idCampania,
        buscar: z.string().optional(),
        soloActivos: z.boolean().optional(),
        soloVigentes: z.boolean().optional(),
        page: z.number().int().positive().optional(),
        perPage: z.number().int().positive().max(200).optional(),
      },
      annotations: READONLY,
    },
    async (args) => {
      try {
        const data = await client.get("cupones", {
          ...campaniaParam(client, args.idCampania),
          buscar: args.buscar,
          soloActivos: args.soloActivos,
          soloVigentes: args.soloVigentes,
          page: args.page,
          perPage: args.perPage,
        });
        return jsonResult(data);
      } catch (e) {
        return errorResult(e);
      }
    }
  );

  server.registerTool(
    "wibi_detalle_cupon",
    {
      title: "Detalle de cupón",
      description: "Devuelve un cupón con sus condiciones (productos, marcas, clasificadores, segmentos) y usos.",
      inputSchema: {
        idCupon: z.number().int().positive(),
        idCampania,
      },
      annotations: READONLY,
    },
    async (args) => {
      try {
        const data = await client.get(`cupones/${args.idCupon}`, campaniaParam(client, args.idCampania));
        return jsonResult(data);
      } catch (e) {
        return errorResult(e);
      }
    }
  );
}
