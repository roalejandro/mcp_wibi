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

const idCampania = z
  .number()
  .int()
  .positive()
  .optional()
  .describe("Campaña a consultar. Opcional si el comercio opera una sola campaña.");
const idComercio = z
  .number()
  .int()
  .positive()
  .optional()
  .describe("Filtro opcional por comercio para sesiones admin.");

/**
 * Herramientas de Fase 1: Informes y consultas (solo lectura).
 * Las sesiones admin pueden filtrar opcionalmente por comercio.
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
        idComercio,
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
          ...scopeParams(client, args),
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
        idComercio,
      },
      annotations: READONLY,
    },
    async (args) => {
      try {
        const data = await client.get(`movimientos/${args.idMovimiento}`, {
          ...scopeParams(client, args),
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
        idComercio,
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
          ...scopeParams(client, args),
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
      description:
        "Lista productos del catálogo de la red del comercio. Cada ítem incluye Marca, Segmentos y clasificadores tipados (Laboratorio, Rubro, Subrubro, Droga, AccionTerapeutica).",
      inputSchema: {
        idCampania,
        idComercio,
        buscar: z.string().optional(),
        soloActivos: z.boolean().optional(),
        idMarca: z.number().int().positive().optional(),
        idSegmento: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("Filtrar por segmento de producto (ver wibi_listar_segmentos_productos)."),
        idLaboratorio: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("Filtrar por clasificador tipo Laboratorio (1)."),
        idRubro: z.number().int().positive().optional().describe("Filtrar por Rubro (tipo 2)."),
        idSubrubro: z.number().int().positive().optional().describe("Filtrar por Subrubro (tipo 3)."),
        idDroga: z.number().int().positive().optional().describe("Filtrar por Droga (tipo 4)."),
        idAccionTerapeutica: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("Filtrar por Acción terapéutica (tipo 5)."),
        page: z.number().int().positive().optional(),
        perPage: z.number().int().positive().max(200).optional(),
      },
      annotations: READONLY,
    },
    async (args) => {
      try {
        const data = await client.get("productos", {
          ...scopeParams(client, args),
          buscar: args.buscar,
          soloActivos: args.soloActivos,
          idMarca: args.idMarca,
          idSegmento: args.idSegmento,
          idLaboratorio: args.idLaboratorio,
          idRubro: args.idRubro,
          idSubrubro: args.idSubrubro,
          idDroga: args.idDroga,
          idAccionTerapeutica: args.idAccionTerapeutica,
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
      description:
        "Lista los clasificadores de productos de la red. Tipos: 1=Laboratorio, 2=Rubro, 3=Subrubro, 4=Droga, 5=Acción terapéutica.",
      inputSchema: {
        idCampania,
        idComercio,
        idTipoClasificador: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("Filtrar por tipo: 1 laboratorio, 2 rubro, 3 subrubro, 4 droga, 5 acción terapéutica."),
      },
      annotations: READONLY,
    },
    async (args) => {
      try {
        const data = await client.get("clasificadores", {
          ...scopeParams(client, args),
          ...(args.idTipoClasificador ? { idTipoClasificador: args.idTipoClasificador } : {}),
        });
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
      inputSchema: { idCampania, idComercio },
      annotations: READONLY,
    },
    async (args) => {
      try {
        const data = await client.get("marcas", scopeParams(client, args));
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
      description:
        "Lista los segmentos de clientes (grupos de interés) de la campaña. Para segmentos de producto usá wibi_listar_segmentos_productos.",
      inputSchema: { idCampania, idComercio },
      annotations: READONLY,
    },
    async (args) => {
      try {
        const data = await client.get("segmentos", scopeParams(client, args));
        return jsonResult(data);
      } catch (e) {
        return errorResult(e);
      }
    }
  );

  server.registerTool(
    "wibi_listar_segmentos_productos",
    {
      title: "Listar segmentos de producto",
      description:
        "Lista los segmentos de producto (Configuración → Segmentos de productos) de la red del comercio. Usalo para filtrar wibi_listar_productos con idSegmento.",
      inputSchema: { idCampania, idComercio },
      annotations: READONLY,
    },
    async (args) => {
      try {
        const data = await client.get("segmentos-productos", scopeParams(client, args));
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
        idComercio,
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
          ...scopeParams(client, args),
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
        idComercio,
      },
      annotations: READONLY,
    },
    async (args) => {
      try {
        const data = await client.get(`cupones/${args.idCupon}`, scopeParams(client, args));
        return jsonResult(data);
      } catch (e) {
        return errorResult(e);
      }
    }
  );
}
