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

const WRITE_IDEMPOTENT = { ...WRITE, idempotentHint: true };

const DESTRUCTIVE = { ...WRITE, destructiveHint: true };

const idCampania = z
  .number()
  .int()
  .positive()
  .optional()
  .describe("Campaña cuyo portal se configura. Opcional si la sesión opera una sola campaña.");

const zona = z
  .string()
  .min(1)
  .describe(
    "Código de la zona de la home (ver wibi_portal_ver). Habituales: displayTop (debajo del header), displayHome (principal), displayBlockPosition1/2/3 (bloques siguientes), displayFooter (pie)."
  );

const TIPOS_SECCION = [
  "imagenes",
  "productos_carrusel",
  "productos_grilla",
  "categorias",
  "contenido",
  "buscador",
  "login",
  "tienda",
  "mis_pedidos",
  "usuario_info",
  "usuario_editar",
  "usuario_movimientos",
  "suscripcion",
  "cuenta_corriente",
  "onboarding_abonos",
] as const;

const PARAMETROS_DOC =
  "Parámetros según el tipo. imagenes: {titulo?, modo: banner|tarjetas|logos|grilla, anchoCompleto?, porVista?/porVistaTablet?/porVistaMobile? (tarjetas y logos), columnas?/columnasMobile? (grilla), autoplay?, intervalo?}. " +
  "productos_carrusel / productos_grilla: {titulo?, subtitulo?, cantidad? 1-50, fuente: populares|destacados|oferta|categoria|marca, idCategoria? (fuente categoria, ver wibi_listar_categorias_tienda), idMarca? (fuente marca, ver wibi_listar_marcas), verTienda?}. " +
  "categorias: {titulo?, estilo: circulo|card, cantidad? (0 = todas), verTodo?}. El resto de los tipos no lleva parámetros.";

/** Imágenes por pedido a la API: el portal descarga cada una y el pedido tiene timeout. */
const IMAGENES_POR_PEDIDO = 4;
const TIMEOUT_IMAGENES_MS = 90_000;

const LINKS_DOC =
  "Links válidos: URL https://…, o una página del portal como tienda.php, tienda.php?idMarca=1, tienda.php?idCategoria=5, tienda.php?soloOfertas=1, registro.php.";

/**
 * Configuración del portal de clientes (wibi.com.ar/p/{key}/): identidad, SEO, tema, barra
 * superior, secciones de la home y bloques de texto. Requiere sesión de administrador.
 */
