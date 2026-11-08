import assert from "node:assert/strict";
import test from "node:test";
import { fmtPriceUsd, portfolioMark } from "./marks.js";

test("P/L adds token market value to cash before subtracting the 1.106 SOL stake", () => {
  const cashSol = 1.090457818;
  const tokenSol = 0.133816;
  const mark = portfolioMark({
    cashSol,
    tokenSol,
    stakeSol: 1.106,
    solUsd: 86.63,
    tokensPriced: true,
  });
  assert.equal(mark.portfolioSol, cashSol + tokenSol);
  assert.equal(mark.pnlSol, cashSol + tokenSol - 1.106);
  assert.notEqual(mark.pnlSol, cashSol - 1.106);
  assert.equal(mark.pnlUsd, mark.pnlSol * 86.63);
});

test("an unpriced token leaves P/L blank instead of using cash alone", () => {
  const mark = portfolioMark({
    cashSol: 1.090457818,
    tokenSol: null,
    stakeSol: 1.106,
    solUsd: 86.63,
    tokensPriced: false,
  });
  assert.equal(mark.pnlSol, null);
  assert.equal(mark.pnlUsd, null);
  assert.equal(mark.portfolioSol, null);
});

test("a sub-cent token price is not rounded to $0.00", () => {
  const text = fmtPriceUsd(0.002746);
  assert.equal(text.includes("0.002746"), true);
  assert.equal(text === "$0.00", false);
});
