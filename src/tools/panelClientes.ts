import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { WibiClient } from "../wibiClient.js";
import { scopeParams } from "./helpers.js";
import {
  DESTRUCTIVE,
  READONLY,
  WRITE,
  ejecutar,
  idCampania,
  idCampaniaObligatoria,
  idComercio,
  identificadorOperacion,
  operationId,
} from "./adminShared.js";

const alcance = { idCampania, idComercio, operationId };
const cliente = {
  idComercio: z.number().int().positive(),
  dni: z.string().optional(),
  nroTarjeta: z.string().optional(),
  nombre: z.string().optional(),
  apellido: z.string().optional(),
  email: z.string().optional(),
  telefono: z.string().optional(),
  sexo: z.string().optional(),
  direccion: z.string().optional(),
  localidad: z.string().optional(),
  fechaNac: z.string().optional().describe("Fecha de nacimiento como la carga el panel."),
  idgrupointeres: z.number().int().optional(),
  idCategoria: z.number().int().positive().optional(),
  recibedifusiones: z.string().optional(),
  esVirtual: z.boolean().optional(),
};

export function registerPanelClientesTools(server: McpServer, client: WibiClient): void {
  server.registerTool(
    "wibi_alta_cliente",
    {
      title: "Alta de cliente",
      description: "Da de alta un cliente en una sucursal de la campaña. No genera ni devuelve claves.",
      inputSchema: { ...alcance, ...cliente },
      annotations: WRITE,
    },
    async (args) => ejecutar(async () => {
      const { operationId: pedido, ...datos } = args;
      return client.post("clientes/guardar", {
        ...datos,
        action: "new",
        operation_id: identificadorOperacion(pedido),
      }, scopeParams(client, args));
    })
  );

  server.registerTool(
    "wibi_editar_cliente",
    {
      title: "Editar cliente",
      description: "Modifica los datos de un cliente que ya está en la sucursal indicada. Para cambiar la tarjeta, enviá la nueva y la anterior.",
      inputSchema: {
        ...alcance,
        ...cliente,
        idCliente: z.number().int().positive(),
        nroTarjetaAnterior: z.string().optional(),
      },
      annotations: DESTRUCTIVE,
    },
    async (args) => ejecutar(async () => {
      const { operationId: pedido, nroTarjetaAnterior, ...datos } = args;
      const cambiaTarjeta = Boolean(nroTarjetaAnterior);
      return client.post("clientes/guardar", {
        ...datos,
        ...(cambiaTarjeta ? { nroTarjetaAnterior } : {}),
        action: cambiaTarjeta ? "edit_card" : "edit",
        operation_id: identificadorOperacion(pedido),
      }, scopeParams(client, args));
    })
  );

  const lectura = async (ruta: string, args: { idCliente: number; idCampania?: number; idComercio?: number }) =>
    ejecutar(() => client.get(ruta, scopeParams(client, args)));

  server.registerTool("wibi_ficha_cliente", {
    title: "Ficha del cliente",
    description: "Devuelve la ficha administrativa del cliente.",
    inputSchema: { idCliente: z.number().int().positive(), idCampania, idComercio },
    annotations: READONLY,
  }, async (args) => lectura(`clientes/${args.idCliente}/ficha`, args));

  server.registerTool("wibi_resumen_cliente", {
    title: "Resumen del cliente",
    description: "Devuelve el resumen administrativo del cliente.",
    inputSchema: { idCliente: z.number().int().positive(), idCampania, idComercio },
    annotations: READONLY,
  }, async (args) => lectura(`clientes/${args.idCliente}/resumen`, args));

  server.registerTool("wibi_transacciones_cliente", {
    title: "Transacciones del cliente",
    description: "Lista las transacciones de la ficha del cliente.",
    inputSchema: { idCliente: z.number().int().positive(), idCampania, idComercio },
    annotations: READONLY,
  }, async (args) => lectura(`clientes/${args.idCliente}/transacciones`, args));

  server.registerTool("wibi_estado_cliente", {
    title: "Activar o desactivar cliente",
    description: "Cambia el estado activo del cliente. 1 lo activa y 0 lo desactiva.",
    inputSchema: {
      idCliente: z.number().int().positive(),
      activo: z.union([z.literal(0), z.literal(1)]),
      idCampania,
      idComercio,
      operationId,
    },
    annotations: DESTRUCTIVE,
  }, async (args) => ejecutar(() => client.patch(
    `clientes/${args.idCliente}/estado`,
    { activo: String(args.activo), operation_id: identificadorOperacion(args.operationId) },
    scopeParams(client, args)
  )));

  server.registerTool("wibi_reset_clave_cliente", {
    title: "Cambiar clave del cliente",
    description: "Reemplaza la clave del portal del cliente por la que indique el usuario. No la genera ni la repite en la respuesta.",
    inputSchema: {
      idCliente: z.number().int().positive(),
      clave: z.string().min(6).describe("Nueva clave elegida por el usuario. Mínimo 6 caracteres."),
      idCampania,
      idComercio,
      operationId,
    },
    annotations: DESTRUCTIVE,
  }, async (args) => ejecutar(() => client.post(
    `clientes/${args.idCliente}/reset-clave`,
    { clave: args.clave, operation_id: identificadorOperacion(args.operationId) },
    scopeParams(client, args)
  ), [args.clave]));

  server.registerTool("wibi_reemplazar_tags_cliente", {
    title: "Reemplazar etiquetas de clientes",
    description: "Reemplaza el conjunto de etiquetas de los clientes indicados. La lista vacía les quita todas las etiquetas.",
    inputSchema: {
      idCampania: idCampaniaObligatoria,
      idComercio,
      clientes: z.array(z.number().int().positive()).min(1),
      tags: z.array(z.number().int().positive()),
    },
    annotations: DESTRUCTIVE,
  }, async (args) => ejecutar(() => client.put("clientes/etiquetas", {
    idCampania: args.idCampania,
    clientes: args.clientes,
    tags: args.tags,
  }, scopeParams(client, args))));
}
