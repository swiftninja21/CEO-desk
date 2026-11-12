import { botAvatar } from "./bots.js?v=20261112c";
import { mountCity } from "./city.js?v=20261112c";
import {
  etDateKey,
  formatFailures,
  HEALTHY_MS,
  isTransportError,
  nextBackoff,
  nextPhase,
  resolveDayBaseline,
  todayChange,
} from "./chainstate.js?v=20261112c";
import { fmtPriceUsd, portfolioMark } from "./marks.js?v=20261112c";
import {
  AGENTS,
  STAKE_AT,
  STAKE_SOL,
  STAKE_USD,
  botPhase,
  formatCountdown,
  formatElapsed,
  formatEt,
} from "./schedule.js?v=20261112c";

const WALLET = "7MDqGWcdgesJHxWs2a1YSaKobcqWe7yU5kjz4XNBKPMa";
const WALLET_NAME = "W1";
const TARGET = "8pYLN2Zm9ECVRXHRcU7a4tYpSPMaJME3Qt7JKa9LirEG";
const TARGET_NAME = "8P";
const BUY_SOL = 0.05;
const TARGET_SIG_LIMIT = 20;
const KILLUA_ERA = new Set([
  "85gJ7HucRUpPjLZP9KVWEKyB85uBxtwMfqzm9ufNpump",
  "F9z9AApXAF7Z2mXxXegg9BmkuRLfgrYR5WHpdDJMpump",
  "36CNzFyiMSMGM7ZG97YgBedZHF99Kcf5b5PKZq8fLoat",
  "Bv1a7cEj5aRnJQhMw4kRQqAFesMSd5LwcDnUzq52BMmr",
  "FZxHLUGiGchY5uvvoeqh1EKiXTrGdN67WUBhUc1fLoat",
]);
const SPL = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN_2022 = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
const WSOL = "So11111111111111111111111111111111111111112";
const PUSSY_MINT = "FZxHLUGiGchY5uvvoeqh1EKiXTrGdN67WUBhUc1fLoat";
const PUSSY_PAIR = "HcyYBrZVFDDVBLtLxL5C1HDJND1p86BoNA6m7MjBKE3p";
const PINNED_PAIRS = new Map([[PUSSY_MINT, PUSSY_PAIR]]);
const RECORDED_FILLS = new Map([
  [
    PUSSY_MINT,
    [
      "Killua-era · Bought 9,654.832242 for 0.1 SOL · Nov 8, 2026 · 3:41:27 PM ET",
      "Killua-era · Sold half for 0.093487197 SOL net · Nov 8, 2026 · 4:00:12 PM ET",
    ],
  ],
]);

// Full reads need getTokenAccountsByOwner by program id.
// Vibestation is first. A Safari "Load failed" or HTTP 429 rotates to publicnode,
// then api.mainnet-beta.solana.com. Pocket is balance-only: it rejects a
// program-wide token scan. publicnode may 403 that method without a personal
// token; the balance call is still used, and the last full book stays on screen.
const FULL_ENDPOINTS = [
  { id: "vibestation", url: "https://public.rpc.solanavibestation.com" },
  { id: "publicnode", url: "https://solana-rpc.publicnode.com" },
  { id: "mainnet-beta", url: "https://api.mainnet-beta.solana.com" },
];
const BALANCE_ENDPOINTS = [
  { id: "publicnode", url: "https://solana-rpc.publicnode.com" },
  { id: "pocket", url: "https://solana.api.pocket.network" },
];
const ENDPOINTS = FULL_ENDPOINTS.concat(BALANCE_ENDPOINTS);
const GAP_MS = 500;
const SPARK_KEY = "ceo-desk.spark.v2";
const CHAIN_KEY = "ceo-desk.chain.v1";
const DAY_KEY = "ceo-desk.day.v1";
const BASE58 = /^[1-9A-HJ-NP-Za-km-z]+$/;

const $ = (id) => document.getElementById(id);

const state = {
  phase: "loading",
  endpoint: null,
  endpointNote: "",
  failures: [],
  failCount: 0,
  backoffMs: HEALTHY_MS,
  nextPollAt: 0,
  balanceAt: null,
  tokensAt: null,
  polling: false,
  updatedAt: null,
  balanceLamports: null,
  walletSigs: null,
  targetSigs: null,
  spl: null,
  t22: null,
  chainErrors: [],
  priceUsd: null,
  priceSource: null,
  priceError: "",
  markets: new Map(),
  marketError: "",
  spark: loadSpark(),
  seenSigs: null,
  freshSigUntil: 0,
  balanceChanges: [],
  tradeEvents: [],
  trojanUntil: 0,
  trojanKind: null,
  trojanSolText: "",
};

function loadSpark() {
  try {
    const raw = localStorage.getItem(SPARK_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (p) =>
        p &&
        Number.isFinite(p.t) &&
        p.t >= STAKE_AT.getTime() &&
        Number.isFinite(p.sol)
    );
  } catch {
    return [];
  }
}

function saveSpark() {
  try {
    localStorage.setItem(SPARK_KEY, JSON.stringify(state.spark));
  } catch {
    /* private mode or quota — the chart still draws this session */
  }
}

function rememberSpark(sol, usd) {
  const point = { t: Date.now(), sol };
  if (usd != null && Number.isFinite(usd)) point.usd = usd;
  const last = state.spark[state.spark.length - 1];
  if (last && point.t - last.t < 4000 && last.sol === sol && last.usd === point.usd) return;
  state.spark.push(point);
  while (state.spark.length > 900) {
    const cut = Math.floor(state.spark.length / 2);
    const older = state.spark.slice(0, cut).filter((_, i) => i % 2 === 0);
    state.spark = older.concat(state.spark.slice(cut));
  }
  saveSpark();
}

function solFromLamports(lamports) {
  return lamports / 1e9;
}

function fmtSol(n, digits = 6) {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toFixed(digits);
}

function fmtUsd(n) {
  if (n == null || !Number.isFinite(n)) return "—";
  const abs = Math.abs(n).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return (n < 0 ? "−$" : "$") + abs;
}

function fmtPnlUsd(n) {
  if (n == null || !Number.isFinite(n)) return "—";
  if (n > 0) return "+$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (n < 0) return "−$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return "$0.00";
}

function fmtPnlSol(n) {
  if (n == null || !Number.isFinite(n)) return "—";
  if (n > 0) return "+" + n.toFixed(6) + " SOL";
  if (n < 0) return "−" + Math.abs(n).toFixed(6) + " SOL";
  return "0.000000 SOL";
}

function fmtAgo(ms) {
  if (ms == null || !Number.isFinite(ms)) return "";
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 5) return "just now";
  if (s < 60) return s + "s ago";
  const m = Math.floor(s / 60);
  if (m < 60) return m + "m ago";
  const h = Math.floor(m / 60);
  if (h < 48) return h + "h " + String(m % 60).padStart(2, "0") + "m ago";
  const d = Math.floor(h / 24);
  return d + "d " + (h % 24) + "h ago";
}

function shortKey(value, head = 4, tail = 4) {
  if (!value) return "";
  if (value.length <= head + tail + 1) return value;
  return value.slice(0, head) + "…" + value.slice(-tail);
}

function isBase58(value) {
  return typeof value === "string" && BASE58.test(value);
}

function safeHttps(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" ? parsed.href : "";
  } catch {
    return "";
  }
}

function solscanTx(sig) {
  return isBase58(sig) ? "https://solscan.io/tx/" + sig : "";
}

function solscanAccount(addr) {
  return isBase58(addr) ? "https://solscan.io/account/" + addr : "";
}

