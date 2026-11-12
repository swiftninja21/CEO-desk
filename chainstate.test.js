import assert from "node:assert/strict";
import test from "node:test";
import { etDateKey, formatFailures, nextBackoff, nextPhase, resolveDayBaseline, todayChange } from "./chainstate.js";

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

test("Nov 11 keeps the 0.812 SOL midnight seed", () => {
  const first = resolveDayBaseline("2026-11-11", {}, 0.7203);
  assert.equal(first.sol, 0.812);
  assert.equal(first.wrote, true);
  const again = resolveDayBaseline("2026-11-11", first.stored, 0.5);
  assert.equal(again.sol, 0.812);
  assert.equal(again.wrote, false);
});

test("a new ET date stores the first portfolio and then leaves it", () => {
  const first = resolveDayBaseline("2026-11-12", {}, 0.7);
  assert.equal(first.sol, 0.7);
  const again = resolveDayBaseline("2026-11-12", first.stored, 0.4);
  assert.equal(again.sol, 0.7);
  assert.equal(again.wrote, false);
});

test("today is the portfolio change since the midnight baseline", () => {
  const price = 7.63 / 0.0917;
  const today = todayChange(0.7203, 0.812, price);
  assert.ok(Math.abs(today.sol - (0.7203 - 0.812)) < 1e-12);
  assert.ok(Math.abs(today.usd - -7.63) < 0.02);
  assert.deepEqual(todayChange(null, 0.812, price), { sol: null, usd: null });
});

test("ET date rolls at midnight New York", () => {
  assert.equal(etDateKey(new Date("2026-11-12T04:59:00Z")), "2026-11-11");
  assert.equal(etDateKey(new Date("2026-11-12T05:00:00Z")), "2026-11-12");
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
