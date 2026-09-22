import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Response } from "express";
import { INVALID_TOKEN_BODY, installInvalidTokenOverride } from "./invalidTokenResponse.js";

function fakeResponse() {
  return {
    headersSent: false,
    status: 200,
    headers: {} as Record<string, unknown>,
    body: "",
    setHeader(name: string, value: string) {
      this.headers[name] = value;
    },
    removeHeader(name: string) {
      delete this.headers[name];
    },
    writeHead(status: number, headers?: Record<string, unknown>) {
      this.status = status;
      this.headersSent = true;
      if (headers) Object.assign(this.headers, headers);
      return this;
    },
    write(chunk: string) {
      this.body += String(chunk);
      return true;
    },
    end(chunk?: string) {
      if (typeof chunk === "string") this.body += chunk;
      return this;
    },
  };
}

describe("installInvalidTokenOverride", () => {
  it("responde 401 invalid_token cuando la sesión WIBI murió", () => {
    const res = fakeResponse();
    const signal = { expired: false };
    installInvalidTokenOverride(res as unknown as Response, signal);
    signal.expired = true;

    res.writeHead(200, { "Content-Type": "application/json", "Content-Length": "4" });
    res.end('{"jsonrpc":"2.0"}');

    assert.equal(res.status, 401);
    assert.equal(res.body, INVALID_TOKEN_BODY);
    assert.equal(res.headers["WWW-Authenticate"], 'Bearer error="invalid_token"');
    assert.equal(res.headers["Content-Length"], undefined);
  });

  it("no toca una respuesta sana", () => {
    const res = fakeResponse();
    installInvalidTokenOverride(res as unknown as Response, { expired: false });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end('{"ok":true}');
    assert.equal(res.status, 200);
    assert.equal(res.body, '{"ok":true}');
  });
});