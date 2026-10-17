import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WibiClient } from "../wibiClient.js";
import { portalPermissionMap, registerPortalTools } from "./portal.js";

type Call = { method: string; path: string; body?: unknown; query?: Record<string, unknown> };
type Handler = (args: Record<string, unknown>) => Promise<{ isError?: boolean; content: Array<{ text: string }> }>;

function setup(): { handlers: Record<string, Handler>; annotations: Record<string, Record<string, boolean>>; calls: Call[] } {
  const calls: Call[] = [];
  const handlers: Record<string, Handler> = {};
  const annotations: Record<string, Record<string, boolean>> = {};
  const client = {
    defaultCampania: 13793,
    preferredIdComercio: undefined,
    get: async (path: string, query?: Record<string, unknown>) => (calls.push({ method: "GET", path, query }), { ok: true }),
    post: async (path: string, body?: unknown, query?: Record<string, unknown>) => (calls.push({ method: "POST", path, body, query }), { ok: true }),
    patch: async (path: string, body?: unknown, query?: Record<string, unknown>) => (calls.push({ method: "PATCH", path, body, query }), { ok: true }),
    put: async (path: string, body?: unknown, query?: Record<string, unknown>) => (calls.push({ method: "PUT", path, body, query }), { ok: true }),
    delete: async (path: string, query?: Record<string, unknown>) => (calls.push({ method: "DELETE", path, query }), { ok: true }),
  } as unknown as WibiClient;
  const server = {
    registerTool(name: string, config: { annotations?: Record<string, boolean> }, handler: Handler) {
      handlers[name] = handler;
      annotations[name] = config.annotations ?? {};
    },
  } as unknown as McpServer;

  registerPortalTools(server, client);
  return { handlers, annotations, calls };
}

