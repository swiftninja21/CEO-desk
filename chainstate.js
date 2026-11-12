// Decides what the desk may claim after a public RPC poll. No DOM and no network.

export const HEALTHY_MS = 20000;
export const BACKOFF_CAP_MS = 60000;

export function nextPhase(liveOk, hasRead) {
  if (liveOk) return "live";
  return hasRead ? "stale" : "offline";
}

export function nextBackoff(failureCount) {
  const n = Number.isFinite(failureCount) && failureCount > 0 ? Math.floor(failureCount) : 1;
  return Math.min(BACKOFF_CAP_MS, HEALTHY_MS * 2 ** (n - 1));
}

export const SEEDED_DAY_BASELINES = {
  "2026-11-11": 0.812,
};

export function etDateKey(date) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const bag = {};
  for (const part of fmt.formatToParts(date)) bag[part.type] = part.value;
  return bag.year + "-" + bag.month + "-" + bag.day;
}

export function resolveDayBaseline(key, stored, portfolioSol) {
  const book = stored && typeof stored === "object" ? { ...stored } : {};
  if (Number.isFinite(book[key])) return { sol: book[key], stored: book, wrote: false };
  if (Number.isFinite(SEEDED_DAY_BASELINES[key])) {
    book[key] = SEEDED_DAY_BASELINES[key];
    return { sol: book[key], stored: book, wrote: true };
  }
  if (portfolioSol != null && Number.isFinite(portfolioSol)) {
    book[key] = portfolioSol;
    return { sol: portfolioSol, stored: book, wrote: true };
  }
  return { sol: null, stored: book, wrote: false };
}

export function todayChange(portfolioSol, baselineSol, solUsd) {
  if (portfolioSol == null || !Number.isFinite(portfolioSol) || baselineSol == null || !Number.isFinite(baselineSol)) {
    return { sol: null, usd: null };
  }
  const sol = portfolioSol - baselineSol;
  const priceOk = typeof solUsd === "number" && Number.isFinite(solUsd) && solUsd > 0;
  return { sol, usd: priceOk ? sol * solUsd : null };
}

export function isTransportError(err) {
  const message = String((err && err.message) || err || "").toLowerCase();
  const status = err && err.status;
  return status === 0 || status == null || /load failed|failed to fetch|network|timed out|abort|typeerror/.test(message);
}

export function formatFailures(failures) {
  const seen = new Set();
  const parts = [];
  for (const failure of failures || []) {
    const host = failure && failure.host ? failure.host : "RPC";
    const message = failure && failure.message ? failure.message : "request failed";
    const line = host + ": " + message;
    if (seen.has(line)) continue;
    seen.add(line);
    parts.push(line);
  }
  return parts.length ? parts.join(" · ") : "No public Solana RPC responded.";
}
