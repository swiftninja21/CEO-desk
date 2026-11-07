import { botAvatar } from "./bots.js";
import {
  AGENTS,
  STAKE_AT,
  STAKE_SOL,
  STAKE_USD,
  botPhase,
  formatCountdown,
  formatElapsed,
  formatEt,
} from "./schedule.js";

const WALLET = "7MDqGWcdgesJHxWs2a1YSaKobcqWe7yU5kjz4XNBKPMa";
const TARGET = "J9TYAsWWidbrcZybmLSfrLzryANf4CgJBLdvwdGuC8MB";
const TARGET_NAME = "Johnson";
const TARGET_SIG_LIMIT = 20;
const SPL = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN_2022 = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
const WSOL = "So11111111111111111111111111111111111111112";

const ENDPOINTS = [
  { id: "mainnet-beta", url: "https://api.mainnet-beta.solana.com" },
  { id: "vibestation", url: "https://public.rpc.solanavibestation.com" },
  { id: "publicnode", url: "https://solana-rpc.publicnode.com" },
];

const HEALTHY_MS = 12000;
const BACKOFF_START_MS = 15000;
const BACKOFF_MAX_MS = 60000;
const SPARK_KEY = "ceo-desk.spark.v1";
const BASE58 = /^[1-9A-HJ-NP-Za-km-z]+$/;

const $ = (id) => document.getElementById(id);