describe("portal MCP", () => {
  it("cada tool de escritura tiene permiso de portal", () => {
    const { handlers } = setup();
    const permisos = portalPermissionMap();
    for (const name of Object.keys(handlers)) {
      if (name === "wibi_listar_categorias_tienda") continue;
      assert.ok(permisos[name], `falta permiso para ${name}`);
      assert.equal(permisos[name][1], "portalclientesconfig");
    }
  });

  it("arma los requests contra /portal con la campaña por defecto", async () => {
    const { handlers, calls } = setup();

    await handlers.wibi_portal_ver({});
    await handlers.wibi_portal_tema({ estilo: "celeste", headerStyle: undefined });
    await handlers.wibi_portal_barra_superior({ leyendas: [{ texto: "ENVÍO GRATIS", link: "tienda.php" }] });
    await handlers.wibi_portal_seccion_agregar({
      zona: "displayBlockPosition2",
      tipo: "productos_carrusel",
      parametros: { fuente: "marca", idMarca: 1 },
    });
    await handlers.wibi_portal_seccion_quitar({ idSeccion: 4409 });
    await handlers.wibi_portal_ordenar_zona({ zona: "displayHome", orden: [17, 4413] });
    await handlers.wibi_listar_categorias_tienda({});

    assert.deepEqual(
      calls.map((c) => `${c.method} ${c.path}`),
      [
        "GET portal",
        "PATCH portal/tema",
        "PUT portal/barra-superior",
        "POST portal/secciones",
        "DELETE portal/secciones/4409",
        "PUT portal/zonas/displayHome/orden",
        "GET catalogo/categorias",
      ]
    );
    for (const c of calls) {
      assert.equal(c.query?.idCampania, 13793);
    }
    assert.deepEqual(calls[1].body, { estilo: "celeste" });
    assert.deepEqual(calls[5].body, { orden: [17, 4413] });
  });

  it("menú y color de marca", async () => {
    const { handlers, calls } = setup();

    await handlers.wibi_portal_menu({
      items: [
        { tipo: "categoria", id: 8 },
        { tipo: "grupo", texto: "Marcas", hijos: [{ tipo: "marca", id: 1 }] },
      ],
      automatico: undefined,
    });
    await handlers.wibi_portal_tema({ color: "#0a7d5a" });

    assert.deepEqual(calls.map((c) => `${c.method} ${c.path}`), ["PUT portal/menu", "PATCH portal/tema"]);
    assert.deepEqual(calls[0].body, {
      items: [
        { tipo: "categoria", id: 8 },
        { tipo: "grupo", texto: "Marcas", hijos: [{ tipo: "marca", id: 1 }] },
      ],
    });
    assert.deepEqual(calls[1].body, { color: "#0a7d5a" });
  });

  it("páginas: crea sin id, edita con id, valida y quitar es destructiva", async () => {
    const { handlers, annotations, calls } = setup();

    await handlers.wibi_portal_pagina({ titulo: "Sucursales", html: "<p>Centro</p>" });
    await handlers.wibi_portal_pagina({ idPagina: 7, activa: false });
    const sinDatos = await handlers.wibi_portal_pagina({ titulo: "Sin html" });
    const sinCambios = await handlers.wibi_portal_pagina({ idPagina: 7 });
    await handlers.wibi_portal_pagina_ver({ idPagina: 7 });
    await handlers.wibi_portal_pagina_quitar({ idPagina: 7 });

    assert.ok(sinDatos.isError);
    assert.ok(sinCambios.isError);
    assert.deepEqual(calls.map((c) => `${c.method} ${c.path}`), [
      "POST portal/paginas",
      "PATCH portal/paginas/7",
      "GET portal/paginas/7",
      "DELETE portal/paginas/7",
    ]);
    assert.deepEqual(calls[1].body, { activa: false });
    assert.equal(annotations.wibi_portal_pagina_quitar.destructiveHint, true);
  });

  it("quitar sección se marca como destructiva", () => {
    const { annotations } = setup();
    assert.equal(annotations.wibi_portal_seccion_quitar.destructiveHint, true);
    assert.equal(annotations.wibi_portal_ver.readOnlyHint, true);
  });

  it("agrega imágenes en lotes de 4 y junta resultados", async () => {
    const { handlers, calls } = setup();
    const imagenes = Array.from({ length: 6 }, (_, i) => ({ urlImagen: `https://cdn.test/${i}.jpg` }));

    const r = await handlers.wibi_portal_imagen_agregar({ idSeccion: 4415, imagenes, derechosConfirmados: true });

    assert.equal(r.isError, undefined);
    assert.deepEqual(
      calls.map((c) => `${c.method} ${c.path}`),
      ["POST portal/secciones/4415/imagenes", "POST portal/secciones/4415/imagenes"]
    );
    assert.equal((calls[0].body as { imagenes: unknown[] }).imagenes.length, 4);
    assert.equal((calls[1].body as { imagenes: unknown[] }).imagenes.length, 2);
  });

  it("reemplazar una imagen exige confirmar derechos; cambiar el link no", async () => {
    const { handlers, calls } = setup();

    const sinDerechos = await handlers.wibi_portal_imagen_editar({ idImagen: 9, urlImagen: "https://otro.test/a.jpg" });
    assert.equal(sinDerechos.isError, true);
    assert.equal(calls.length, 0);

    await handlers.wibi_portal_imagen_editar({ idImagen: 9, link: "tienda.php?idMarca=1" });
    assert.deepEqual(calls[0].body, { link: "tienda.php?idMarca=1" });
  });

  it("link de subida: sección requiere idSeccion; logo no", async () => {
    const { handlers, calls } = setup();

    const sinSeccion = await handlers.wibi_portal_link_subida({ destino: "seccion" });
    assert.equal(sinSeccion.isError, true);

    await handlers.wibi_portal_link_subida({ destino: "logo" });
    await handlers.wibi_portal_imagen_identidad({ tipo: "favicon", urlImagen: "https://cliente.test/f.png", derechosConfirmados: true });
    assert.deepEqual(
      calls.map((c) => `${c.method} ${c.path}`),
      ["POST portal/subidas", "PUT portal/identidad/favicon"]
    );
    assert.deepEqual(calls[0].body, { destino: "logo" });
  });

  it("borrador: vista previa, publicar, descartar, versiones y restaurar", async () => {
    const { handlers, annotations, calls } = setup();

    await handlers.wibi_portal_vista_previa({});
    await handlers.wibi_portal_publicar({ descripcion: "Home nueva" });
    await handlers.wibi_portal_descartar_borrador({});
    await handlers.wibi_portal_versiones({});
    await handlers.wibi_portal_restaurar({ idVersion: 7 });

    assert.deepEqual(
      calls.map((c) => `${c.method} ${c.path}`),
      [
        "GET portal/borrador/vista-previa",
        "POST portal/publicar",
        "DELETE portal/borrador",
        "GET portal/versiones",
        "POST portal/versiones/7/restaurar",
      ]
    );
    assert.deepEqual(calls[1].body, { descripcion: "Home nueva" });
    assert.equal(annotations.wibi_portal_descartar_borrador.destructiveHint, true);
    assert.equal(annotations.wibi_portal_restaurar.destructiveHint, true);
  });

  it("bloque de texto: crea sin id, edita con id y valida datos mínimos", async () => {
    const { handlers, calls } = setup();

    const sinDatos = await handlers.wibi_portal_bloque_texto({ titulo: "FAQ" });
    assert.equal(sinDatos.isError, true);

    await handlers.wibi_portal_bloque_texto({ zona: "displayBlockPosition3", html: "<p>FAQ</p>" });
    await handlers.wibi_portal_bloque_texto({ idBloque: 213, activo: false });

    assert.deepEqual(
      calls.map((c) => `${c.method} ${c.path}`),
      ["POST portal/bloques", "PATCH portal/bloques/213"]
    );
    assert.deepEqual(calls[1].body, { activo: false });
  });
});
