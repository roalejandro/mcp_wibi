import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { WibiClient } from "../wibiClient.js";
import { can, errorResult, scopeParams } from "./helpers.js";
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

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export function registerPanelOperacionTools(
  server: McpServer,
  client: WibiClient,
  permisos?: Record<string, string[]>
): void {
  const campania = { idCampania, idComercio, operationId };

  server.registerTool("wibi_grilla_cupones", {
    title: "Grilla de cupones",
    description: "Lista los cupones con el formato de la pantalla del panel.",
    inputSchema: { idCampania, idComercio, action: z.string().optional() },
    annotations: READONLY,
  }, async (args) => ejecutar(() => client.get("cupones/grilla", {
    ...scopeParams(client, args),
    action: args.action ?? "list",
  })));

  server.registerTool("wibi_alta_cupon", {
    title: "Alta de cupón",
    description: "Crea un cupón en la campaña.",
    inputSchema: {
      ...campania,
      codigo: z.string().min(1),
      descripcion: z.string().optional(),
      tipo: z.string().min(1),
      valor: z.number(),
      desde: fecha,
      hasta: fecha,
      usosMaximos: z.number().int().nonnegative().optional(),
      usosPorCliente: z.number().int().nonnegative().optional(),
      marcas: z.array(z.number().int().positive()).optional(),
      segmentos: z.array(z.number().int().positive()).optional(),
      productos: z.array(z.number().int().positive()).optional(),
    },
    annotations: WRITE,
  }, async (args) => ejecutar(() => {
    const { idCampania, idComercio, operationId: pedido, ...datos } = args;
    return client.post("cupones/comando", {
      ...datos,
      action: "new",
      operation_id: identificadorOperacion(pedido),
    }, scopeParams(client, { idCampania, idComercio }));
  }));

  server.registerTool("wibi_editar_cupon", {
    title: "Editar cupón",
    description: "Modifica la descripción y la fecha de fin de un cupón.",
    inputSchema: { ...campania, idCupon: z.number().int().positive(), descripcion: z.string(), hasta: fecha },
    annotations: DESTRUCTIVE,
  }, async (args) => cupon(client, args, "edit", { id_cupon: args.idCupon, descripcion: args.descripcion, hasta: args.hasta }));

  server.registerTool("wibi_eliminar_cupon", {
    title: "Eliminar cupón",
    description: "Desactiva un cupón de la campaña.",
    inputSchema: { ...campania, idCupon: z.number().int().positive() },
    annotations: DESTRUCTIVE,
  }, async (args) => cupon(client, args, "delete", { id_cupon: args.idCupon }));

  server.registerTool("wibi_activar_cupon", {
    title: "Cambiar estado del cupón",
    description: "Alterna el estado de un cupón.",
    inputSchema: { ...campania, idCupon: z.number().int().positive() },
    annotations: DESTRUCTIVE,
  }, async (args) => cupon(client, args, "toggle", { id_cupon: args.idCupon }));

  const clienteCupon = { ...campania, idCupon: z.number().int().positive(), idCliente: z.number().int().positive() };
  server.registerTool("wibi_asignar_cupon", {
    title: "Asignar cupón",
    description: "Asigna un cupón a un cliente de la campaña.",
    inputSchema: clienteCupon,
    annotations: DESTRUCTIVE,
  }, async (args) => cupon(client, args, "assign", { id_cupon: args.idCupon, id_cliente: args.idCliente }));

  server.registerTool("wibi_desasignar_cupon", {
    title: "Quitar cupón",
    description: "Quita la asignación de un cupón a un cliente.",
    inputSchema: clienteCupon,
    annotations: DESTRUCTIVE,
  }, async (args) => cupon(client, args, "unassign", { id_cupon: args.idCupon, id_cliente: args.idCliente }));

  server.registerTool("wibi_validar_cupon", {
    title: "Validar cupón",
    description: "Comprueba si un código de cupón está activo en la campaña.",
    inputSchema: { ...campania, codigo: z.string().min(1) },
    annotations: WRITE,
  }, async (args) => cupon(client, args, "validate", { codigo: args.codigo }));

  server.registerTool("wibi_usar_cupon", {
    title: "Usar cupón",
    description: "Registra el uso de un cupón para un cliente.",
    inputSchema: clienteCupon,
    annotations: DESTRUCTIVE,
  }, async (args) => cupon(client, args, "use", { id_cupon: args.idCupon, id_cliente: args.idCliente }));

  server.registerTool("wibi_alta_comercio", {
    title: "Alta de comercio",
    description: "Crea un comercio en una red de la campaña. La clave solo se envía si el usuario la indica y no vuelve en la respuesta.",
    inputSchema: comercioSchema(false),
    annotations: WRITE,
  }, async (args) => ejecutar(() => client.post("comercios/guardar", cuerpoComercio(args, "new"), scopeParams(client, args)), [args.clave]));

  server.registerTool("wibi_editar_comercio", {
    title: "Editar comercio",
    description: "Modifica un comercio cuya red pertenece a la campaña. Sin clave, la clave actual no cambia.",
    inputSchema: comercioSchema(true),
    annotations: DESTRUCTIVE,
  }, async (args) => ejecutar(() => client.post("comercios/guardar", cuerpoComercio(args, "edit"), scopeParams(client, args)), [args.clave]));

  server.registerTool("wibi_alta_usuario", {
    title: "Alta de usuario",
    description: "Crea un usuario del panel. La clave tiene que indicarla el usuario y no se devuelve.",
    inputSchema: usuarioSchema(false),
    annotations: WRITE,
  }, async (args: {
    idCampania?: number;
    username: string;
    nombre?: string;
    email?: string;
    administrador?: "A" | "S" | "N" | "O";
    activo?: boolean;
    idGrupoEmpresa?: number;
    idGrupoUsuario?: number;
    idcomercios?: number[];
    pass?: string;
  }) => ejecutar(() => client.post("usuarios/guardar", cuerpoUsuario(args, "new"), scopeParams(client, args)), [args.pass]));

  server.registerTool("wibi_editar_usuario", {
    title: "Editar usuario",
    description: "Modifica un usuario del panel. No cambia la clave.",
    inputSchema: usuarioSchema(true),
    annotations: DESTRUCTIVE,
  }, async (args: {
    idCampania?: number;
    idUsuario: number;
    username: string;
    nombre?: string;
    email?: string;
    administrador?: "A" | "S" | "N" | "O";
    activo?: boolean;
    idGrupoEmpresa?: number;
    idGrupoUsuario?: number;
    idcomercios?: number[];
  }) => ejecutar(() => client.post("usuarios/guardar", cuerpoUsuario(args, "edit"), scopeParams(client, args))));

  server.registerTool("wibi_guardar_parametro", {
    title: "Guardar parámetro",
    description: "Crea o actualiza un parámetro de la campaña.",
    inputSchema: { idCampania, parametro: z.string().min(1), valor: z.string(), notas: z.string().optional() },
    annotations: DESTRUCTIVE,
  }, async (args) => ejecutar(() => client.post("parametros/guardar", {
    parametro: args.parametro,
    valor: args.valor,
    notas: args.notas,
    action: "save",
  }, scopeParams(client, args))));

  server.registerTool("wibi_eliminar_parametro", {
    title: "Eliminar parámetro",
    description: "Elimina un parámetro de la campaña.",
    inputSchema: { idCampania, parametro: z.string().min(1) },
    annotations: DESTRUCTIVE,
  }, async (args) => ejecutar(() => client.post("parametros/guardar", { ...args, action: "delete" }, scopeParams(client, args))));

  server.registerTool("wibi_alta_flujo", {
    title: "Alta de flujo",
    description: "Crea un flujo de automatización inactivo.",
    inputSchema: flujoSchema(false),
    annotations: WRITE,
  }, async (args) => flujo(client, args, "new"));

  server.registerTool("wibi_editar_flujo", {
    title: "Editar flujo",
    description: "Actualiza nombre, descripción y límites de un flujo.",
    inputSchema: flujoSchema(true),
    annotations: DESTRUCTIVE,
  }, async (args) => flujo(client, args, "edit"));

  server.registerTool("wibi_guardar_dibujo_flujo", {
    title: "Guardar dibujo del flujo",
    description: "Guarda el JSON del diagrama de un flujo de la campaña.",
    inputSchema: { idCampania: idCampaniaObligatoria, idFlujo: z.number().int().positive(), json: z.string().min(2) },
    annotations: DESTRUCTIVE,
  }, async (args) => ejecutar(() => client.post("flujos/guardar", {
    action: "save_json",
    idFlujo: args.idFlujo,
    json: args.json,
  }, scopeParams(client, args))));

  server.registerTool("wibi_activar_flujo", {
    title: "Activar o desactivar flujo",
    description: "Invierte el estado activo de un flujo.",
    inputSchema: { idCampania: idCampaniaObligatoria, idFlujo: z.number().int().positive() },
    annotations: DESTRUCTIVE,
  }, async (args) => ejecutar(() => client.post("flujos/guardar", {
    action: "toggle_activo",
    idFlujo: args.idFlujo,
  }, scopeParams(client, args))));

  server.registerTool("wibi_eliminar_flujo", {
    title: "Eliminar flujo",
    description: "Elimina un flujo de la campaña.",
    inputSchema: { idCampania: idCampaniaObligatoria, idFlujo: z.number().int().positive() },
    annotations: DESTRUCTIVE,
  }, async (args) => ejecutar(() => client.post("flujos/guardar", {
    action: "delete",
    idFlujo: args.idFlujo,
  }, scopeParams(client, args))));

  server.registerTool("wibi_enviar_whatsapp", {
    title: "Enviar WhatsApp individual",
    description: "Envía una plantilla ya cargada a un cliente de la campaña. No permite cargar tokens ni canales.",
    inputSchema: {
      idCampania,
      idcliente: z.number().int().positive(),
      idplantilla: z.number().int().positive(),
      parametrosBody: z.array(z.string()).optional(),
    },
    annotations: DESTRUCTIVE,
  }, async (args) => ejecutar(() => client.post("whatsapp/operativo", {
    action: "enviar",
    idcliente: args.idcliente,
    idplantilla: args.idplantilla,
    parametros_body: args.parametrosBody,
  }, scopeParams(client, args))));

  server.registerTool("wibi_alta_campania", {
    title: "Alta de campaña",
    description: "Crea una campaña. Solo está disponible para un superadmin.",
    inputSchema: {
      nombre: z.string().min(1),
      tarjetaVirtual: z.number().int().optional(),
      desde: z.number().int().optional(),
      hasta: z.number().int().optional(),
      idGrupoEmpresa: z.number().int().optional(),
      calcularPuntosSobre: z.string().optional(),
    },
    annotations: WRITE,
  }, async (args) => ejecutar(() => client.post("campanias/superadmin", args, scopeParams(client, {}))));

  if (can(permisos, "campania", "clientes", "exportar") || can(permisos, "campania", "movimientos", "exportar")) {
    registrarExport(server, client, permisos);
  }
}