function solscanToken(mint) {
  return isBase58(mint) ? "https://solscan.io/token/" + mint : "";
}

function setText(id, text) {
  const node = $(id);
  if (node && node.textContent !== text) node.textContent = text;
}

function paintNumber(id, text, direction) {
  const node = $(id);
  if (!node || node.textContent === text) return;
  node.textContent = text;
  node.classList.remove("up", "down", "tick");
  void node.offsetWidth;
  node.classList.add(direction > 0 ? "up" : direction < 0 ? "down" : "tick");
}

function toneClass(n) {
  if (n == null || !Number.isFinite(n) || n === 0) return "flat";
  return n > 0 ? "pos" : "neg";
}

class RpcError extends Error {
  constructor(message, extra = {}) {
    super(message);
    this.status = extra.status ?? 0;
    this.code = extra.code;
    this.retryAfterMs = extra.retryAfterMs ?? null;
  }
}

function retryAfterMs(res) {
  const header = res.headers.get("retry-after");
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const when = Date.parse(header);
  if (Number.isFinite(when)) return Math.max(0, when - Date.now());
  return null;
}

async function rpcPost(endpoint, body, timeoutMs = 12000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(endpoint.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: ctrl.signal,
    });
    const wait = retryAfterMs(res);
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    if (res.status === 403 || res.status === 429 || res.status === 1010 || !res.ok) {
      const rpcMsg = json?.error?.message;
      throw new RpcError(rpcMsg || `HTTP ${res.status} from ${endpoint.id}`, {
        status: res.status,
        code: json?.error?.code,
        retryAfterMs: wait,
      });
    }
    if (!Array.isArray(body) && json?.error) {
      const code = json.error.code;
      const message = json.error.message || "RPC error";
      const limited = code === 429 || code === -32029 || /rate|too many|blocked|forbidden|access/i.test(message);
      throw new RpcError(message, {
        status: limited ? 429 : 200,
        code,
        retryAfterMs: wait,
      });
    }
    return json;
  } catch (err) {
    if (err instanceof RpcError) throw err;
    if (err?.name === "AbortError") {
      throw new RpcError(`Timed out talking to ${endpoint.id}`, { status: 0 });
    }
    throw new RpcError(err?.message || "Network error", { status: 0 });
  } finally {
    clearTimeout(timer);
  }
}

async function rpcCall(endpoint, method, params) {
  const json = await rpcPost(endpoint, {
    jsonrpc: "2.0",
    id: 1,
    method,
    params,
  });
  return json?.result;
}

