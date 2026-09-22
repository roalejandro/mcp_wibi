import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveMcpSessionAction } from "./mcpSession.js";

describe("resolveMcpSessionAction", () => {
  it("usa el transport en RAM si existe", () => {
    assert.equal(
      resolveMcpSessionAction({ hasBoundTransport: true, isInitialize: false }),
      "handle_existing"
    );
    assert.equal(
      resolveMcpSessionAction({ hasBoundTransport: true, isInitialize: true }),
      "handle_existing"
    );
  });

  it("acepta initialize con session-id stale (sin transport en RAM)", () => {
    assert.equal(
      resolveMcpSessionAction({ hasBoundTransport: false, isInitialize: true }),
      "initialize_new"
    );
  });

  it("marca not_found si no hay transport ni initialize", () => {
    assert.equal(
      resolveMcpSessionAction({ hasBoundTransport: false, isInitialize: false }),
      "not_found"
    );
  });
});