function cupon(
  client: WibiClient,
  args: { idCampania?: number; idComercio?: number; operationId?: string },
  action: string,
  datos: Record<string, unknown>
) {
  return ejecutar(() => client.post("cupones/comando", {
    ...datos,
    action,
    operation_id: identificadorOperacion(args.operationId),
  }, scopeParams(client, args)));
}

function comercioSchema(edicion: boolean) {
  return {
    idCampania,
    idComercio,
    ...(edicion ? { id: z.number().int().positive() } : {}),
    codigo: z.number().int().positive(),
    idRed: z.number().int().positive(),
    nombre: z.string().min(1),
    usuario: z.string().min(1),
    clave: z.string().min(1).optional().describe("Solo si el usuario quiere definirla. No se muestra después."),
    empresa: z.number().int().optional(),
    direccion: z.string().optional(),
    latitud: z.number().optional(),
    longitud: z.number().optional(),
    sucursal: z.string().optional(),
    activo: z.boolean().optional(),
  };
}

function cuerpoComercio(args: {
  id?: number;
  codigo: number;
  idRed: number;
  nombre: string;
  usuario: string;
  clave?: string;
  empresa?: number;
  direccion?: string;
  latitud?: number;
  longitud?: number;
  sucursal?: string;
  activo?: boolean;
}, action: "new" | "edit") {
  return {
    action,
    id: args.id,
    codigo: args.codigo,
    "id-red": args.idRed,
    nombre: args.nombre,
    usuario: args.usuario,
    ...(args.clave ? { clave: args.clave } : {}),
    empresa: args.empresa,
    direccion: args.direccion,
    latitud: args.latitud,
    longitud: args.longitud,
    sucursal: args.sucursal,
    ...(args.activo ? { activo: "S" } : {}),
  };
}