export function registerPortalTools(server: McpServer, client: WibiClient): void {
  server.registerTool(
    "wibi_portal_ver",
    {
      title: "Ver portal de clientes",
      description:
        "Devuelve el estado completo del portal de clientes de la campaña: URL, identidad (nombre, logo, WhatsApp), SEO con vista previa en Google y al compartir, tema, barra superior, y cada zona de la home con sus secciones en orden (idSeccion, tipo, parámetros, imágenes) y sus bloques de texto. " +
        "Usalo SIEMPRE antes de modificar el portal para conocer los idSeccion / idBloque y no duplicar secciones. También devuelve tiposSeccion con los parámetros de cada tipo. " +
        "BORRADOR: todos los cambios que hagan las tools del portal van a un borrador que los clientes no ven; 'borrador' indica si hay cambios sin publicar y trae el link de vista previa. Al terminar, mostrale la vista previa al usuario y publicá con wibi_portal_publicar cuando lo apruebe.",
      inputSchema: { idCampania },
      annotations: READONLY,
    },
    async (args) => {
      try {
        return jsonResult(await client.get("portal", scopeParams(client, args)));
      } catch (e) {
        return errorResult(e);
      }
    }
  );

  server.registerTool(
    "wibi_portal_tema",
    {
      title: "Cambiar tema del portal",
      description:
        "Cambia la apariencia del portal. estilo define el color principal (azul, verde, purpura, rojo, amarillo, celeste, naranja); para el color exacto de la marca del cliente pasá color (#rrggbb) y queda estilo personalizado. Si el color es muy claro la respuesta trae un aviso de legibilidad. Indicá sólo lo que cambia.",
      inputSchema: {
        idCampania,
        estilo: z.enum(["azul", "verde", "purpura", "rojo", "amarillo", "celeste", "naranja", "personalizado"]).optional(),
        color: z
          .string()
          .regex(/^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/)
          .optional()
          .describe("Color exacto de la marca, ej. #0a7d5a (sacalo del logo o la web del cliente)."),
        headerStyle: z
          .enum(["default", "style-2", "style-3", "absolute"])
          .optional()
          .describe("Diseño del header; absolute = superpuesto al banner."),
        menuPosition: z.enum(["center", "left", "right"]).optional(),
        headerBackground: z.enum(["white", "dark", "primary", "transparent"]).optional(),
        buttonStyle: z.enum(["fill", "outline", "rounded"]).optional(),
      },
      annotations: WRITE_IDEMPOTENT,
    },
    async ({ idCampania: idC, ...cambios }) => {
      try {
        return jsonResult(await client.patch("portal/tema", sinIndefinidos(cambios), scopeParams(client, { idCampania: idC })));
      } catch (e) {
        return errorResult(e);
      }
    }
  );

  server.registerTool(
    "wibi_portal_identidad",
    {
      title: "Cambiar identidad del portal",
      description:
        "Cambia nombre, subtítulo, WhatsApp de contacto y/o términos y condiciones (HTML; se limpia de scripts) del portal. Indicá sólo lo que cambia. " +
        "Para el logo y el favicon usá wibi_portal_imagen_identidad o wibi_portal_link_subida.",
      inputSchema: {
        idCampania,
        nombre: z.string().min(1).max(100).optional(),
        subtitulo: z.string().max(100).optional(),
        whatsapp: z.string().max(30).optional().describe("Con código de país, como se va a mostrar, ej. +54 9 11 2233-4455. Vacío lo quita."),
        terminosCondiciones: z.string().optional().describe("HTML de términos y condiciones."),
      },
      annotations: WRITE_IDEMPOTENT,
    },
    async ({ idCampania: idC, ...cambios }) => {
      try {
        return jsonResult(await client.patch("portal/identidad", sinIndefinidos(cambios), scopeParams(client, { idCampania: idC })));
      } catch (e) {
        return errorResult(e);
      }
    }
  );

  server.registerTool(
    "wibi_portal_seo",
    {
      title: "Cambiar SEO del portal",
      description:
        "Cambia el título y la descripción con que el portal aparece en Google y al compartir el link (WhatsApp, redes). Recomendado: título ≤ 60 caracteres, descripción ≤ 160. " +
        "Proponé textos a partir del rubro y de los productos reales del catálogo; no inventes promesas (envíos, precios, cuotas) que el comercio no ofrezca. Vacío = usa el nombre / subtítulo. Devuelve la vista previa y avisos.",
      inputSchema: {
        idCampania,
        metaTitulo: z.string().max(120).optional(),
        metaDescripcion: z.string().max(300).optional(),
        metaKeywords: z.string().max(255).optional(),
      },
      annotations: WRITE_IDEMPOTENT,
    },
    async ({ idCampania: idC, ...cambios }) => {
      try {
        return jsonResult(await client.patch("portal/seo", sinIndefinidos(cambios), scopeParams(client, { idCampania: idC })));
      } catch (e) {
        return errorResult(e);
      }
    }
  );

  server.registerTool(
    "wibi_portal_barra_superior",
    {
      title: "Configurar barra superior del portal",
      description:
        "Reemplaza las leyendas que rotan en la barra superior del portal (máx. 10, ej. 'ENVÍO GRATIS DESDE $50.000'). Sin leyendas vuelve al texto de siempre. " +
        LINKS_DOC,
      inputSchema: {
        idCampania,
        leyendas: z
          .array(
            z.object({
              texto: z.string().min(1).max(120),
              link: z.string().max(300).optional(),
            })
          )
          .max(10),
        intervalo: z.number().min(2).max(20).optional().describe("Segundos entre leyendas (default 4)."),
        saludoLogueado: z
          .boolean()
          .optional()
          .describe("Con sesión iniciada, mostrar 'Hola, {cliente}' primero (default true)."),
      },
      annotations: WRITE_IDEMPOTENT,
    },
    async ({ idCampania: idC, ...body }) => {
      try {
        return jsonResult(await client.put("portal/barra-superior", sinIndefinidos(body), scopeParams(client, { idCampania: idC })));
      } catch (e) {
        return errorResult(e);
      }
    }
  );

  const menuItemBase = {
    tipo: z.enum(["categoria", "marca", "sistema", "pagina", "link"]),
    id: z.number().int().positive().optional().describe("categoria: idCategoria (wibi_listar_categorias_tienda) · marca: idMarca (wibi_listar_marcas)."),
    subcategorias: z.boolean().optional().describe("categoria: desplegar sus subcategorías (default true)."),
    clave: z
      .enum(["tienda", "ofertas", "carrito", "puntos", "pedidos", "suscripciones"])
      .optional()
      .describe("sistema: página del portal. puntos/pedidos/suscripciones sólo se ven con sesión; tienda/ofertas/carrito, si la tienda está activa."),
    slug: z.string().max(80).optional().describe("pagina: slug de una página estática del portal."),
    texto: z.string().max(40).optional().describe("Texto en el menú; si falta, el nombre de la categoría / marca / opción. Obligatorio en link."),
    url: z.string().max(300).optional().describe("link: URL http(s) o página de la tienda (tienda.php?soloOfertas=1)."),
    nuevaPestana: z.boolean().optional(),
  };

  server.registerTool(
    "wibi_portal_menu",
    {
      title: "Configurar menú del encabezado del portal",
      description:
        "Reemplaza el menú del encabezado (megamenú). Es opt-in por portal: sin menú activo el encabezado muestra Inicio y Tienda como siempre. " +
        "automatico=true arma solo Tienda + las categorías de la tienda. Si no, items: categorías (con sus subcategorías), marcas, opciones del portal, páginas, links y grupos " +
        "(un grupo es un desplegable con hasta 30 ítems; con más de 8 o con categorías que tienen subcategorías se muestra como megamenú en columnas). " +
        "Máximo 12 ítems de primer nivel. El menú actual viene en wibi_portal_ver (menu). Va al borrador como el resto: se ve en la vista previa y se publica con wibi_portal_publicar.",
      inputSchema: {
        idCampania,
        activo: z.boolean().optional().describe("false = volver al encabezado de siempre (default true)."),
        automatico: z.boolean().optional(),
        items: z
          .array(
            z.object({
              ...menuItemBase,
              tipo: z.enum(["categoria", "marca", "sistema", "pagina", "link", "grupo"]),
              hijos: z.array(z.object(menuItemBase)).max(30).optional().describe("grupo: ítems del desplegable (sin grupos adentro)."),
            })
          )
          .max(12),
      },
      annotations: WRITE_IDEMPOTENT,
    },
    async ({ idCampania: idC, ...body }) => {
      try {
        return jsonResult(await client.put("portal/menu", sinIndefinidos(body), scopeParams(client, { idCampania: idC })));
      } catch (e) {
        return errorResult(e);
      }
    }
  );

  server.registerTool(
    "wibi_portal_seccion_agregar",
    {
      title: "Agregar sección a la home del portal",
      description:
        "Agrega una sección a una zona de la home. Usos típicos: imagenes modo banner = hero rotativo; tarjetas = promociones; logos = marcas; grilla = banners fijos; productos_carrusel con fuente marca o categoria = vidriera de una marca / categoría. " +
        "imagenes, productos_carrusel y productos_grilla admiten varias por zona; el resto, una. A una sección de imágenes nueva después se le cargan las imágenes con wibi_portal_imagen_agregar (por URL) o wibi_portal_link_subida (archivos del usuario). " +
        PARAMETROS_DOC,
      inputSchema: {
        idCampania,
        zona,
        tipo: z.enum(TIPOS_SECCION),
        posicion: z.number().int().min(1).optional().describe("Lugar dentro de la zona (1 = primera). Default: al final."),
        parametros: z.record(z.unknown()).optional().describe(PARAMETROS_DOC),
        activa: z.boolean().optional().describe("Default true."),
      },
      annotations: WRITE,
    },
    async ({ idCampania: idC, ...body }) => {
      try {
        return jsonResult(await client.post("portal/secciones", sinIndefinidos(body), scopeParams(client, { idCampania: idC })));
      } catch (e) {
        return errorResult(e);
      }
    }
  );

  server.registerTool(
    "wibi_portal_seccion_configurar",
    {
      title: "Configurar sección del portal",
      description:
        "Cambia los parámetros de una sección y/o la activa o desactiva (ocultar sin borrar). Los parametros se combinan con los actuales (una clave en null se borra), salvo reemplazarParametros=true. " +
        PARAMETROS_DOC,
      inputSchema: {
        idCampania,
        idSeccion: z.number().int().positive().describe("idSeccion de wibi_portal_ver."),
        parametros: z.record(z.unknown()).optional(),
        reemplazarParametros: z.boolean().optional(),
        activa: z.boolean().optional(),
      },
      annotations: WRITE_IDEMPOTENT,
    },
    async ({ idCampania: idC, idSeccion, ...body }) => {
      try {
        if (body.parametros === undefined && body.activa === undefined) {
          return errorResult(new Error("Indicá parametros y/o activa."));
        }
        return jsonResult(
          await client.patch(`portal/secciones/${idSeccion}`, sinIndefinidos(body), scopeParams(client, { idCampania: idC }))
        );
      } catch (e) {
        return errorResult(e);
      }
    }
  );

  server.registerTool(
    "wibi_portal_seccion_quitar",
    {
      title: "Quitar sección del portal",
      description:
        "Borra una sección de la home y sus imágenes. No se puede deshacer: confirmá con el usuario antes. Para ocultarla sin perderla usá wibi_portal_seccion_configurar con activa=false.",
      inputSchema: {
        idCampania,
        idSeccion: z.number().int().positive(),
      },
      annotations: DESTRUCTIVE,
    },
    async ({ idCampania: idC, idSeccion }) => {
      try {
        return jsonResult(await client.delete(`portal/secciones/${idSeccion}`, scopeParams(client, { idCampania: idC })));
      } catch (e) {
        return errorResult(e);
      }
    }
  );

  server.registerTool(
    "wibi_portal_ordenar_zona",
    {
      title: "Reordenar secciones de una zona",
      description:
        "Cambia el orden de las secciones de una zona. Las secciones indicadas quedan primero y en ese orden; las demás siguen después como estaban.",
      inputSchema: {
        idCampania,
        zona,
        orden: z.array(z.number().int().positive()).min(1).describe("idSeccion en el orden deseado."),
      },
      annotations: WRITE_IDEMPOTENT,
    },
    async ({ idCampania: idC, zona: codigo, orden }) => {
      try {
        return jsonResult(
          await client.put(`portal/zonas/${encodeURIComponent(codigo)}/orden`, { orden }, scopeParams(client, { idCampania: idC }))
        );
      } catch (e) {
        return errorResult(e);
      }
    }
  );

  server.registerTool(
    "wibi_portal_bloque_ver",
    {
      title: "Ver bloque de texto del portal",
      description: "Devuelve el HTML completo de un bloque de texto (wibi_portal_ver sólo trae un resumen).",
      inputSchema: {
        idCampania,
        idBloque: z.number().int().positive(),
      },
      annotations: READONLY,
    },
    async ({ idCampania: idC, idBloque }) => {
      try {
        return jsonResult(await client.get(`portal/bloques/${idBloque}`, scopeParams(client, { idCampania: idC })));
      } catch (e) {
        return errorResult(e);
      }
    }
  );

  server.registerTool(
    "wibi_portal_bloque_texto",
    {
      title: "Crear o editar bloque de texto del portal",
      description:
        "Sin idBloque crea un bloque de texto HTML en una zona (ej. preguntas frecuentes, beneficios del programa, legales en displayFooter); con idBloque lo modifica. " +
        "El HTML se limpia en el servidor (sin scripts ni eventos; iframes sólo de YouTube, Vimeo y Google Maps). Para banners, carruseles o logos usá secciones de imágenes, no HTML. " +
        "En links internos podés usar {{PORTAL_BASE}}/tienda.php. Si la zona no muestra bloques, se agrega o activa su sección «contenido» y se avisa.",
      inputSchema: {
        idCampania,
        idBloque: z.number().int().positive().optional().describe("Para editar un bloque existente."),
        zona: zona.optional().describe("Requerida al crear."),
        titulo: z.string().max(255).optional().describe("Nombre interno del bloque (no se muestra)."),
        html: z.string().optional().describe("Requerido al crear."),
        posicion: z.number().int().min(1).optional().describe("Al crear: lugar entre los bloques de la zona (1 = primero)."),
        activo: z.boolean().optional(),
      },
      annotations: WRITE,
    },
    async ({ idCampania: idC, idBloque, ...body }) => {
      try {
        const query = scopeParams(client, { idCampania: idC });
        if (idBloque) {
          const { titulo, html, activo } = body;
          if (titulo === undefined && html === undefined && activo === undefined) {
            return errorResult(new Error("Indicá titulo, html o activo para modificar el bloque."));
          }
          return jsonResult(await client.patch(`portal/bloques/${idBloque}`, sinIndefinidos({ titulo, html, activo }), query));
        }
        if (!body.zona || !body.html) {
          return errorResult(new Error("Para crear un bloque indicá zona y html."));
        }
        return jsonResult(await client.post("portal/bloques", sinIndefinidos(body), query));
      } catch (e) {
        return errorResult(e);
      }
    }
  );

  server.registerTool(
    "wibi_portal_pagina_ver",
    {
      title: "Ver página estática del portal",
      description: "Devuelve una página estática con su HTML completo (wibi_portal_ver trae el listado en paginas, sin el HTML).",
      inputSchema: {
        idCampania,
        idPagina: z.number().int().positive(),
      },
      annotations: READONLY,
    },
    async ({ idCampania: idC, idPagina }) => {
      try {
        return jsonResult(await client.get(`portal/paginas/${idPagina}`, scopeParams(client, { idCampania: idC })));
      } catch (e) {
        return errorResult(e);
      }
    }
  );

  server.registerTool(
    "wibi_portal_pagina",
    {
      title: "Crear o editar página estática del portal",
      description:
        "Sin idPagina crea una página propia del portal (Quiénes somos, Sucursales, Envíos y retiros, Preguntas frecuentes, Términos...) en /p/{key}/pagina/{slug}; con idPagina la modifica. " +
        "El slug se arma solo con el título si no se indica. El HTML se limpia en el servidor como los bloques de texto (sin scripts ni eventos). " +
        "Cada página tiene su SEO (metaTitulo, metaDescripcion). Para que aparezca en el encabezado, agregala al menú con wibi_portal_menu (tipo pagina, slug). " +
        "Si devuelve que las páginas no están habilitadas, falta aplicar el SQL en el servidor: avisale al usuario.",
      inputSchema: {
        idCampania,
        idPagina: z.number().int().positive().optional().describe("Para editar una página existente (wibi_portal_ver → paginas)."),
        titulo: z.string().max(150).optional().describe("Requerido al crear."),
        html: z.string().optional().describe("Contenido. Requerido al crear."),
        slug: z.string().max(80).optional().describe("Dirección: minúsculas y guiones (ej. sucursales)."),
        metaTitulo: z.string().max(120).optional(),
        metaDescripcion: z.string().max(300).optional(),
        activa: z.boolean().optional(),
      },
      annotations: WRITE,
    },
    async ({ idCampania: idC, idPagina, ...body }) => {
      try {
        const query = scopeParams(client, { idCampania: idC });
        if (idPagina) {
          const cambios = sinIndefinidos(body);
          if (Object.keys(cambios).length === 0) {
            return errorResult(new Error("Indicá qué cambiar: titulo, html, slug, metaTitulo, metaDescripcion o activa."));
          }
          return jsonResult(await client.patch(`portal/paginas/${idPagina}`, cambios, query));
        }
        if (!body.titulo || !body.html) {
          return errorResult(new Error("Para crear una página indicá titulo y html."));
        }
        return jsonResult(await client.post("portal/paginas", sinIndefinidos(body), query));
      } catch (e) {
        return errorResult(e);
      }
    }
  );

  server.registerTool(
    "wibi_portal_pagina_quitar",
    {
      title: "Quitar página estática del portal",
      description: "Quita una página del borrador. Si estaba en el menú, ese ítem deja de mostrarse. Se puede volver atrás descartando el borrador.",
      inputSchema: {
        idCampania,
        idPagina: z.number().int().positive(),
      },
      annotations: DESTRUCTIVE,
    },
    async ({ idCampania: idC, idPagina }) => {
      try {
        return jsonResult(await client.delete(`portal/paginas/${idPagina}`, scopeParams(client, { idCampania: idC })));
      } catch (e) {
        return errorResult(e);
      }
    }
  );

  server.registerTool(
    "wibi_portal_imagen_agregar",
    {
      title: "Agregar imágenes a una sección del portal",
      description:
        "Agrega imágenes por URL al final de una sección de tipo imagenes. El servidor del portal descarga cada imagen y la guarda (no queda dependiendo del sitio de origen). Las que fallan vuelven en 'errores' sin frenar al resto. " +
        "DERECHOS: antes de usar imágenes de un sitio que no es del cliente (otra cadena, un competidor, un buscador), avisale al usuario y pedile confirmación explícita de que tiene derecho a usarlas (propias, del proveedor o de la marca con permiso); sólo entonces pasá derechosConfirmados=true. " +
        "Si el usuario tiene los archivos en su computadora, usá wibi_portal_link_subida. " +
        LINKS_DOC,
      inputSchema: {
        idCampania,
        idSeccion: z.number().int().positive().describe("idSeccion de una sección tipo imagenes (wibi_portal_ver)."),
        imagenes: z
          .array(
            z.object({
              urlImagen: z.string().url().describe("URL pública http(s) de la imagen (jpg, png, gif o webp, hasta 10 MB)."),
              urlImagenMobile: z.string().url().optional().describe("Versión para celular (opcional)."),
              link: z.string().max(500).optional().describe("Adónde lleva al tocarla."),
              activa: z.boolean().optional(),
            })
          )
          .min(1)
          .max(24),
        derechosConfirmados: z
          .literal(true)
          .describe("true sólo si el usuario confirmó que puede usar estas imágenes."),
      },
      annotations: WRITE,
    },
    async ({ idCampania: idC, idSeccion, imagenes }) => {
      try {
        const query = scopeParams(client, { idCampania: idC });
        const agregadas: unknown[] = [];
        const errores: unknown[] = [];
        const avisos: string[] = [];
        // De a pocas por pedido: el portal descarga cada una y el pedido tiene timeout
        for (let i = 0; i < imagenes.length; i += IMAGENES_POR_PEDIDO) {
          const lote = imagenes.slice(i, i + IMAGENES_POR_PEDIDO).map((img) => sinIndefinidos(img));
          const r = await client.post<{ agregadas?: unknown[]; errores?: unknown[]; aviso?: string }>(
            `portal/secciones/${idSeccion}/imagenes`,
            { imagenes: lote },
            query,
            { timeoutMs: TIMEOUT_IMAGENES_MS }
          );
          agregadas.push(...(r.agregadas ?? []));
          errores.push(...(r.errores ?? []));
          if (r.aviso) avisos.push(r.aviso);
        }
        return jsonResult({ idSeccion, agregadas, ...(errores.length ? { errores } : {}), ...(avisos.length ? { aviso: avisos[0] } : {}) });
      } catch (e) {
        return errorResult(e);
      }
    }
  );

  server.registerTool(
    "wibi_portal_imagen_editar",
    {
      title: "Editar imagen del portal",
      description:
        "Cambia el link de una imagen, la activa o desactiva, o la reemplaza por otra URL (urlImagen / urlImagenMobile; urlImagenMobile vacío quita la versión para celular). Al reemplazar desde otro sitio aplican las mismas reglas de derechos que en wibi_portal_imagen_agregar. " +
        LINKS_DOC,
      inputSchema: {
        idCampania,
        idImagen: z.number().int().positive().describe("idImagen de wibi_portal_ver."),
        urlImagen: z.string().url().optional(),
        urlImagenMobile: z.string().optional(),
        link: z.string().max(500).optional(),
        activa: z.boolean().optional(),
        derechosConfirmados: z.boolean().optional().describe("Requerido en true si se reemplaza la imagen."),
      },
      annotations: WRITE_IDEMPOTENT,
    },
    async ({ idCampania: idC, idImagen, derechosConfirmados, ...cambios }) => {
      try {
        const body = sinIndefinidos(cambios);
        if (Object.keys(body).length === 0) {
          return errorResult(new Error("Indicá urlImagen, urlImagenMobile, link o activa."));
        }
        if ((body.urlImagen || body.urlImagenMobile) && derechosConfirmados !== true) {
          return errorResult(new Error("Para reemplazar la imagen confirmá con el usuario que puede usarla y pasá derechosConfirmados=true."));
        }
        return jsonResult(
          await client.patch(`portal/imagenes/${idImagen}`, body, scopeParams(client, { idCampania: idC }), {
            timeoutMs: TIMEOUT_IMAGENES_MS,
          })
        );
      } catch (e) {
        return errorResult(e);
      }
    }
  );

  server.registerTool(
    "wibi_portal_imagen_quitar",
    {
      title: "Quitar imagen del portal",
      description:
        "Borra una imagen de una sección (y su archivo si nadie más lo usa). No se puede deshacer: para ocultarla usá wibi_portal_imagen_editar con activa=false.",
      inputSchema: {
        idCampania,
        idImagen: z.number().int().positive(),
      },
      annotations: DESTRUCTIVE,
    },
    async ({ idCampania: idC, idImagen }) => {
      try {
        return jsonResult(await client.delete(`portal/imagenes/${idImagen}`, scopeParams(client, { idCampania: idC })));
      } catch (e) {
        return errorResult(e);
      }
    }
  );

  server.registerTool(
    "wibi_portal_imagen_ordenar",
    {
      title: "Reordenar imágenes de una sección",
      description:
        "Cambia el orden de las imágenes de una sección. Las indicadas quedan primero y en ese orden; las demás siguen después como estaban.",
      inputSchema: {
        idCampania,
        idSeccion: z.number().int().positive(),
        orden: z.array(z.number().int().positive()).min(1).describe("idImagen en el orden deseado."),
      },
      annotations: WRITE_IDEMPOTENT,
    },
    async ({ idCampania: idC, idSeccion, orden }) => {
      try {
        return jsonResult(
          await client.put(`portal/secciones/${idSeccion}/imagenes/orden`, { orden }, scopeParams(client, { idCampania: idC }))
        );
      } catch (e) {
        return errorResult(e);
      }
    }
  );

  server.registerTool(
    "wibi_portal_imagen_identidad",
    {
      title: "Cambiar logo o favicon del portal",
      description:
        "Reemplaza el logo o el favicon (ícono de la pestaña) del portal por una imagen desde una URL. El logo también es la imagen que se ve al compartir el link del portal. " +
        "El favicon tiene que ser cuadrado (16 a 1024 px). Usá el logo del propio cliente: si viene de un sitio que no es suyo, confirmá con el usuario. Si el usuario tiene el archivo, usá wibi_portal_link_subida.",
      inputSchema: {
        idCampania,
        tipo: z.enum(["logo", "favicon"]),
        urlImagen: z.string().url(),
        derechosConfirmados: z.literal(true).describe("true sólo si el usuario confirmó que es su logo / puede usarlo."),
      },
      annotations: WRITE_IDEMPOTENT,
    },
    async ({ idCampania: idC, tipo, urlImagen }) => {
      try {
        return jsonResult(
          await client.put(`portal/identidad/${tipo}`, { urlImagen }, scopeParams(client, { idCampania: idC }), {
            timeoutMs: TIMEOUT_IMAGENES_MS,
          })
        );
      } catch (e) {
        return errorResult(e);
      }
    }
  );

  server.registerTool(
    "wibi_portal_link_subida",
    {
      title: "Link para subir imágenes al portal",
      description:
        "Genera un link temporal (15 minutos) a una página donde el usuario arrastra sus archivos: imágenes para una sección (destino seccion + idSeccion), el logo o el favicon. Los archivos quedan cargados directamente. " +
        "Pasale el link al usuario y, cuando avise que terminó, revisá el resultado con wibi_portal_ver (para ponerles links usá wibi_portal_imagen_editar).",
      inputSchema: {
        idCampania,
        destino: z.enum(["seccion", "logo", "favicon"]),
        idSeccion: z.number().int().positive().optional().describe("Requerido con destino seccion."),
      },
      annotations: WRITE,
    },
    async ({ idCampania: idC, destino, idSeccion }) => {
      try {
        if (destino === "seccion" && !idSeccion) {
          return errorResult(new Error("Con destino seccion indicá idSeccion (de una sección tipo imagenes)."));
        }
        return jsonResult(
          await client.post("portal/subidas", sinIndefinidos({ destino, idSeccion }), scopeParams(client, { idCampania: idC }))
        );
      } catch (e) {
        return errorResult(e);
      }
    }
  );

  server.registerTool(
    "wibi_portal_vista_previa",
    {
      title: "Vista previa del borrador del portal",
      description:
        "Devuelve un link (válido 24 h) que muestra el portal con los cambios sin publicar. Sólo lo ve quien abre el link; los clientes siguen viendo lo publicado. Pasáselo al usuario para que revise antes de publicar.",
      inputSchema: { idCampania },
      annotations: READONLY,
    },
    async (args) => {
      try {
        return jsonResult(await client.get("portal/borrador/vista-previa", scopeParams(client, args)));
      } catch (e) {
        return errorResult(e);
      }
    }
  );

  server.registerTool(
    "wibi_portal_publicar",
    {
      title: "Publicar cambios del portal",
      description:
        "Publica el borrador: los clientes pasan a ver los cambios. Antes mostrale al usuario la vista previa y pedile confirmación. Queda guardada una versión para volver atrás (wibi_portal_versiones / wibi_portal_restaurar). " +
        "Si alguien cambió el portal desde el CRM mientras tanto, falla con un aviso: explicáselo al usuario y sólo con su acuerdo reintentá con forzar=true (eso reemplaza esos cambios).",
      inputSchema: {
        idCampania,
        descripcion: z.string().max(255).optional().describe("Qué cambió, para identificar la versión (ej. 'Home estilo RED con ISDIN')."),
        forzar: z.boolean().optional(),
      },
      annotations: WRITE,
    },
    async ({ idCampania: idC, ...body }) => {
      try {
        return jsonResult(await client.post("portal/publicar", sinIndefinidos(body), scopeParams(client, { idCampania: idC })));
      } catch (e) {
        return errorResult(e);
      }
    }
  );

  server.registerTool(
    "wibi_portal_descartar_borrador",
    {
      title: "Descartar cambios sin publicar",
      description:
        "Borra el borrador con todos los cambios sin publicar (incluidas las imágenes cargadas sólo en el borrador). Lo publicado no cambia. No se puede deshacer: confirmá con el usuario.",
      inputSchema: { idCampania },
      annotations: DESTRUCTIVE,
    },
    async (args) => {
      try {
        return jsonResult(await client.delete("portal/borrador", scopeParams(client, args)));
      } catch (e) {
        return errorResult(e);
      }
    }
  );

  server.registerTool(
    "wibi_portal_versiones",
    {
      title: "Versiones publicadas del portal",
      description: "Lista las últimas publicaciones del portal (fecha, descripción, quién, cantidad de secciones / imágenes / bloques) para poder volver a una.",
      inputSchema: { idCampania },
      annotations: READONLY,
    },
    async (args) => {
      try {
        return jsonResult(await client.get("portal/versiones", scopeParams(client, args)));
      } catch (e) {
        return errorResult(e);
      }
    }
  );

  server.registerTool(
    "wibi_portal_restaurar",
    {
      title: "Volver a una versión del portal",
      description:
        "Vuelve el portal publicado a una versión anterior; los clientes lo ven enseguida. El estado actual queda guardado como versión, así que también se puede deshacer. Requiere que no haya borrador sin publicar. Confirmá con el usuario antes.",
      inputSchema: {
        idCampania,
        idVersion: z.number().int().positive().describe("idVersion de wibi_portal_versiones."),
      },
      annotations: { ...WRITE, destructiveHint: true },
    },
    async ({ idCampania: idC, idVersion }) => {
      try {
        return jsonResult(await client.post(`portal/versiones/${idVersion}/restaurar`, {}, scopeParams(client, { idCampania: idC })));
      } catch (e) {
        return errorResult(e);
      }
    }
  );

  server.registerTool(
    "wibi_listar_categorias_tienda",
    {
      title: "Listar categorías de la tienda",
      description:
        "Lista las categorías de la tienda online (e-commerce) con su idCategoria e imagen. Usalo para pasar de un nombre ('Dermocosmética') al idCategoria de una sección de productos o de un link tienda.php?idCategoria=.",
      inputSchema: { idCampania },
      annotations: READONLY,
    },
    async (args) => {
      try {
        return jsonResult(await client.get("catalogo/categorias", scopeParams(client, args)));
      } catch (e) {
        return errorResult(e);
      }
    }
  );
}

