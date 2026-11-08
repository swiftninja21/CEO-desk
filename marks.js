// Portfolio mark and small-price formatting. No DOM, no network.

export function portfolioMark({ cashSol, tokenSol, stakeSol, solUsd, tokensPriced }) {
  if (cashSol == null || !Number.isFinite(cashSol) || !tokensPriced || tokenSol == null || !Number.isFinite(tokenSol)) {
    return { portfolioSol: null, pnlSol: null, portfolioUsd: null, pnlUsd: null };
  }
  const portfolioSol = cashSol + tokenSol;
  const pnlSol = portfolioSol - stakeSol;
  const priceOk = typeof solUsd === "number" && Number.isFinite(solUsd) && solUsd > 0;
  return {
    portfolioSol,
    pnlSol,
    portfolioUsd: priceOk ? portfolioSol * solUsd : null,
    pnlUsd: priceOk ? pnlSol * solUsd : null,
  };
}

export function fmtPriceUsd(n) {
  if (n == null || !Number.isFinite(n)) return "—";
  const sign = n < 0 ? "−$" : "$";
  const abs = Math.abs(n);
  if (abs === 0) return "$0.00";
  if (abs >= 0.01) {
    return sign + abs.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 });
  }
  const digits = Math.min(10, Math.ceil(-Math.log10(abs)) + 3);
  return sign + abs.toFixed(digits);
}