function usuarioSchema(edicion: boolean) {
  return {
    idCampania,
    ...(edicion ? { idUsuario: z.number().int().positive() } : { pass: z.string().min(6).optional() }),
    username: z.string().min(1),
    nombre: z.string().optional(),
    email: z.string().optional(),
    administrador: z.enum(["A", "S", "N", "O"]).optional(),
    activo: z.boolean().optional(),
    idGrupoEmpresa: z.number().int().optional(),
    idGrupoUsuario: z.number().int().optional(),
    idcomercios: z.array(z.number().int().positive()).optional(),
  };
}

function cuerpoUsuario(args: {
  idUsuario?: number;
  username: string;
  nombre?: string;
  email?: string;
  administrador?: string;
  activo?: boolean;
  idGrupoEmpresa?: number;
  idGrupoUsuario?: number;
  idcomercios?: number[];
  pass?: string;
}, action: "new" | "edit") {
  return {
    action,
    idUsuario: args.idUsuario,
    username: args.username,
    nombre: args.nombre,
    email: args.email,
    administrador: args.administrador,
    ...(args.activo ? { activo: "S" } : {}),
    "id-grupo-empresa": args.idGrupoEmpresa,
    "id-grupo-usuario": args.idGrupoUsuario,
    idcomercios: args.idcomercios?.join(","),
    ...(args.pass ? { pass: args.pass } : {}),
  };
}

