import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { WibiClient } from "../wibiClient.js";
import { scopeParams } from "./helpers.js";
import { DESTRUCTIVE, WRITE, ejecutar, idCampaniaObligatoria, idComercio } from "./adminShared.js";

const clasificador = z.object({
  tipo: z.number().int().positive(),
  id: z.number().int().positive(),
});

export function registerPanelCatalogoTools(server: McpServer, client: WibiClient): void {
  const campania = { idCampania: idCampaniaObligatoria, idComercio };

  server.registerTool("wibi_alta_producto", {
    title: "Alta de producto",
    description: "Crea un producto en una red de la campaña.",
    inputSchema: {
      ...campania,
      idRed: z.number().int().positive(),
      producto: z.string().min(1).max(255),
      precio: z.number().nonnegative().optional(),
      costo: z.number().nonnegative().optional(),
      marca: z.number().int().positive().optional(),
      idExterno: z.string().optional(),
      clasificadores: z.array(clasificador).optional(),
    },
    annotations: WRITE,
  }, async (args) => ejecutar(() => client.post("productos", args, scopeParams(client, args))));

  server.registerTool("wibi_editar_producto", {
    title: "Editar producto",
    description: "Modifica nombre, precios, marca, código externo o clasificadores de un producto.",
    inputSchema: {
      ...campania,
      idProducto: z.number().int().positive(),
      producto: z.string().min(1).max(255).optional(),
      precio: z.number().nonnegative().optional(),
      costo: z.number().nonnegative().optional(),
      marca: z.number().int().positive().nullable().optional(),
      idExterno: z.string().optional(),
      clasificadores: z.array(clasificador).optional(),
    },
    annotations: DESTRUCTIVE,
  }, async (args) => ejecutar(() => client.patch(`productos/${args.idProducto}`, {
    producto: args.producto,
    precio: args.precio,
    costo: args.costo,
    marca: args.marca,
    idExterno: args.idExterno,
    clasificadores: args.clasificadores,
  }, scopeParams(client, args))));

  server.registerTool("wibi_precios_producto", {
    title: "Actualizar precios",
    description: "Actualiza precio, costo y clasificadores de un producto existente.",
    inputSchema: {
      ...campania,
      idProducto: z.number().int().positive(),
      precio: z.number().nonnegative().optional(),
      costo: z.number().nonnegative().optional(),
      clasificadores: z.array(clasificador).optional(),
    },
    annotations: DESTRUCTIVE,
  }, async (args) => ejecutar(() => client.patch(`productos/${args.idProducto}/precios`, {
    precio: args.precio,
    costo: args.costo,
    clasificadores: args.clasificadores,
  }, scopeParams(client, args))));

  server.registerTool("wibi_estado_producto", {
    title: "Activar o desactivar producto",
    description: "Cambia el estado activo del producto.",
    inputSchema: { ...campania, idProducto: z.number().int().positive(), activo: z.boolean() },
    annotations: DESTRUCTIVE,
  }, async (args) => ejecutar(() => client.patch(
    `productos/${args.idProducto}/estado`,
    { activo: args.activo },
    scopeParams(client, args)
  )));

  const asignar = (nombre: string, titulo: string, campo: "marca" | "segmento" | "stock") => {
    server.registerTool(nombre, {
      title: titulo,
      description: `Asigna ${campo} a los productos indicados de la campaña.`,
      inputSchema: {
        ...campania,
        ids: z.array(z.number().int().positive()).min(1),
        valor: z.number().int().nonnegative(),
        ...(campo === "stock" ? { stockMinimo: z.number().int().nonnegative().optional() } : {}),
      },
      annotations: DESTRUCTIVE,
    }, async (args) => ejecutar(async () => {
      if (campo === "stock" && !args.idComercio) {
        throw new Error("El stock por sucursal necesita idComercio.");
      }
      return client.post("productos/asignar", {
        campo: campo === "stock" ? "stock_comercio" : campo,
        ids: args.ids,
        valor: campo === "stock" ? undefined : args.valor,
        stock: campo === "stock" ? args.valor : undefined,
        stockMinimo: "stockMinimo" in args ? args.stockMinimo : undefined,
        idComercio: args.idComercio,
      }, scopeParams(client, args));
    }));
  };
  asignar("wibi_asignar_marca_productos", "Asignar marca", "marca");
  asignar("wibi_asignar_segmento_productos", "Asignar segmento", "segmento");
  asignar("wibi_asignar_stock_productos", "Asignar stock por sucursal", "stock");

  server.registerTool("wibi_crear_marca", {
    title: "Crear marca",
    description: "Crea una marca en la red de la campaña.",
    inputSchema: { ...campania, nombre: z.string().min(1) },
    annotations: WRITE,
  }, async (args) => ejecutar(() => client.post("marcas", { nombre: args.nombre }, scopeParams(client, args))));

  server.registerTool("wibi_modificar_marca", {
    title: "Modificar marca",
    description: "Cambia el nombre o el estado de una marca de la red.",
    inputSchema: {
      ...campania,
      idMarca: z.number().int().positive(),
      nombre: z.string().min(1).optional(),
      activo: z.string().optional(),
    },
    annotations: DESTRUCTIVE,
  }, async (args) => ejecutar(() => client.patch(`marcas/${args.idMarca}`, {
    nombre: args.nombre,
    activo: args.activo,
  }, scopeParams(client, args))));

  server.registerTool("wibi_eliminar_marca", {
    title: "Eliminar marca",
    description: "Elimina una marca de la red de la campaña.",
    inputSchema: { ...campania, idMarca: z.number().int().positive() },
    annotations: DESTRUCTIVE,
  }, async (args) => ejecutar(() => client.delete(`marcas/${args.idMarca}`, scopeParams(client, args))));

  server.registerTool("wibi_importar_marcas", {
    title: "Importar marcas",
    description: "Importa hasta 2000 nombres de marca en la red de la campaña.",
    inputSchema: { ...campania, nombres: z.array(z.string().min(1)).min(1).max(2000) },
    annotations: WRITE,
  }, async (args) => ejecutar(() => client.post("marcas/importar", { nombres: args.nombres }, scopeParams(client, args))));
}