async function getSignatures(endpoint) {
  const body = [
    {
      jsonrpc: "2.0",
      id: "w",
      method: "getSignaturesForAddress",
      params: [WALLET, { limit: 12, commitment: "confirmed" }],
    },
    {
      jsonrpc: "2.0",
      id: "t",
      method: "getSignaturesForAddress",
      params: [TARGET, { limit: TARGET_SIG_LIMIT, commitment: "confirmed" }],
    },
  ];
  try {
    const json = await rpcPost(endpoint, body);
    if (!Array.isArray(json)) throw new RpcError("Signature batch was not an array", { status: 400 });
    if (json.error) throw new RpcError(json.error.message || "Signature batch failed", { status: 400, code: json.error.code });
    const byId = new Map(json.map((item) => [item.id, item]));
    for (const id of ["w", "t"]) {
      const item = byId.get(id);
      if (!item) throw new RpcError("Signature batch missing " + id, { status: 400 });
      if (item.error) {
        throw new RpcError(item.error.message || "Signature request failed", {
          status: /block|rate|forbidden/i.test(item.error.message || "") ? 429 : 200,
          code: item.error.code,
        });
      }
    }
    return { wallet: byId.get("w").result, target: byId.get("t").result };
  } catch (err) {
    if (err instanceof RpcError && (err.status === 403 || err.status === 429 || err.status === 0)) throw err;
    const wallet = await rpcCall(endpoint, "getSignaturesForAddress", [WALLET, { limit: 12, commitment: "confirmed" }]);
    const target = await rpcCall(endpoint, "getSignaturesForAddress", [TARGET, { limit: TARGET_SIG_LIMIT, commitment: "confirmed" }]);
    return { wallet, target };
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function failureRecord(endpoint, err) {
  return {
    id: endpoint.id,
    host: endpoint.url.replace(/^https:\/\//, ""),
    message: err?.message || "request failed",
  };
}

async function readLamports(endpoint) {
  const balance = await rpcCall(endpoint, "getBalance", [WALLET, { commitment: "confirmed" }]);
  const lamports = balance?.value;
  if (!Number.isSafeInteger(lamports)) {
    throw new RpcError("Balance response was not a lamport count", { status: 200 });
  }
  return lamports;
}

async function readTokenProgram(endpoint, programId) {
  const result = await rpcCall(endpoint, "getTokenAccountsByOwner", [
    WALLET,
    { programId },
    { encoding: "jsonParsed", commitment: "confirmed" },
  ]);
  if (!Array.isArray(result?.value)) {
    throw new RpcError("Token accounts response was not a list", { status: 200 });
  }
  return result.value;
}

async function onceAfterPause(fn) {
  try {
    return await fn();
  } catch (err) {
    if (err?.status !== 429) throw err;
    await sleep(1500);
    return await fn();
  }
}

async function tryFull(endpoint, errors) {
  let lamports;
  try {
    lamports = await onceAfterPause(() => readLamports(endpoint));
  } catch (err) {
    errors.push(failureRecord(endpoint, err));
    return null;
  }
  await sleep(GAP_MS);
  let walletSigs = null;
  let targetSigs = null;
  try {
    const sigs = await onceAfterPause(() => getSignatures(endpoint));
    walletSigs = Array.isArray(sigs.wallet) ? sigs.wallet : [];
    targetSigs = Array.isArray(sigs.target) ? sigs.target : [];
  } catch (err) {
    errors.push(failureRecord(endpoint, err));
    if (isTransportError(err)) return { endpoint, lamports, full: false };
  }
  try {
    await sleep(GAP_MS);
    const spl = await onceAfterPause(() => readTokenProgram(endpoint, SPL));
    await sleep(GAP_MS);
    const t22 = await onceAfterPause(() => readTokenProgram(endpoint, TOKEN_2022));
    return { endpoint, lamports, spl, t22, walletSigs, targetSigs, errors: [], full: true };
  } catch (err) {
    errors.push(failureRecord(endpoint, err));
    return { endpoint, lamports, full: false };
  }
}

async function loadChain() {
  const errors = [];
  let fallback = null;
  const saw = new Set();
  for (const endpoint of FULL_ENDPOINTS) {
    saw.add(endpoint.id);
    let got = null;
    try {
      got = await tryFull(endpoint, errors);
    } catch (err) {
      errors.push(failureRecord(endpoint, err));
    }
    if (got?.full) return { full: got, lamports: got.lamports, errors };
    if (got && Number.isSafeInteger(got.lamports)) fallback = got.lamports;
  }
  for (const endpoint of BALANCE_ENDPOINTS) {
    if (saw.has(endpoint.id) && Number.isSafeInteger(fallback)) continue;
    try {
      const lamports = await readLamports(endpoint);
      if (Number.isSafeInteger(lamports)) {
        fallback = lamports;
        break;
      }
    } catch (err) {
      errors.push(failureRecord(endpoint, err));
    }
  }
  return { full: null, lamports: fallback, errors };
}

function loadChainSnapshot() {
  try {
    const raw = localStorage.getItem(CHAIN_KEY);
    if (!raw || raw.length > 200000) return null;
    const data = JSON.parse(raw);
    if (!data || !Number.isSafeInteger(data.lamports) || !Number.isFinite(data.balanceAt)) return null;
    if (data.spl != null && !Array.isArray(data.spl)) return null;
    if (data.t22 != null && !Array.isArray(data.t22)) return null;
    return data;
  } catch {
    return null;
  }
}

function saveChainSnapshot() {
  if (!Number.isSafeInteger(state.balanceLamports) || !Number.isFinite(state.balanceAt)) return;
  if (state.tokensAt != null && state.balanceAt !== state.tokensAt) return;
  try {
    localStorage.setItem(CHAIN_KEY, JSON.stringify({
      balanceAt: state.balanceAt,
      tokensAt: state.tokensAt,
      endpointId: state.endpoint?.id || "",
      lamports: state.balanceLamports,
      spl: state.spl,
      t22: state.t22,
      walletSigs: state.walletSigs,
      targetSigs: state.targetSigs,
    }));
  } catch {
    /* private mode or quota — this session still shows the read */
  }
}

function adoptSnapshot(data) {
  state.balanceLamports = data.lamports;
  state.balanceAt = data.balanceAt;
  state.tokensAt = Number.isFinite(data.tokensAt) ? data.tokensAt : null;
  state.spl = Array.isArray(data.spl) ? data.spl : null;
  state.t22 = Array.isArray(data.t22) ? data.t22 : null;
  state.walletSigs = Array.isArray(data.walletSigs) ? data.walletSigs : null;
  state.targetSigs = Array.isArray(data.targetSigs) ? data.targetSigs : null;
  state.updatedAt = data.balanceAt;
  state.endpoint = ENDPOINTS.find((item) => item.id === data.endpointId) || null;
  state.phase = "stale";
}

function applyBalanceOnly(lamports) {
  state.balanceLamports = lamports;
  state.balanceAt = Date.now();
  saveChainSnapshot();
}

function loadDayBaselines() {
  try {
    const raw = localStorage.getItem(DAY_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== "object") return {};
    const out = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(key) && Number.isFinite(value)) out[key] = value;
    }
    return out;
  } catch {
    return {};
  }
}

function saveDayBaselines(stored) {
  try {
    localStorage.setItem(DAY_KEY, JSON.stringify(stored));
  } catch {
    /* the in-memory baseline still covers this session */
  }
}

function currentToday(book) {
  const key = etDateKey(new Date());
  const result = resolveDayBaseline(key, loadDayBaselines(), book.portfolioSol);
  if (result.wrote) saveDayBaselines(result.stored);
  return todayChange(book.portfolioSol, result.sol, state.priceUsd);
}

function isKilluaEra(row, market) {
  if (KILLUA_ERA.has(row.mint)) return true;
  const blob = ((market?.symbol || "") + " " + (market?.name || "")).toLowerCase();
  return /\bvibeshift\b|\bkfc\b|\bdust\b/.test(blob);
}

function marketFromPair(pair, mint) {
  if (!pair || (pair.chainId && pair.chainId !== "solana")) return null;
  if (pair.baseToken?.address !== mint) return null;
  const price = Number(pair.priceUsd);
  const priceNative = Number(pair.priceNative);
  const quote = pair.quoteToken?.address || "";
  const quoteSymbol = pair.quoteToken?.symbol || "";
  const solQuote = quote === WSOL || quoteSymbol === "SOL";
  const usdOk = Number.isFinite(price);
  const solOk = solQuote && Number.isFinite(priceNative);
  if (!usdOk && !solOk) return null;
  const liq = Number(pair.liquidity?.usd ?? 0);
  return {
    price: usdOk ? price : null,
    priceNative: solOk ? priceNative : null,
    solQuote,
    liq: Number.isFinite(liq) ? liq : 0,
    symbol: pair.baseToken.symbol || "",
    name: pair.baseToken.name || "",
    url: safeHttps(pair.url),
    pair: pair.pairAddress || "",
  };
}

function bestMarket(pairs, mint) {
  let best = null;
  for (const pair of pairs || []) {
    const market = marketFromPair(pair, mint);
    if (!market) continue;
    const rank = (market.solQuote ? 1e15 : 0) + market.liq;
    if (!best || rank > best.rank) best = { ...market, rank };
  }
  return best;
}

async function fetchJson(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(url, { cache: "no-store", signal: ctrl.signal });
    if (res.status === 429) {
      const err = new RpcError("HTTP 429", { status: 429, retryAfterMs: retryAfterMs(res) });
      throw err;
    }
    if (!res.ok) throw new RpcError("HTTP " + res.status, { status: res.status });
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchSolPrice() {
  const errors = [];
  try {
    const json = await fetchJson("https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd");
    const usd = json?.solana?.usd;
    if (typeof usd !== "number" || !Number.isFinite(usd)) throw new Error("missing usd");
    return { usd, source: "CoinGecko", error: "" };
  } catch (err) {
    errors.push("CoinGecko: " + (err.message || "failed"));
  }
  try {
    const json = await fetchJson("https://api.dexscreener.com/latest/dex/tokens/" + WSOL);
    const market = bestMarket(json?.pairs, WSOL);
    if (!market) throw new Error("no SOL pair");
    return { usd: market.price, source: "DexScreener", error: "" };
  } catch (err) {
    errors.push("DexScreener: " + (err.message || "failed"));
  }
  try {
    const json = await fetchJson("https://api.coinbase.com/v2/prices/SOL-USD/spot");
    const usd = Number(json?.data?.amount);
    if (!Number.isFinite(usd)) throw new Error("missing amount");
    return { usd, source: "Coinbase", error: "" };
  } catch (err) {
    errors.push("Coinbase: " + (err.message || "failed"));
  }
  return { usd: null, source: null, error: errors.join(" · ") };
}

async function fetchPinnedMarket(mint, pairAddress) {
  const json = await fetchJson("https://api.dexscreener.com/latest/dex/pairs/solana/" + pairAddress);
  const pair = json?.pair || (Array.isArray(json?.pairs) ? json.pairs[0] : null);
  const market = marketFromPair(pair, mint);
  if (!market) throw new Error("no price");
  return market;
}

async function fetchMarkets(mints) {
  if (!mints.length) return { markets: new Map(), error: "" };
  const markets = new Map();
  const errors = [];
  await Promise.all(
    mints.map(async (mint) => {
      const pinned = PINNED_PAIRS.get(mint);
      if (!pinned) return;
      try {
        markets.set(mint, await fetchPinnedMarket(mint, pinned));
      } catch (err) {
        errors.push(shortKey(mint, 4, 4) + " pair: " + (err.message || "failed"));
      }
    })
  );
  const rest = mints.filter((mint) => !markets.has(mint));
  if (rest.length) {
    try {
      const json = await fetchJson(
        "https://api.dexscreener.com/latest/dex/tokens/" + rest.slice(0, 30).join(",")
      );
      for (const mint of rest) {
        const found = bestMarket(json?.pairs, mint);
        if (found) markets.set(mint, found);
      }
    } catch (err) {
      errors.push("DexScreener: " + (err.message || "failed"));
    }
  }
  return { markets, error: errors.join(" · ") };
}

function readTokenAccount(row, program) {
  const info = row?.account?.data?.parsed?.info;
  const amount = info?.tokenAmount;
  if (!info?.mint || !amount) return null;
  const display = amount.uiAmountString;
  const n = display != null && display !== "" ? Number(display) : Number(amount.uiAmount);
  if (!Number.isFinite(n) || n === 0) return null;
  return {
    mint: info.mint,
    amount: n,
    amountText: display || String(n),
    decimals: amount.decimals,
    program,
    pubkey: row.pubkey || "",
  };
}

function positionsFromState() {
  if (state.spl == null && state.t22 == null) return { known: false, rows: [] };
  const rows = [];
  for (const row of state.spl || []) {
    const parsed = readTokenAccount(row, "SPL");
    if (parsed) rows.push(parsed);
  }
  for (const row of state.t22 || []) {
    const parsed = readTokenAccount(row, "Token-2022");
    if (parsed) rows.push(parsed);
  }
  return { known: state.spl != null && state.t22 != null, rows };
}

function tokenSolValue(row, market, solUsd) {
  if (!market) return null;
  if (market.priceNative != null) return row.amount * market.priceNative;
  if (market.price != null && solUsd > 0) return (row.amount * market.price) / solUsd;
  return null;
}

function portfolio() {
  const nativeSol = state.balanceLamports == null ? null : solFromLamports(state.balanceLamports);
  const { known, rows } = positionsFromState();
  const price = state.priceUsd;
  const priceOk = typeof price === "number" && Number.isFinite(price) && price > 0;
  let tokenSol = 0;
  let unmarked = 0;
  for (const row of rows) {
    const solValue = tokenSolValue(row, state.markets.get(row.mint), priceOk ? price : null);
    if (solValue == null) unmarked += 1;
    else tokenSol += solValue;
  }
  const mark = portfolioMark({
    cashSol: nativeSol,
    tokenSol: unmarked === 0 ? tokenSol : null,
    stakeSol: STAKE_SOL,
    solUsd: priceOk ? price : null,
    tokensPriced: known && unmarked === 0 && nativeSol != null,
  });
  return {
    nativeSol,
    rows,
    known,
    unmarked,
    tokenSol: unmarked === 0 ? tokenSol : null,
    portfolioSol: mark.portfolioSol,
    portfolioUsd: mark.portfolioUsd,
    pnlSol: mark.pnlSol,
    pnlUsd: mark.pnlUsd,
  };
}

function tokenMap(rows) {
  const map = new Map();
  for (const row of rows) map.set(row.mint, (map.get(row.mint) || 0) + row.amount);
  return map;
}

function classifyMove(before, after) {
  const solDelta = after.nativeSol - before.nativeSol;
  if (!Number.isFinite(solDelta) || Math.abs(solDelta) < 0.001) return null;
  const prev = tokenMap(before.rows);
  const next = tokenMap(after.rows);
  const mints = new Set([...prev.keys(), ...next.keys()]);
  let up = 0;
  let down = 0;
  for (const mint of mints) {
    const delta = (next.get(mint) || 0) - (prev.get(mint) || 0);
    if (Math.abs(delta) < 1e-9) continue;
    if (delta > 0) up += 1;
    else down += 1;
  }
  if (!up && !down) return null;
  let kind = "swap";
  if (up && !down && solDelta < 0) kind = "buy";
  else if (down && !up && solDelta > 0) kind = "sell";
  else if (solDelta < 0) kind = "buy";
  else kind = "sell";
  return {
    kind,
    solFrom: before.nativeSol,
    solTo: after.nativeSol,
    tokens: up + down,
  };
}

function applyChain(partial) {
  const before = state.balanceLamports == null ? null : portfolio();
  if (Array.isArray(partial.walletSigs)) {
    const ids = partial.walletSigs.map((sig) => sig.signature).filter(Boolean);
    if (state.seenSigs) {
      const novel = ids.some((id) => !state.seenSigs.has(id));
      if (novel) state.freshSigUntil = Date.now() + 3 * 60 * 1000;
    }
    state.seenSigs = new Set(ids);
  }
  if (
    state.balanceLamports != null &&
    Number.isSafeInteger(partial.lamports) &&
    partial.lamports !== state.balanceLamports
  ) {
    state.balanceChanges.unshift({
      t: Date.now(),
      from: state.balanceLamports,
      to: partial.lamports,
    });
    state.balanceChanges = state.balanceChanges.slice(0, 4);
  }
  state.endpoint = partial.endpoint;
  state.balanceLamports = partial.lamports;
  if (Array.isArray(partial.walletSigs)) state.walletSigs = partial.walletSigs;
  if (Array.isArray(partial.targetSigs)) state.targetSigs = partial.targetSigs;
  state.spl = partial.spl;
  state.t22 = partial.t22;
  state.chainErrors = partial.errors || [];
  state.updatedAt = Date.now();
  state.balanceAt = state.updatedAt;
  state.tokensAt = state.updatedAt;
  state.failures = [];
  saveChainSnapshot();
  const after = portfolio();
  if (before && before.known && after.known && before.nativeSol != null && after.nativeSol != null) {
    const move = classifyMove(before, after);
    if (move) {
      state.tradeEvents.unshift({ t: Date.now(), ...move });
      state.tradeEvents = state.tradeEvents.slice(0, 6);
      state.trojanUntil = Date.now() + 2 * 60 * 1000;
      state.trojanKind = move.kind;
      state.trojanSolText = fmtSol(move.solFrom) + " → " + fmtSol(move.solTo) + " SOL";
    }
  }
}

function readStamp(ms) {
  if (!Number.isFinite(ms)) return "";
  return formatEt(new Date(ms), { zone: true });
}

function renderStatus() {
  const pill = $("live-pill");
  const dot = $("live-dot");
  const label = $("live-label");
  pill.classList.remove("is-live", "is-wait", "is-bad");
  dot.classList.remove("pulse");
  if (state.phase === "live") {
    pill.classList.add("is-live");
    dot.classList.add("pulse");
    label.textContent = "LIVE";
  } else if (state.phase === "stale") {
    pill.classList.add("is-bad");
    label.textContent = "STALE";
  } else if (state.phase === "offline") {
    pill.classList.add("is-bad");
    label.textContent = "OFFLINE";
  } else {
    pill.classList.add("is-wait");
    label.textContent = "LOADING";
  }

  const bits = [];
  const secs = Math.max(0, Math.ceil((state.nextPollAt - Date.now()) / 1000));
  if (state.phase === "loading") bits.push("loading public data");
  else if (state.phase === "offline") {
    bits.push("offline · no chain snapshot yet");
    if (state.polling) bits.push("reading");
    else if (state.nextPollAt > Date.now()) bits.push("retry " + secs + "s");
  }
  else if (state.phase === "stale") {
    const cashAt = readStamp(state.balanceAt);
    const tokensAt = readStamp(state.tokensAt);
    if (cashAt && tokensAt && state.balanceAt !== state.tokensAt) {
      bits.push("stale · cash " + cashAt + " · positions " + tokensAt);
    } else if (cashAt && !state.tokensAt) {
      bits.push("stale · cash " + cashAt + " · token accounts not loaded");
    } else if (cashAt) {
      bits.push("stale · last chain read " + cashAt);
    } else {
      bits.push("stale");
    }
    if (state.polling) bits.push("reading");
    else if (state.nextPollAt > Date.now()) bits.push("retry " + secs + "s");
  } else {
    if (state.endpoint) bits.push(state.endpoint.url.replace(/^https:\/\//, ""));
    if (state.updatedAt) bits.push("chain " + fmtAgo(Date.now() - state.updatedAt));
    bits.push("updates in " + secs + "s");
  }
  if (state.priceSource && state.priceUsd != null) bits.push("SOL " + fmtUsd(state.priceUsd) + " · " + state.priceSource);
  else if (state.priceError) bits.push("price unavailable");
  setText("status", bits.filter(Boolean).join("  ·  "));
  const notes = [];
  if ((state.phase === "stale" || state.phase === "offline") && state.endpointNote) notes.push(state.endpointNote);
  if (state.priceUsd == null && state.priceError) notes.push(state.priceError);
  setText("status-note", notes.join(" "));
}

function renderMetrics() {
  const book = portfolio();
  setText("start-sol", fmtSol(STAKE_SOL, 3) + " SOL");
  setText("start-usd", fmtUsd(STAKE_USD));

  if (book.nativeSol == null) {
    setText("bal-sol", state.phase === "loading" ? "—" : "unavailable");
    setText("bal-usd", state.phase === "loading" ? "waiting for RPC" : "no chain snapshot");
  } else {
    paintNumber("bal-sol", fmtSol(book.nativeSol, 9) + " SOL", 0);
    let detail;
    if (!book.known) detail = "portfolio waiting on token accounts";
    else if (book.unmarked) detail = "portfolio waiting on token price";
    else if (book.portfolioUsd == null) detail = book.rows.length ? "portfolio " + fmtSol(book.portfolioSol) + " SOL" : "USD waiting on price";
    else if (book.rows.length) detail = "Portfolio " + fmtSol(book.portfolioSol) + " SOL · " + fmtUsd(book.portfolioUsd);
    else detail = fmtUsd(book.portfolioUsd);
    if (state.phase !== "live" && (state.balanceAt != null || state.tokensAt != null)) {
      detail = "as of " + readStamp(state.tokensAt || state.balanceAt) + " · " + detail;
    }
    if (book.portfolioUsd != null && state.phase === "live") paintNumber("bal-usd", detail, 0);
    else setText("bal-usd", detail);
  }

  const pnl = $("pnl-card");
  pnl.classList.remove("pos", "neg", "flat");
  const toneSource = book.pnlUsd != null ? book.pnlUsd : book.known ? book.pnlSol : null;
  pnl.classList.add(toneClass(toneSource));
  paintNumber("pnl-usd", book.pnlUsd == null ? "—" : fmtPnlUsd(book.pnlUsd), book.pnlUsd ?? 0);
  if (book.pnlSol != null) setText("pnl-sol", fmtPnlSol(book.pnlSol));
  else if (book.nativeSol == null) setText("pnl-sol", "—");
  else if (!book.known) setText("pnl-sol", "waiting on token accounts");
  else if (book.unmarked) setText("pnl-sol", "waiting on token price");
  else setText("pnl-sol", "waiting on SOL price");

  const elapsedMs = Date.now() - STAKE_AT.getTime();
  setText("elapsed", elapsedMs < 0 ? "00:00:00" : formatElapsed(elapsedMs));
  setText("clock", formatEt(new Date(), { date: false, zone: true }));
}

function renderSpark() {
  const canvas = $("spark");
  const caption = $("spark-caption");
  const usdPoints = state.spark.filter((p) => Number.isFinite(p.usd));
  const mode = usdPoints.length >= 2 ? "usd" : "sol";
  const points = mode === "usd" ? usdPoints : state.spark;
  if (points.length < 2) {
    caption.textContent =
      points.length === 0
        ? "No session points yet. The line stores each successful poll on this device."
        : "One real point so far. The line appears after the next poll.";
  } else {
    const first = points[0];
    const last = points[points.length - 1];
    const label = mode === "usd" ? "Session portfolio USD" : "Portfolio SOL";
    caption.textContent =
      label +
      " · " +
      points.length +
      " polls on this device · " +
      formatEt(new Date(first.t), { seconds: false }) +
      " → " +
      formatEt(new Date(last.t), { seconds: false });
  }

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvas.clientWidth || 320;
  const h = canvas.clientHeight || 84;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  if (points.length === 0) return;

  const vals = points.map((p) => (mode === "usd" ? p.usd : p.sol));
  let min = Math.min(...vals);
  let max = Math.max(...vals);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const pad = 8;
  const xAt = (i) => (points.length === 1 ? w / 2 : pad + (i * (w - pad * 2)) / (points.length - 1));
  const yAt = (v) => pad + ((max - v) * (h - pad * 2)) / (max - min);
  const up = vals[vals.length - 1] >= vals[0];
  const stroke = up ? "#3dff9a" : "#ff4d6a";
  ctx.beginPath();
  vals.forEach((v, i) => {
    const x = xAt(i);
    const y = yAt(v);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1.6;
  ctx.stroke();
  if (points.length > 1) {
    ctx.lineTo(xAt(vals.length - 1), h - 1);
    ctx.lineTo(xAt(0), h - 1);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, up ? "rgba(61,255,154,0.28)" : "rgba(255,77,106,0.28)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
    ctx.fill();
  }
  const lastX = xAt(vals.length - 1);
  const lastY = yAt(vals[vals.length - 1]);
  ctx.beginPath();
  ctx.arc(lastX, lastY, 2.6, 0, Math.PI * 2);
  ctx.fillStyle = stroke;
  ctx.fill();
}

function latestTargetSuccess(sigs) {
  if (!Array.isArray(sigs)) return null;
  return sigs.find((sig) => sig && sig.err == null) || null;
}

function renderTarget() {
  const host = $("target-body");
  host.replaceChildren();
  if (state.targetSigs == null) {
    host.append(line(state.chainErrors.length ? "Last seen unavailable." : "Loading last successful signature…"));
    if (state.chainErrors.length) host.append(line(state.chainErrors.join(" ")));
    return;
  }
  const sig = latestTargetSuccess(state.targetSigs);
  if (!sig && state.targetSigs.length) {
    host.append(line("No successful signature in the newest " + state.targetSigs.length + ". Failed transfers are not counted as last seen."));
    return;
  }
  if (!sig) {
    host.append(line("No signatures returned for the copy target."));
    return;
  }
  const when = Number.isFinite(sig.blockTime) ? new Date(sig.blockTime * 1000) : null;
  const age = when ? fmtAgo(Date.now() - when.getTime()) : "timestamp not in the response";
  const title = document.createElement("p");
  title.className = "target-when";
  title.textContent = when ? formatEt(when, { zone: true }) : "Time unavailable";
  const ageEl = document.createElement("p");
  ageEl.className = "target-age";
  ageEl.id = "target-age";
  if (when) {
    const ageMs = Date.now() - when.getTime();
    ageEl.classList.add(ageMs < 30 * 60 * 1000 ? "fresh" : ageMs < 6 * 3600 * 1000 ? "warm" : "stale");
  }
  ageEl.textContent = age;
  host.append(title, ageEl);
  if (sig.signature) {
    const href = solscanTx(sig.signature);
    const row = document.createElement(href ? "a" : "p");
    row.className = "tx-link";
    if (href) {
      row.href = href;
      row.target = "_blank";
      row.rel = "noopener noreferrer";
    }
    row.textContent = shortKey(sig.signature, 6, 6) + " · " + (sig.confirmationStatus || "ok");
    host.append(row);
  }
}

function line(text) {
  const p = document.createElement("p");
  p.className = "muted";
  p.textContent = text;
  return p;
}

function renderFleet() {
  const host = $("fleet");
  const now = new Date();
  const existing = new Map([...host.querySelectorAll("[data-agent]")].map((node) => [node.dataset.agent, node]));
  for (const agent of AGENTS) {
    let card = existing.get(agent.id);
    if (!card) {
      card = document.createElement("article");
      card.className = "bot";
      card.dataset.agent = agent.id;
      const face = document.createElement("div");
      face.className = "bot-face";
      face.innerHTML = botAvatar(agent.id);
      const copy = document.createElement("div");
      copy.className = "bot-copy";
      copy.innerHTML =
        "<h3></h3><p class=\"bot-cron\"></p>" +
        "<p class=\"bot-phase\"><span class=\"bot-dot\"></span><span class=\"bot-phase-label\"></span>" +
        "<span class=\"typing\" aria-hidden=\"true\"><i></i><i></i><i></i></span></p>" +
        "<p class=\"bot-count\"></p><p class=\"bot-when\"></p>";
      copy.querySelector("h3").textContent = agent.name;
      copy.querySelector(".bot-cron").textContent = agent.cron;
      card.append(face, copy);
      host.append(card);
    }
    const phase = botPhase(agent, now);
    card.classList.toggle("is-running", phase.running);
    card.classList.toggle("is-standby", !phase.running);
    card.querySelector(".bot-phase-label").textContent = phase.running ? "RUNNING" : "STANDBY";
    const count = card.querySelector(".bot-count");
    const when = card.querySelector(".bot-when");
    if (phase.running) {
      count.textContent = "2 min window";
      when.textContent = "Scheduled until " + formatEt(phase.windowEnds, { seconds: false, zone: true });
    } else {
      count.textContent = "in " + formatCountdown(phase.countdownMs);
      when.textContent = "Next " + formatEt(phase.next, { seconds: false, zone: true });
    }
  }
}

function renderMascot() {
  const el = $("mascot");
  const book = portfolio();
  const holdsToken = book.known && book.rows.length > 0;
  const freshSig = Date.now() < state.freshSigUntil;
  const excited = holdsToken || freshSig;
  el.classList.toggle("is-excited", excited);
  el.classList.toggle("is-calm", !excited);
  const mood = $("mascot-mood");
  if (holdsToken) mood.textContent = "Excited. The wallet holds a token.";
  else if (freshSig) mood.textContent = "Excited. A new wallet signature arrived.";
  else mood.textContent = "Calm. No open token balance.";
}

function tickerItems() {
  const items = [];
  for (const change of state.balanceChanges) {
    items.push(
      "Balance changed · " +
        fmtSol(solFromLamports(change.from)) +
        " SOL → " +
        fmtSol(solFromLamports(change.to)) +
        " SOL"
    );
  }
  if (Array.isArray(state.walletSigs)) {
    if (!state.walletSigs.length) items.push("Wallet · no signatures returned");
    for (const sig of state.walletSigs) {
      const when = Number.isFinite(sig.blockTime)
        ? formatEt(new Date(sig.blockTime * 1000), { zone: true })
        : "time unavailable";
      const status = sig.err ? "failed" : sig.confirmationStatus || "ok";
      items.push("Wallet · " + when + " · " + status + " · " + shortKey(sig.signature, 4, 4));
    }
  } else if (state.phase !== "loading") {
    items.push("Wallet signatures unavailable");
  }
  if (Array.isArray(state.targetSigs)) {
    const sig = latestTargetSuccess(state.targetSigs);
    if (!sig && !state.targetSigs.length) items.push(TARGET_NAME + " · no signatures returned");
    else if (!sig) items.push(TARGET_NAME + " · no successful signature in the newest " + state.targetSigs.length);
    else if (Number.isFinite(sig.blockTime)) {
      items.push(TARGET_NAME + " last seen · " + formatEt(new Date(sig.blockTime * 1000), { zone: true }));
    } else {
      items.push(TARGET_NAME + " last seen · time unavailable");
    }
  }
  const now = new Date();
  for (const agent of AGENTS) {
    const phase = botPhase(agent, now);
    if (phase.running) {
      items.push("Schedule · " + agent.name + " · RUNNING · fired " + formatEt(phase.previous, { seconds: false, zone: true }));
    } else {
      items.push("Schedule · " + agent.name + " · STANDBY · next " + formatEt(phase.next, { seconds: false, zone: true }));
    }
  }
  if (!items.length) items.push("Waiting on wallet signatures and the copy target");
  return items;
}

function renderTicker() {
  const track = $("ticker-track");
  const items = tickerItems();
  const key = items.join("\n");
  if (track.dataset.key === key) return;
  track.dataset.key = key;
  track.replaceChildren();
  for (const text of items.concat(items)) {
    const span = document.createElement("span");
    span.textContent = text;
    track.append(span);
  }
  const seconds = Math.max(28, Math.round(items.join("  ").length * 0.11));
  track.style.animationDuration = seconds + "s";
}

function fmtTokenAmount(text) {
  const raw = String(text ?? "");
  const neg = raw.startsWith("-");
  const body = neg ? raw.slice(1) : raw;
  const [whole, frac] = body.split(".");
  if (!/^\d+$/.test(whole || "")) return raw || "—";
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return (neg ? "−" : "") + grouped + (frac != null ? "." + frac : "");
}

function factRow(term, detail) {
  const wrap = document.createElement("div");
  const dt = document.createElement("dt");
  dt.textContent = term;
  const dd = document.createElement("dd");
  dd.textContent = detail;
  wrap.append(dt, dd);
  return wrap;
}

function renderPositions() {
  const host = $("positions");
  const book = portfolio();
  host.replaceChildren();
  if (state.spl == null && state.t22 == null) {
    const msg = state.chainErrors.find((e) => /token/i.test(e)) || (state.phase === "loading" ? "Loading token accounts…" : "Token accounts unavailable.");
    host.append(line(msg));
    return;
  }
  if (!book.rows.length && book.known) {
    host.append(line("No token accounts with a balance. SPL Token and Token-2022 both came back empty."));
    return;
  }
  if (!book.rows.length) {
    host.append(line(state.chainErrors.filter((e) => /token/i.test(e)).join(" · ") || "Token accounts incomplete."));
    return;
  }
  const solUsd = state.priceUsd;
  for (const row of book.rows) {
    const market = state.markets.get(row.mint);
    const card = document.createElement("article");
    card.className = "pos-row";
    const name = document.createElement("div");
    name.className = "pos-name";
    const sym = document.createElement("strong");
    sym.textContent = market?.symbol || shortKey(row.mint, 4, 4);
    const sub = document.createElement("span");
    sub.textContent = market?.name || "DexScreener name unavailable";
    name.append(sym, sub);
    if (isKilluaEra(row, market)) {
      const era = document.createElement("span");
      era.className = "era";
      era.textContent = "Killua-era";
      name.append(era);
    }
    const facts = document.createElement("dl");
    facts.className = "pos-facts";
    const symbol = market?.symbol || "tokens";
    facts.append(factRow("Holding", fmtTokenAmount(row.amountText) + " " + symbol));
    if (market?.price != null) facts.append(factRow("Price", fmtPriceUsd(market.price) + " per token"));
    else facts.append(factRow("Price", "USD price unavailable"));
    if (market?.priceNative != null) facts.append(factRow("SOL price", fmtSol(market.priceNative, 8) + " SOL per token"));
    const solValue = tokenSolValue(row, market, solUsd);
    const valueUsd = market?.price != null ? row.amount * market.price : null;
    const valueUsdText = valueUsd != null && Math.abs(valueUsd) > 0 && Math.abs(valueUsd) < 0.01 ? fmtPriceUsd(valueUsd) : fmtUsd(valueUsd);
    if (market?.price != null && solValue != null) {
      facts.append(factRow("Market value", valueUsdText + " · " + fmtSol(solValue, 6) + " SOL"));
    } else if (market?.price != null) {
      facts.append(factRow("Market value", valueUsdText));
    } else if (solValue != null) {
      facts.append(factRow("Market value", fmtSol(solValue, 6) + " SOL"));
    } else {
      facts.append(factRow("Market value", "unavailable"));
    }
    const links = document.createElement("div");
    links.className = "pos-links";
    const mintHref = solscanToken(row.mint);
    const mintLink = document.createElement(mintHref ? "a" : "span");
    if (mintHref) {
      mintLink.href = mintHref;
      mintLink.target = "_blank";
      mintLink.rel = "noopener noreferrer";
    }
    mintLink.textContent = shortKey(row.mint, 4, 4);
    links.append(mintLink);
    if (market?.url) {
      const marketLink = document.createElement("a");
      marketLink.href = market.url;
      marketLink.target = "_blank";
      marketLink.rel = "noopener noreferrer";
      marketLink.textContent = market.solQuote ? "DexScreener SOL pair" : "DexScreener";
      links.append(marketLink);
    }
    const tag = document.createElement("span");
    tag.textContent = row.program;
    links.append(tag);
    card.append(name, facts, links);
    const fills = RECORDED_FILLS.get(row.mint);
    if (fills) {
      for (const text of fills) {
        const note = document.createElement("p");
        note.className = "pos-note";
        note.textContent = "Recorded · " + text;
        card.append(note);
      }
    }
    host.append(card);
  }
  if (book.rows.some((row) => isKilluaEra(row, state.markets.get(row.mint)))) {
    host.append(line("Killua-era marks vibeshift, KFC, and dust left open when copying Killua stopped."));
  }
  if (state.phase !== "live" && state.tokensAt) {
    host.append(line("Token accounts as of " + readStamp(state.tokensAt) + "."));
  }
  if (!book.known) {
    host.append(line("One token program did not load, so the open count is incomplete. " + state.chainErrors.filter((e) => /token/i.test(e)).join(" · ")));
  }
  if (state.marketError) host.append(line(state.marketError));
  if (book.unmarked) host.append(line(book.unmarked + " held token" + (book.unmarked === 1 ? "" : "s") + " had no SOL market value. P/L stays blank until that price loads."));
}

function renderRisk() {
  const book = portfolio();
  const host = $("checks");
  host.replaceChildren();
  const open = book.known ? book.rows.length : null;
  host.append(check(
    "Open",
    open == null ? "not loaded" : open + " token account" + (open === 1 ? "" : "s") + " with a balance",
    open != null && open > 2 ? "bad" : "ok"
  ));
  host.append(check(
    "Max 2",
    open == null
      ? "Personal rule. Waiting on token accounts. Trojan does not enforce this."
      : open > 2
        ? "Personal rule. Over the max of 2. Trojan does not enforce this."
        : "Personal rule. Inside the max of 2. Trojan does not enforce this.",
    open != null && open > 2 ? "bad" : "ok"
  ));
  const today = currentToday(book);
  if (today.usd == null) {
    host.append(check("Day stop", "Personal rule. Today is not priced yet. The −$10 stop uses today's change since midnight ET, not all-time. Trojan does not enforce this.", "wait"));
  } else if (today.usd <= -10) {
    host.append(check("Day stop", "Personal rule. Today " + fmtPnlUsd(today.usd) + " is past the −$10 day stop. Trojan does not enforce this.", "bad"));
  } else {
    host.append(check("Day stop", "Personal rule. Today " + fmtPnlUsd(today.usd) + " is inside the −$10 day stop. Trojan does not enforce this.", "ok"));
  }
  if (book.nativeSol == null) {
    host.append(check("Buy size", "Native SOL has not loaded.", "wait"));
  } else if (book.nativeSol + 1e-9 < BUY_SOL) {
    host.append(check("Buy size", "Native balance is under the fixed " + BUY_SOL + " SOL buy.", "bad"));
  } else {
    host.append(check("Buy size", "Native balance covers the fixed " + BUY_SOL + " SOL buy.", "ok"));
  }
  host.append(check(
    "Sells",
    "Copy sell is on when " + TARGET_NAME + " sells. Auto sell is on: 50% at +100% and 100% at −30%.",
    "wait"
  ));
}

function check(k, v, tone) {
  const row = document.createElement("div");
  row.className = "check " + tone;
  const a = document.createElement("span");
  a.textContent = k;
  const b = document.createElement("span");
  b.textContent = v;
  row.append(a, b);
  return row;
}

function renderLog() {
  const host = $("log");
  host.replaceChildren();
  if (state.walletSigs == null) {
    host.append(line(state.phase === "loading" ? "Loading recent signatures…" : "Activity log unavailable."));
    for (const err of state.chainErrors) host.append(line(err));
    return;
  }
  if (!state.walletSigs.length) {
    host.append(line("No signatures returned for this wallet."));
    return;
  }
  for (const sig of state.walletSigs) {
    const href = solscanTx(sig.signature);
    const row = document.createElement(href ? "a" : "div");
    row.className = "log-row" + (sig.err ? " bad" : "");
    if (href) {
      row.href = href;
      row.target = "_blank";
      row.rel = "noopener noreferrer";
    }
    const time = document.createElement("time");
    if (Number.isFinite(sig.blockTime)) {
      time.dateTime = new Date(sig.blockTime * 1000).toISOString();
      time.textContent = formatEt(new Date(sig.blockTime * 1000), { zone: true });
    } else {
      time.textContent = "time unavailable";
    }
    const main = document.createElement("span");
    main.className = "log-main";
    const stateLabel = sig.err ? "failed" : (sig.confirmationStatus || "ok");
    main.textContent = stateLabel + "  ·  " + shortKey(sig.signature, 4, 6);
    row.append(time, main);
    if (sig.err) {
      const err = document.createElement("span");
      err.className = "log-err";
      const raw = typeof sig.err === "string" ? sig.err : JSON.stringify(sig.err);
      err.textContent = raw.length > 180 ? raw.slice(0, 177) + "…" : raw;
      row.append(err);
    }
    host.append(row);
  }
}

function vaultSpot(book) {
  const price = state.priceUsd;
  const priceOk = typeof price === "number" && Number.isFinite(price) && price > 0;
  if (book.portfolioSol == null) return { sol: null, usd: null, allSol: null, allUsd: null };
  const sol = book.portfolioSol;
  const usd = priceOk ? sol * price : null;
  const allSol = sol - STAKE_SOL;
  const allUsd = priceOk ? allSol * price : null;
  return { sol, usd, allSol, allUsd };
}

function fmtVaultBalanceUsd(spot) {
  return spot.usd == null ? "—" : fmtUsd(spot.usd);
}

function fmtVaultBalanceSol(spot) {
  return spot.sol == null ? "—" : spot.sol.toFixed(4) + " SOL";
}

function fmtVaultAllUsd(spot) {
  return spot.allUsd == null ? "—" : fmtPnlUsd(spot.allUsd);
}

function fmtVaultAllSol(spot) {
  return spot.allSol == null ? "—" : fmtPnlSol(spot.allSol);
}

function deskSnapshot() {
  const now = new Date();
  const book = portfolio();
  const spot = vaultSpot(book);
  const today = currentToday(book);
  const agents = AGENTS.map((agent) => {
    const phase = botPhase(agent, now);
    return {
      id: agent.id,
      name: agent.name,
      running: phase.running,
      countText: phase.running ? "now" : formatCountdown(phase.countdownMs),
      when: phase.next ? formatEt(phase.next, { seconds: false, zone: true }) : "",
      cron: agent.cron,
    };
  });
  const lines = [];
  for (const agent of agents) {
    const meta = AGENTS.find((item) => item.id === agent.id);
    lines.push({
      agentId: agent.id,
      tag: "Scheduled",
      text: agent.running
        ? meta.name + " · RUNNING · scheduled window"
        : meta.name + " · STANDBY · next " + agent.when,
    });
  }
  if (Array.isArray(state.walletSigs)) {
    for (const sig of state.walletSigs.slice(0, 8)) {
      const when = Number.isFinite(sig.blockTime)
        ? formatEt(new Date(sig.blockTime * 1000), { zone: true })
        : "time unavailable";
      lines.push({
        agentId: "all",
        tag: sig.err ? "Failed" : "Wallet",
        text: when + " · " + (sig.err ? "failed" : sig.confirmationStatus || "ok") + " · " + shortKey(sig.signature, 4, 4),
      });
    }
  }
  const seen = latestTargetSuccess(state.targetSigs);
  if (Array.isArray(state.targetSigs)) {
    if (seen && Number.isFinite(seen.blockTime)) {
      lines.push({
        agentId: "trojan",
        tag: TARGET_NAME,
        text: "Last successful signature · " + formatEt(new Date(seen.blockTime * 1000), { zone: true }),
      });
    } else if (state.targetSigs.length) {
      lines.push({
        agentId: "trojan",
        tag: TARGET_NAME,
        text: "No successful signature in the newest " + state.targetSigs.length,
      });
    } else {
      lines.push({ agentId: "trojan", tag: TARGET_NAME, text: "No signatures returned" });
    }
  }
  for (const change of state.balanceChanges) {
    lines.push({
      agentId: "all",
      tag: "Balance",
      text: fmtSol(solFromLamports(change.from)) + " SOL → " + fmtSol(solFromLamports(change.to)) + " SOL",
    });
  }
  for (const trade of state.tradeEvents) {
    lines.push({
      agentId: "trojan",
      tag: "Balances",
      text:
        trade.kind +
        "-like · " +
        fmtSol(trade.solFrom) +
        " → " +
        fmtSol(trade.solTo) +
        " SOL · " +
        trade.tokens +
        " token balance" +
        (trade.tokens === 1 ? "" : "s") +
        " changed",
    });
  }
  if (book.nativeSol != null) {
    lines.push({
      agentId: "all",
      tag: "Balance",
      text:
        "Cash " +
        fmtSol(book.nativeSol, 9) +
        " SOL" +
        (book.portfolioUsd == null ? "" : " · portfolio " + fmtUsd(book.portfolioUsd)),
    });
  }
  return {
    vaultUsd: today.usd == null ? "—" : fmtPnlUsd(today.usd),
    vaultSol: today.sol == null ? "since midnight" : fmtPnlSol(today.sol),
    vaultDir: today.usd != null ? today.usd : today.sol,
    vaultBalanceUsd: fmtVaultBalanceUsd(spot),
    vaultBalanceSol: fmtVaultBalanceSol(spot),
    vaultAllUsd: fmtVaultAllUsd(spot),
    vaultAllSol: fmtVaultAllSol(spot),
    vaultAllDir: spot.allUsd != null ? spot.allUsd : spot.allSol,
    agents,
    targetName: TARGET_NAME,
    trojan: {
      lit: Date.now() < state.trojanUntil,
      kind: state.trojanKind,
      solText: state.trojanSolText,
    },
    lines,
    spark: state.spark,
  };
}

let city = null;

function render() {
  renderStatus();
  renderMetrics();
  renderMascot();
  renderTicker();
  renderFleet();
  renderSpark();
  renderTarget();
  renderPositions();
  renderRisk();
  renderLog();
  if (city) city.sync();
}

async function refreshMarkets() {
  const mints = [...new Set(positionsFromState().rows.map((row) => row.mint))];
  if (!mints.length) {
    state.marketError = "";
    return;
  }
  const markets = await fetchMarkets(mints);
  if (markets.markets.size) state.markets = markets.markets;
  state.marketError = markets.error;
}

async function poll() {
  if (state.polling) return;
  state.polling = true;
  renderStatus();
  try {
    const [chain, priceR] = await Promise.all([loadChain(), fetchSolPrice()]);
    state.priceUsd = priceR.usd;
    state.priceSource = priceR.source;
    state.priceError = priceR.error || "";

    if (chain.full) {
      applyChain(chain.full);
      await refreshMarkets();
      const marked = portfolio();
      if (marked.portfolioSol != null) rememberSpark(marked.portfolioSol, marked.portfolioUsd);
      state.phase = "live";
      state.failCount = 0;
      state.failures = [];
      state.endpointNote = "";
      state.backoffMs = HEALTHY_MS;
      schedule(HEALTHY_MS);
      render();
      return;
    }

    const haveTokens = state.tokensAt != null && (state.spl != null || state.t22 != null);
    if (!haveTokens && Number.isSafeInteger(chain.lamports)) applyBalanceOnly(chain.lamports);
    state.failures = chain.errors;
    state.endpointNote = formatFailures(chain.errors);
    state.failCount += 1;
    state.phase = nextPhase(false, state.balanceLamports != null);
    state.backoffMs = nextBackoff(state.failCount);
    await refreshMarkets();
    schedule(state.backoffMs);
    render();
  } catch (err) {
    state.failCount += 1;
    state.phase = nextPhase(false, state.balanceLamports != null);
    state.endpointNote = err?.message || "Chain read failed";
    state.backoffMs = nextBackoff(state.failCount);
    schedule(state.backoffMs);
    render();
  } finally {
    state.polling = false;
  }
}

let pollTimer = 0;
function schedule(ms) {
  clearTimeout(pollTimer);
  state.nextPollAt = Date.now() + ms;
  pollTimer = setTimeout(poll, ms);
  renderStatus();
}

function tick() {
  renderMetrics();
  renderFleet();
  renderMascot();
  renderTicker();
  renderStatus();
  const age = $("target-age");
  const seen = latestTargetSuccess(state.targetSigs);
  if (age && seen?.blockTime) {
    age.textContent = fmtAgo(Date.now() - seen.blockTime * 1000);
  }
  if (city) city.sync();
}

function wireCopy() {
  document.querySelectorAll("[data-copy]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const text = btn.getAttribute("data-copy");
      try {
        await navigator.clipboard.writeText(text);
        btn.textContent = "copied";
      } catch {
        btn.textContent = "select the address";
      }
      setTimeout(() => {
        btn.textContent = "copy";
      }, 1400);
    });
  });
}

function boot() {
  $("wallet-title").textContent = WALLET_NAME;
  $("wallet-addr").textContent = WALLET;
  $("wallet-addr").href = "https://solscan.io/account/" + WALLET;
  $("target-title").textContent = TARGET_NAME;
  $("target-addr").textContent = TARGET;
  $("target-addr").href = "https://solscan.io/account/" + TARGET;
  const copyBtn = document.querySelector("[data-copy-target]");
  if (copyBtn) copyBtn.setAttribute("data-copy", TARGET);
  const walletCopy = document.querySelector("[data-copy-wallet]");
  if (walletCopy) walletCopy.setAttribute("data-copy", WALLET);
  const riskTarget = $("risk-target");
  if (riskTarget) riskTarget.textContent = TARGET_NAME;
  const riskWallet = $("risk-target-wallet");
  if (riskWallet) riskWallet.textContent = TARGET;
  const riskSell = $("risk-copy-sell");
  if (riskSell) riskSell.textContent = "On · when " + TARGET_NAME + " sells";
  $("stake-note").textContent =
    "Recorded stake 1.106 SOL · $99.10 · " + formatEt(STAKE_AT, { zone: true }) + ". Implied stake price " + fmtUsd(STAKE_USD / STAKE_SOL) + " per SOL.";
  const saved = loadChainSnapshot();
  if (saved) adoptSnapshot(saved);
  wireCopy();
  city = mountCity(deskSnapshot);
  render();
  poll();
  setInterval(tick, 1000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && Date.now() >= state.nextPollAt) poll();
  });
  window.addEventListener("online", () => poll());
  window.addEventListener("resize", () => renderSpark());
}

boot();