function flujoSchema(edicion: boolean) {
  return {
    idCampania: idCampaniaObligatoria,
    ...(edicion ? { idFlujo: z.number().int().positive() } : {}),
    nombre: z.string().min(1),
    descripcion: z.string().optional(),
    antispamHoras: z.number().int().positive().optional(),
    antispamMaxEnvios: z.number().int().positive().optional(),
  };
}

function flujo(
  client: WibiClient,
  args: {
    idCampania: number;
    idFlujo?: number;
    nombre: string;
    descripcion?: string;
    antispamHoras?: number;
    antispamMaxEnvios?: number;
  },
  action: "new" | "edit"
) {
  return ejecutar(() => client.post("flujos/guardar", { ...args, action }, scopeParams(client, args)));
}

function registrarExport(
  server: McpServer,
  client: WibiClient,
  permisos?: Record<string, string[]>
): void {
  server.registerTool("wibi_crear_export_tarea", {
    title: "Crear exportación asincrónica",
    description: "Encola una exportación de clientes o movimientos. El export directo existente sigue disponible.",
    inputSchema: {
      idCampania,
      tipo: z.enum(["clientes", "movimientos"]),
      filtros: z.record(z.unknown()).optional(),
    },
    annotations: WRITE,
  }, async (args) => {
    const seccion = args.tipo === "movimientos" ? "movimientos" : "clientes";
    if (!can(permisos, "campania", seccion, "exportar")) {
      return errorResult(new Error("No tenés permiso para exportar ese tipo."));
    }
    return ejecutar(() => client.post("export/tareas", args, scopeParams(client, args)));
  });

  server.registerTool("wibi_estado_export_tarea", {
    title: "Estado de exportación",
    description: "Consulta el estado de una exportación propia.",
    inputSchema: { idCampania, idTarea: z.number().int().positive() },
    annotations: READONLY,
  }, async (args) => ejecutar(() => client.get(`export/tareas/${args.idTarea}`, scopeParams(client, args))));

  server.registerTool("wibi_cancelar_export_tarea", {
    title: "Cancelar exportación",
    description: "Cancela una exportación que todavía esté pendiente.",
    inputSchema: { idCampania, idTarea: z.number().int().positive() },
    annotations: DESTRUCTIVE,
  }, async (args) => ejecutar(() => client.post(`export/tareas/${args.idTarea}/cancelar`, {}, scopeParams(client, args))));

  server.registerTool("wibi_descargar_export_tarea", {
    title: "Descargar exportación",
    description: "Descarga el archivo de una exportación completada.",
    inputSchema: { idCampania, idTarea: z.number().int().positive() },
    annotations: READONLY,
  }, async (args) => ejecutar(() => client.getBinary(`export/tareas/${args.idTarea}/descarga`, scopeParams(client, args))));
}