const state = {
  phase: "loading",
  endpoint: null,
  endpointNote: "",
  cooldowns: new Map(),
  backoffMs: HEALTHY_MS,
  nextPollAt: 0,
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

async function withRetry(fn) {
  try {
    return await fn();
  } catch (err) {
    if (!(err instanceof RpcError) || (err.status !== 429 && err.status !== 503)) throw err;
    await sleep(Math.min(err.retryAfterMs || 1600, 5000));
    return await fn();
  }
}

function endpointReady(endpoint, now) {
  const until = state.cooldowns.get(endpoint.id) || 0;
  return now >= until;
}

function coolDown(endpoint, ms) {
  const until = Date.now() + ms;
  const prev = state.cooldowns.get(endpoint.id) || 0;
  state.cooldowns.set(endpoint.id, Math.max(prev, until));
}

async function loadChain() {
  const now = Date.now();
  const ordered = ENDPOINTS.filter((ep) => endpointReady(ep, now));
  const tryList = ordered.length ? ordered : ENDPOINTS;
  let lastError = null;
  for (const endpoint of tryList) {
    try {
      const balance = await withRetry(() => rpcCall(endpoint, "getBalance", [WALLET, { commitment: "confirmed" }]));
      const lamports = balance?.value;
      if (!Number.isSafeInteger(lamports)) {
        throw new RpcError("Balance response was not a lamport count", { status: 200 });
      }
      const partial = {
        endpoint,
        lamports,
        walletSigs: null,
        targetSigs: null,
        spl: null,
        t22: null,
        errors: [],
      };
      const steps = [
        async () => {
          const sigs = await withRetry(() => getSignatures(endpoint));
          partial.walletSigs = Array.isArray(sigs.wallet) ? sigs.wallet : [];
          partial.targetSigs = Array.isArray(sigs.target) ? sigs.target : [];
        },
        async () => {
          const spl = await withRetry(() => rpcCall(endpoint, "getTokenAccountsByOwner", [
            WALLET,
            { programId: SPL },
            { encoding: "jsonParsed", commitment: "confirmed" },
          ]));
          partial.spl = Array.isArray(spl?.value) ? spl.value : [];
        },
        async () => {
          const t22 = await withRetry(() => rpcCall(endpoint, "getTokenAccountsByOwner", [
            WALLET,
            { programId: TOKEN_2022 },
            { encoding: "jsonParsed", commitment: "confirmed" },
          ]));
          partial.t22 = Array.isArray(t22?.value) ? t22.value : [];
        },
      ];
      const labels = ["signatures", "SPL token accounts", "Token-2022 accounts"];
      for (let i = 0; i < steps.length; i += 1) {
        await sleep(350);
        try {
          await steps[i]();
        } catch (err) {
          partial.errors.push(labels[i] + ": " + (err?.message || String(err)));
        }
      }
      return partial;
    } catch (err) {
      lastError = err;
      const limited = err.status === 403 || err.status === 429 || err.status === 1010;
      const pause = err.retryAfterMs || (err.status === 403 ? 10 * 60 * 1000 : 45 * 1000);
      if (limited || err.status === 0) coolDown(endpoint, pause);
      state.endpointNote =
        endpoint.id === "mainnet-beta" && err.status === 403
          ? "api.mainnet-beta.solana.com refused the browser (HTTP 403). Using a public CORS endpoint."
          : `${endpoint.url} failed: ${err.message}`;
    }
  }
  throw lastError || new RpcError("No Solana RPC endpoint responded");
}

function bestMarket(pairs, mint) {
  let best = null;
  for (const pair of pairs || []) {
    if (pair.chainId !== "solana") continue;
    if (pair.baseToken?.address !== mint) continue;
    const price = Number(pair.priceUsd);
    if (!Number.isFinite(price)) continue;
    const liq = Number(pair.liquidity?.usd ?? 0);
    if (!best || liq > best.liq) {
      best = {
        price,
        liq: Number.isFinite(liq) ? liq : 0,
        symbol: pair.baseToken.symbol || "",
        name: pair.baseToken.name || "",
        url: safeHttps(pair.url),
      };
    }
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

async function fetchMarkets(mints) {
  if (!mints.length) return { markets: new Map(), error: "" };
  try {
    const json = await fetchJson(
      "https://api.dexscreener.com/latest/dex/tokens/" + mints.slice(0, 30).join(",")
    );
    const markets = new Map();
    for (const mint of mints) {
      const found = bestMarket(json?.pairs, mint);
      if (found) markets.set(mint, found);
    }
    return { markets, error: "" };
  } catch (err) {
    return { markets: new Map(), error: "DexScreener: " + (err.message || "failed") };
  }
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

function portfolio() {
  const nativeSol = state.balanceLamports == null ? null : solFromLamports(state.balanceLamports);
  const { known, rows } = positionsFromState();
  let tokenUsd = 0;
  let unmarked = 0;
  for (const row of rows) {
    const market = state.markets.get(row.mint);
    if (!market) unmarked += 1;
    else tokenUsd += row.amount * market.price;
  }
  const price = state.priceUsd;
  const tokensComplete = known && unmarked === 0;
  const portfolioUsd =
    nativeSol != null && price != null && tokensComplete ? nativeSol * price + tokenUsd : null;
  let pnlSol = null;
  if (nativeSol != null && known && rows.length === 0) pnlSol = nativeSol - STAKE_SOL;
  else if (portfolioUsd != null && price > 0) pnlSol = portfolioUsd / price - STAKE_SOL;
  const pnlUsd = portfolioUsd == null ? null : portfolioUsd - STAKE_USD;
  return { nativeSol, rows, known, unmarked, tokenUsd, portfolioUsd, pnlSol, pnlUsd };
}

function applyChain(partial) {
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
  state.walletSigs = partial.walletSigs;
  state.targetSigs = partial.targetSigs;
  state.spl = partial.spl;
  state.t22 = partial.t22;
  state.chainErrors = partial.errors;
  state.updatedAt = Date.now();
}

function renderStatus() {
  const pill = $("live-pill");
  const dot = $("live-dot");
  const label = $("live-label");
  pill.classList.remove("is-live", "is-wait", "is-bad");
  if (state.phase === "live") {
    pill.classList.add("is-live");
    dot.classList.add("pulse");
    label.textContent = "LIVE";
  } else if (state.phase === "reconnecting") {
    pill.classList.add("is-bad");
    dot.classList.add("pulse");
    label.textContent = "RECONNECTING";
  } else {
    pill.classList.add("is-wait");
    dot.classList.remove("pulse");
    label.textContent = "LOADING";
  }

  const bits = [];
  const secs = Math.max(0, Math.ceil((state.nextPollAt - Date.now()) / 1000));
  if (state.phase === "reconnecting") bits.push("reconnecting · retry " + secs + "s");
  else if (state.phase === "loading") bits.push("loading public data");
  if (state.endpoint) bits.push(state.endpoint.url.replace(/^https:\/\//, ""));
  if (state.updatedAt) bits.push("chain " + fmtAgo(Date.now() - state.updatedAt));
  if (state.priceSource && state.priceUsd != null) bits.push("SOL " + fmtUsd(state.priceUsd) + " · " + state.priceSource);
  else if (state.priceError) bits.push("price unavailable");
  if (state.phase === "live") bits.push("updates in " + secs + "s");
  setText("status", bits.filter(Boolean).join("  ·  "));
  const notes = [];
  if (state.endpointNote) notes.push(state.endpointNote);
  if (state.priceUsd == null && state.priceError) notes.push(state.priceError);
  setText("status-note", notes.join(" "));
}

function renderMetrics() {
  const book = portfolio();
  setText("start-sol", fmtSol(STAKE_SOL, 3) + " SOL");
  setText("start-usd", fmtUsd(STAKE_USD));

  if (book.nativeSol == null) {
    setText("bal-sol", state.phase === "reconnecting" ? "unavailable" : "—");
    setText("bal-usd", state.phase === "loading" ? "waiting for RPC" : "balance unavailable");
  } else {
    paintNumber("bal-sol", fmtSol(book.nativeSol) + " SOL", 0);
    if (book.portfolioUsd == null) {
      const why = state.priceUsd == null
        ? "USD waiting on price"
        : book.known
          ? "USD incomplete"
          : "token accounts not loaded";
      setText("bal-usd", why);
    } else {
      paintNumber("bal-usd", fmtUsd(book.portfolioUsd), 0);
    }
  }

  const pnl = $("pnl-card");
  pnl.classList.remove("pos", "neg", "flat");
  const toneSource = book.pnlUsd != null ? book.pnlUsd : book.known ? book.pnlSol : null;
  pnl.classList.add(toneClass(toneSource));
  paintNumber("pnl-usd", book.pnlUsd == null ? "—" : fmtPnlUsd(book.pnlUsd), book.pnlUsd ?? 0);
  if (book.pnlSol != null) setText("pnl-sol", fmtPnlSol(book.pnlSol));
  else if (book.nativeSol != null && !book.known) setText("pnl-sol", "native " + fmtPnlSol(book.nativeSol - STAKE_SOL));
  else setText("pnl-sol", book.nativeSol == null ? "—" : "SOL P&L incomplete");

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
    const label = mode === "usd" ? "Session USD value" : "Native SOL";
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
    const note =
      state.endpoint?.id === "publicnode"
        ? "This endpoint returned no signatures. Its history index can be incomplete, so this is not proof of inactivity."
        : "No signatures returned for the copy target.";
    host.append(line(note));
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
    const amt = document.createElement("div");
    amt.className = "pos-amt";
    amt.textContent = row.amountText;
    const meta = document.createElement("div");
    meta.className = "pos-meta";
    const price = document.createElement("span");
    price.textContent = market ? fmtUsd(market.price) : "no market";
    const value = document.createElement("span");
    value.textContent = market ? fmtUsd(row.amount * market.price) : "value unavailable";
    meta.append(price, value);
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
      marketLink.textContent = "DexScreener";
      links.append(marketLink);
    }
    const tag = document.createElement("span");
    tag.textContent = row.program;
    links.append(tag);
    card.append(name, amt, meta, links);
    host.append(card);
  }
  if (!book.known) {
    host.append(line("One token program did not load, so the open count is incomplete. " + state.chainErrors.filter((e) => /token/i.test(e)).join(" · ")));
  }
  if (state.marketError) host.append(line(state.marketError));
  if (book.unmarked) host.append(line(book.unmarked + " held token" + (book.unmarked === 1 ? "" : "s") + " had no DexScreener base-side price. Those values are left blank."));
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
    open == null ? "waiting" : open > 2 ? "Over the max-open rule." : "Inside the max of 2.",
    open != null && open > 2 ? "bad" : "ok"
  ));
  if (book.pnlUsd == null) {
    host.append(check("Day stop", "Not evaluated. USD P&L is unavailable.", "wait"));
  } else if (book.pnlUsd <= -10) {
    host.append(check("Day stop", "P&L is past the −$10 day stop.", "bad"));
  } else {
    host.append(check("Day stop", "P&L is inside the −$10 day stop.", "ok"));
  }
  if (book.nativeSol == null) {
    host.append(check("Buy size", "Native SOL has not loaded.", "wait"));
  } else if (book.nativeSol + 1e-9 < 0.1) {
    host.append(check("Buy size", "Native balance is under the 0.1 SOL buy size.", "bad"));
  } else {
    host.append(check("Buy size", "Native balance covers a 0.1 SOL buy.", "ok"));
  }
  host.append(check(
    "Stops",
    "Take-profit and stop-loss need an entry. This desk does not invent one.",
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
    const note =
      state.endpoint?.id === "publicnode"
        ? "This endpoint returned no signatures. Its history index can be incomplete."
        : "No signatures returned for this wallet.";
    host.append(line(note));
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
}

async function poll() {
  if (state.polling) return;
  state.polling = true;
  renderStatus();
  try {
    const [chainR, priceR] = await Promise.all([
      loadChain().then((v) => ({ ok: true, v })).catch((e) => ({ ok: false, e })),
      fetchSolPrice(),
    ]);
    state.priceUsd = priceR.usd;
    state.priceSource = priceR.source;
    state.priceError = priceR.error || "";

    if (!chainR.ok) {
      state.phase = "reconnecting";
      state.backoffMs = Math.min(
        BACKOFF_MAX_MS,
        Math.max(BACKOFF_START_MS, state.backoffMs === HEALTHY_MS ? BACKOFF_START_MS : state.backoffMs * 2)
      );
      if (chainR.e?.retryAfterMs) state.backoffMs = Math.max(state.backoffMs, chainR.e.retryAfterMs);
      state.endpointNote = chainR.e?.message || "RPC failed";
      schedule(state.backoffMs);
      render();
      return;
    }

    applyChain(chainR.v);
    const book = portfolio();
    const mints = [...new Set(book.rows.map((row) => row.mint))];
    if (mints.length) {
      const markets = await fetchMarkets(mints);
      state.markets = markets.markets;
      state.marketError = markets.error;
    } else {
      state.markets = new Map();
      state.marketError = "";
    }
    const marked = portfolio();
    if (marked.nativeSol != null) rememberSpark(marked.nativeSol, marked.portfolioUsd);
    state.phase = "live";
    state.backoffMs = HEALTHY_MS;
    state.endpointNote = "";
    if (state.endpoint?.id !== "mainnet-beta") {
      const blocked = state.cooldowns.get("mainnet-beta");
      if (blocked && blocked > Date.now()) {
        state.endpointNote =
          "api.mainnet-beta.solana.com refused the browser (HTTP 403). Using a public CORS endpoint.";
      }
    }
    schedule(HEALTHY_MS);
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
  $("wallet-addr").textContent = WALLET;
  $("target-title").textContent = TARGET_NAME;
  $("target-addr").textContent = TARGET;
  $("target-addr").href = "https://solscan.io/account/" + TARGET;
  const copyBtn = document.querySelector("[data-copy-target]");
  if (copyBtn) copyBtn.setAttribute("data-copy", TARGET);
  $("stake-note").textContent =
    "Recorded stake 1.106 SOL · $99.10 · " + formatEt(STAKE_AT, { zone: true }) + ". Implied stake price " + fmtUsd(STAKE_USD / STAKE_SOL) + " per SOL.";
  wireCopy();
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