/** Mapa de permisos de las tools del portal (WibiPermissionService: configuracion.portalclientesconfig). */
export function portalPermissionMap(): Record<string, [string, string, string?]> {
  const p = (accion: string): [string, string, string] => ["configuracion", "portalclientesconfig", accion];
  return {
    wibi_portal_ver: p("consultar"),
    wibi_portal_bloque_ver: p("consultar"),
    wibi_portal_tema: p("modificar"),
    wibi_portal_identidad: p("modificar"),
    wibi_portal_seo: p("modificar"),
    wibi_portal_barra_superior: p("modificar"),
    wibi_portal_menu: p("modificar"),
    wibi_portal_pagina_ver: p("consultar"),
    wibi_portal_pagina: p("modificar"),
    wibi_portal_pagina_quitar: p("eliminar"),
    wibi_portal_seccion_agregar: p("insertar"),
    wibi_portal_seccion_configurar: p("modificar"),
    wibi_portal_seccion_quitar: p("eliminar"),
    wibi_portal_ordenar_zona: p("modificar"),
    wibi_portal_bloque_texto: p("modificar"),
    wibi_portal_imagen_agregar: p("insertar"),
    wibi_portal_imagen_editar: p("modificar"),
    wibi_portal_imagen_quitar: p("eliminar"),
    wibi_portal_imagen_ordenar: p("modificar"),
    wibi_portal_imagen_identidad: p("modificar"),
    wibi_portal_link_subida: p("insertar"),
    wibi_portal_vista_previa: p("consultar"),
    wibi_portal_publicar: p("modificar"),
    wibi_portal_descartar_borrador: p("modificar"),
    wibi_portal_versiones: p("consultar"),
    wibi_portal_restaurar: p("modificar"),
  };
}

function sinIndefinidos<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;
}
