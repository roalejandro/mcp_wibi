import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { WibiAuthService, refreshRequestId } from "./wibiAuth.js";

const realFetch = globalThis.fetch;

type Llamada = { body: Record<string, unknown> };

function mockFetch(respuestas: Array<() => Response | Promise<Response>>, llamadas: Llamada[]): void {
  let i = 0;
  globalThis.fetch = (async (_url: unknown, init?: { body?: string }) => {
    llamadas.push({ body: JSON.parse(String(init?.body ?? "{}")) });
    const r = respuestas[Math.min(i, respuestas.length - 1)];
    i++;
    return r();
  }) as typeof fetch;
}

function ok(): Response {
  return new Response(
    JSON.stringify({ success: true, data: { access_token: "jwt-2", refresh_token: "ref-2", expires_in: 600 } }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

const svc = () => new WibiAuthService({ baseUrl: "https://wibi.test", apiKey: "k", timeoutMs: 1000 });

describe("WibiAuthService.refresh", () => {
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it("request_id es un UUID v4 estable por refresh token", () => {
    const a = refreshRequestId("ref-1");
    assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    assert.equal(a, refreshRequestId("ref-1"));
    assert.notEqual(a, refreshRequestId("ref-2"));
  });

  it("reintenta un error de red con el mismo request_id", async () => {
    const llamadas: Llamada[] = [];
    mockFetch([() => { throw new TypeError("fetch failed"); }, ok], llamadas);
    const res = await svc().refresh("ref-1", [0, 0]);
    assert.notEqual(res.kind, "error");
    assert.equal(llamadas.length, 2);
    assert.equal(llamadas[0].body.request_id, refreshRequestId("ref-1"));
    assert.equal(llamadas[1].body.request_id, llamadas[0].body.request_id);
  });

  it("no reintenta un refresh rechazado (401)", async () => {
    const llamadas: Llamada[] = [];
    mockFetch(
      [() => new Response(JSON.stringify({ success: false, error: "Refresh token inválido o expirado" }), { status: 401 })],
      llamadas
    );
    const res = await svc().refresh("ref-1", [0, 0]);
    assert.equal(res.kind, "error");
    assert.equal(llamadas.length, 1);
  });

  it("si la API no tiene store durable, cae al refresh sin request_id", async () => {
    const llamadas: Llamada[] = [];
    mockFetch(
      [
        () => new Response(JSON.stringify({ success: false, error: "MCP_REFRESH_CACHE_DRIVER debe ser redis en producción." }), { status: 503 }),
        ok,
      ],
      llamadas
    );
    const res = await svc().refresh("ref-1", [0, 0]);
    assert.notEqual(res.kind, "error");
    assert.equal(llamadas.length, 2);
    assert.equal(llamadas[1].body.request_id, undefined);
  });
});
