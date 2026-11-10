import assert from "node:assert/strict";
import test from "node:test";
import { formatFailures, nextBackoff, nextPhase } from "./chainstate.js";

test("a failed poll with a previous read is stale, and without one is offline", () => {
  assert.equal(nextPhase(true, true), "live");
  assert.equal(nextPhase(false, true), "stale");
  assert.equal(nextPhase(false, false), "offline");
});

test("backoff stays inside 20s to 60s", () => {
  assert.equal(nextBackoff(1), 20000);
  assert.equal(nextBackoff(2), 40000);
  assert.equal(nextBackoff(3), 60000);
  assert.equal(nextBackoff(8), 60000);
});

test("a refusal names the host instead of a bare Access forbidden", () => {
  const text = formatFailures([
    { host: "api.mainnet-beta.solana.com", message: "Access forbidden" },
    { host: "public.rpc.solanavibestation.com", message: "HTTP 429 from vibestation" },
  ]);
  assert.equal(text.includes("api.mainnet-beta.solana.com: Access forbidden"), true);
  assert.equal(text.includes("public.rpc.solanavibestation.com: HTTP 429 from vibestation"), true);
  assert.equal(text === "Access forbidden", false);
});
