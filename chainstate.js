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
