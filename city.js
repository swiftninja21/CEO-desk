// Isometric city. Canvas2D, capped at 30fps, paused while hidden.
// Beams follow the cron RUNNING window. Trojan lights only after a real balance move.

import { AGENTS } from "./schedule.js";

const FRAME_MS = 1000 / 30;
const SIGNS = ["SOLANA", "COPY TRADE", "RUG CHECK", "DIAMOND HANDS"];

const SLOTS = {
  scanner: { side: "left", fy: 0.2 },
  copy: { side: "right", fy: 0.16 },
  rug: { side: "left", fy: 0.4 },
  trend: { side: "right", fy: 0.36 },
  scout: { side: "left", fy: 0.6 },
  recap: { side: "right", fy: 0.56 },
  trojan: { side: "center", fy: 0.05 },
};

const TOWERS = [
  { id: "scanner", name: "Scanner", x: -1.55, y: -1.15, w: 0.72, d: 0.72, h: 168, color: "#3de4ff" },
  { id: "copy", name: "Copy alerts", x: 1.45, y: -1.25, w: 0.68, d: 0.68, h: 132, color: "#ff4fd8" },
  { id: "rug", name: "Rug watch", x: -2.25, y: 0.15, w: 0.7, d: 0.7, h: 188, color: "#ff5b3d" },
  { id: "trend", name: "Trend", x: 2.15, y: 0.05, w: 0.66, d: 0.66, h: 206, color: "#7dff6a" },
  { id: "scout", name: "Scout", x: -1.25, y: 1.25, w: 0.7, d: 0.7, h: 146, color: "#ffc857" },
  { id: "recap", name: "Recap", x: 1.35, y: 1.35, w: 0.64, d: 0.64, h: 118, color: "#b388ff" },
  { id: "trojan", name: "Trojan", x: -0.05, y: 0.05, w: 0.78, d: 0.78, h: 228, color: "#ff2bd6" },
];

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

export function mountCity(getSnapshot) {
  const canvas = document.getElementById("city");
  const labelHost = document.getElementById("tower-labels");
  const vaultEl = document.getElementById("vault-label");
  const office = document.getElementById("office");
  const stage = canvas.parentElement;
  const ctx = canvas.getContext("2d", { alpha: false });
  quad.ctx = ctx;
  const stars = Array.from({ length: 42 }, (_, i) => ({
    u: ((i * 97) % 1000) / 1000,
    v: ((i * 53) % 1000) / 1000,
    r: (i % 3) + 0.6,
  }));
  const motes = TOWERS.map(() =>
    Array.from({ length: 7 }, (_, i) => ({
      u: (i + 0.2) / 7,
      drift: ((i * 17) % 10) - 5,
      speed: 0.18 + (i % 4) * 0.05,
    }))
  );

  const buttons = new Map();
  for (const tower of TOWERS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "tower-label";
    btn.dataset.tower = tower.id;
    btn.style.setProperty("--beam", tower.color);
    btn.innerHTML = '<strong></strong><span class="tl-state"></span><span class="tl-earn"></span>';
    btn.addEventListener("click", () => openOffice(tower.id));
    labelHost.append(btn);
    buttons.set(tower.id, btn);
  }
  vaultEl.addEventListener("click", () => {
    document.body.classList.add("show-desk");
    const toggle = document.getElementById("view-toggle");
    if (toggle) toggle.textContent = "City";
  });

  let raf = 0;
  let lastDraw = 0;
  let running = false;
  let officeId = null;
  let snap = null;
  let view = { w: 1, h: 1, dpr: 1, scale: 1, cx: 0, cy: 0 };

  function project(x, y, z) {
    return {
      x: view.cx + (x - y) * 46 * view.scale,
      y: view.cy + (x + y) * 22 * view.scale - z * view.scale,
    };
  }

  function resize() {
    const rect = stage.getBoundingClientRect();
    const dprCap = Math.min(window.devicePixelRatio || 1, 2);
    view.w = Math.max(1, rect.width);
    view.h = Math.max(1, rect.height);
    view.dpr = dprCap;
    view.scale = Math.min(view.w / 620, view.h / 760);
    view.cx = view.w * 0.5;
    view.cy = view.h * 0.58;
    canvas.width = Math.round(view.w * dprCap);
    canvas.height = Math.round(view.h * dprCap);
    canvas.style.width = view.w + "px";
    canvas.style.height = view.h + "px";
    if (reducedMotion.matches) paint(0);
  }

  function loop(now) {
    if (!running) return;
    raf = requestAnimationFrame(loop);
    if (officeId || document.hidden || document.body.classList.contains("show-desk")) return;
    if (now - lastDraw < FRAME_MS) return;
    lastDraw = now;
    paint(now);
  }

  function start() {
    if (running) return;
    running = true;
    raf = requestAnimationFrame(loop);
  }

  function stop() {
    running = false;
    cancelAnimationFrame(raf);
  }

  function paint(now) {
    const { w, h, dpr } = view;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, "#120826");
    sky.addColorStop(0.45, "#1a0f3d");
    sky.addColorStop(1, "#07111f");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    for (const star of stars) {
      ctx.globalAlpha = 0.35 + (star.r % 2) * 0.3;
      ctx.fillRect(star.u * w, star.v * h * 0.55, star.r, star.r);
    }
    ctx.globalAlpha = 1;
    drawPlatform(now);
    const ordered = TOWERS.slice().sort((a, b) => a.x + a.y - (b.x + b.y));
    for (const tower of ordered) drawTower(tower, now);
    drawVault(now);
    placeLabels(true);
    placeVault();
  }

  function drawPlatform(now) {
    const rx = Math.min(view.w, view.h) * 0.46;
    const ry = rx * 0.38;
    ctx.save();
    ctx.translate(view.cx, view.cy + 18 * view.scale);
    ctx.beginPath();
    ctx.ellipse(0, 10, rx * 1.05, ry * 0.72, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(4, 2, 16, 0.55)";
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#140a22";
    ctx.fill();
    ctx.lineWidth = 2.4;
    ctx.setLineDash([12, 9]);
    ctx.lineDashOffset = reducedMotion.matches ? 0 : -now * 0.02;
    ctx.strokeStyle = "rgba(255, 43, 214, 0.9)";
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(0, 0, rx * 0.78, ry * 0.78, 0, 0, Math.PI * 2);
    ctx.lineDashOffset = reducedMotion.matches ? 8 : 16 - now * 0.015;
    ctx.strokeStyle = "rgba(61, 228, 255, 0.8)";
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  function litState(id) {
    if (!snap) return { on: false, label: "STANDBY", earn: "earnings —" };
    if (id === "trojan") {
      const t = snap.trojan;
      if (t && t.lit) {
        return {
          on: true,
          label: t.kind === "sell" ? "SELL" : t.kind === "buy" ? "BUY" : "SWAP",
          earn: t.solText || "from balances",
        };
      }
      return { on: false, label: "STANDBY", earn: "earnings —" };
    }
    const agent = snap.agents.find((item) => item.id === id);
    if (!agent) return { on: false, label: "STANDBY", earn: "earnings —" };
    return {
      on: agent.running,
      label: agent.running ? "RUNNING" : "STANDBY",
      earn: "earnings —",
    };
  }

  function drawTower(tower, now) {
    const state = litState(tower.id);
    const pulse = state.on && !reducedMotion.matches ? 0.65 + Math.sin(now / 180 + tower.h) * 0.35 : state.on ? 1 : 0.22;
    const bw = tower.w;
    const bd = tower.d;
    const bh = tower.h;
    const x = tower.x;
    const y = tower.y;
    const top = [
      project(x, y, bh),
      project(x + bw, y, bh),
      project(x + bw, y + bd, bh),
      project(x, y + bd, bh),
    ];
    const east = [
      project(x + bw, y, bh),
      project(x + bw, y + bd, bh),
      project(x + bw, y + bd, 0),
      project(x + bw, y, 0),
    ];
    const south = [
      project(x, y + bd, bh),
      project(x + bw, y + bd, bh),
      project(x + bw, y + bd, 0),
      project(x, y + bd, 0),
    ];
    quad(east, "#10131c");
    quad(south, "#0b0e16");
    quad(top, state.on ? shade(tower.color, 0.35) : "#161425");
    strokePoly(top, tower.color, state.on ? 0.9 : 0.28);
    const cols = 3;
    const rows = Math.max(3, Math.round(bh / 28));
    faceWindows(east, cols, rows, tower, now, state.on, 1);
    faceWindows(south, cols, rows, tower, now, state.on, 2);
    const roof = project(x + bw / 2, y + bd / 2, bh);
    const tip = { x: roof.x, y: roof.y - (state.on ? 92 : 36) * view.scale * pulse };
    const grad = ctx.createLinearGradient(roof.x, roof.y, tip.x, tip.y);
    grad.addColorStop(0, hexAlpha(tower.color, state.on ? 0.15 : 0.04));
    grad.addColorStop(0.2, hexAlpha(tower.color, 0.85 * pulse));
    grad.addColorStop(1, hexAlpha(tower.color, 0));
    ctx.strokeStyle = grad;
    ctx.lineWidth = (state.on ? 3.2 : 1.2) * Math.max(view.scale, 0.7);
    ctx.beginPath();
    ctx.moveTo(roof.x, roof.y);
    ctx.lineTo(tip.x, tip.y);
    ctx.stroke();
    if (state.on && !reducedMotion.matches) {
      const specks = motes[TOWERS.indexOf(tower)];
      ctx.fillStyle = tower.color;
      for (const mote of specks) {
        mote.u = (mote.u + mote.speed * 0.016) % 1;
        const py = roof.y + (tip.y - roof.y) * mote.u;
        const px = roof.x + Math.sin(now / 300 + mote.drift) * 5 * view.scale;
        ctx.globalAlpha = 1 - mote.u;
        ctx.fillRect(px, py, 2, 2);
      }
      ctx.globalAlpha = 1;
    }
    tower._anchor = roof;
    tower._hit = project(x + bw / 2, y + bd / 2, bh * 0.45);
  }

  function faceWindows(face, cols, rows, tower, now, on, salt) {
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const blink = on && !reducedMotion.matches && ((Math.floor(now / 220) + c * 3 + r + salt) % 7 === 0);
        const onDot = on ? (c + r + salt) % 3 !== 0 || blink : (c + r + salt) % 5 === 0;
        const u0 = (c + 0.28) / cols;
        const u1 = (c + 0.72) / cols;
        const v0 = (r + 0.32) / rows;
        const v1 = (r + 0.68) / rows;
        const cell = [
          bilerp(face, u0, v0),
          bilerp(face, u1, v0),
          bilerp(face, u1, v1),
          bilerp(face, u0, v1),
        ];
        quad(cell, onDot ? "rgba(244,248,255,0.92)" : "rgba(255,255,255,0.07)");
      }
    }
  }

  function drawVault() {
    const base = project(0.15, 2.05, 0);
    const rx = 34 * view.scale;
    const ry = 16 * view.scale;
    const up = snap && snap.vaultDir;
    const color = up == null ? "#8b97a6" : up > 0 ? "#3dff9a" : "#ff4d6a";
    ctx.save();
    ctx.translate(base.x, base.y);
    ctx.beginPath();
    ctx.ellipse(0, 8, rx * 1.15, ry * 0.9, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#102033";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = color;
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(0, -10 * view.scale, rx * 0.72, ry * 0.72, 0, Math.PI, 0);
    ctx.strokeStyle = hexAlpha(color, 0.8);
    ctx.stroke();
    ctx.restore();
    vaultEl.style.setProperty("--beam", color);
  }

  let vaultPlaceKey = "";

  function placeVault() {
    const lip = project(0.15, 2.05, 28);
    const w = vaultEl.offsetWidth || 160;
    const h = vaultEl.offsetHeight || 80;
    const key = [view.w, view.h, w, h, Math.round(lip.x), Math.round(lip.y)].join(":");
    if (key === vaultPlaceKey) return;
    const margin = 8;
    const stageRect = stage.getBoundingClientRect();
    const obstacles = [...buttons.values()].map((btn) => {
      const r = btn.getBoundingClientRect();
      return {
        l: r.left - stageRect.left - margin,
        t: r.top - stageRect.top - margin,
        r: r.right - stageRect.left + margin,
        b: r.bottom - stageRect.top + margin,
      };
    });
    const hits = (l, t) => obstacles.some((o) => l < o.r && l + w > o.l && t < o.b && t + h > o.t);
    const clamp = (l, t) => ({
      l: Math.max(6, Math.min(Math.max(6, view.w - w - 6), l)),
      t: Math.max(6, Math.min(Math.max(6, view.h - h - 6), t)),
    });
    const prefer = clamp(lip.x - w / 2, lip.y - h);
    let chosen = prefer;
    if (hits(prefer.l, prefer.t)) {
      let best = null;
      for (let dx = 0; dx <= view.w; dx += 8) {
        const xDirs = dx === 0 ? [0] : [1, -1];
        for (const sx of xDirs) {
          for (let dy = 0; dy <= view.h; dy += 8) {
            const yDirs = dy === 0 ? [0] : [-1, 1];
            for (const sy of yDirs) {
              const spot = clamp(prefer.l + sx * dx, prefer.t + sy * dy);
              if (hits(spot.l, spot.t)) continue;
              const score = Math.abs(spot.l - prefer.l) + Math.abs(spot.t - prefer.t) * 0.7;
              if (!best || score < best.score) best = { l: spot.l, t: spot.t, score };
            }
          }
        }
        if (best && best.score <= dx + 8) break;
      }
      if (best) chosen = best;
    }
    vaultEl.style.transform = `translate(${Math.round(chosen.l)}px, ${Math.round(chosen.t)}px)`;
    vaultPlaceKey = key;
  }

  function placeLabels(withLines) {
    for (const tower of TOWERS) {
      const btn = buttons.get(tower.id);
      const anchor = tower._anchor || project(tower.x, tower.y, tower.h);
      const slot = SLOTS[tower.id];
      const y = slot.fy * view.h;
      const x = slot.side === "right" ? view.w - 112 : slot.side === "center" ? view.w / 2 - 52 : 8;
      const phase = litState(tower.id);
      btn.style.transform = `translate(${x}px, ${y}px)`;
      if (withLines) {
        ctx.save();
        ctx.strokeStyle = hexAlpha(tower.color, phase.on ? 0.7 : 0.28);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + 8, y + 16);
        ctx.lineTo(anchor.x, anchor.y);
        ctx.stroke();
        ctx.restore();
      }
      btn.classList.toggle("is-on", phase.on);
      const name = btn.querySelector("strong");
      const st = btn.querySelector(".tl-state");
      const earn = btn.querySelector(".tl-earn");
      if (name.textContent !== tower.name) name.textContent = tower.name;
      let stateText = phase.label;
      if (tower.id !== "trojan" && snap && !phase.on) {
        const agent = snap.agents.find((item) => item.id === tower.id);
        if (agent) stateText = "STANDBY · " + agent.countText;
      }
      if (st.textContent !== stateText) st.textContent = stateText;
      if (earn.textContent !== phase.earn) earn.textContent = phase.earn;
    }
  }

  function syncText() {
    snap = getSnapshot();
    if (vaultEl) {
      const write = (sel, text) => {
        const node = vaultEl.querySelector(sel);
        if (node && text != null && node.textContent !== text) node.textContent = text;
      };
      write(".vault-usd", snap.vaultUsd);
      write(".vault-sol", snap.vaultSol);
      write(".vault-balance-usd", snap.vaultBalanceUsd);
      write(".vault-balance-sol", snap.vaultBalanceSol);
      write(".vault-all-usd", snap.vaultAllUsd);
      write(".vault-all-sol", snap.vaultAllSol);
      const allLine = vaultEl.querySelector("#vault-all");
      if (allLine) {
        const dir = snap.vaultAllDir;
        allLine.classList.toggle("pos", typeof dir === "number" && dir > 0);
        allLine.classList.toggle("neg", typeof dir === "number" && dir < 0);
      }
    }
    placeLabels(false);
    placeVault();
    if (officeId) paintOffice();
    if (reducedMotion.matches) paint(0);
  }

  function openOffice(id) {
    officeId = id;
    office.hidden = false;
    document.body.classList.add("office-open");
    paintOffice();
  }

  function closeOffice() {
    officeId = null;
    office.hidden = true;
    document.body.classList.remove("office-open");
    if (reducedMotion.matches) paint(0);
  }

  function paintOffice() {
    if (!officeId || !snap) return;
    const tower = TOWERS.find((item) => item.id === officeId);
    const title = document.getElementById("office-title");
    const sub = document.getElementById("office-sub");
    title.textContent = tower ? tower.name : "Office";
    if (officeId === "trojan") {
      sub.textContent = snap.trojan.lit
        ? "Lit from a real SOL and token balance move. Not a decoded swap."
        : "Johnson is the copy target. This tower stays dim until Aj's wallet balances move like a buy or sell.";
    } else {
      const agent = snap.agents.find((item) => item.id === officeId);
      sub.textContent = agent
        ? agent.cron + " · " + (agent.running ? "RUNNING scheduled window" : "STANDBY · next " + agent.when)
        : "";
    }
    const log = document.getElementById("office-log");
    const key = snap.lines.map((line) => line.text).join("\n") + officeId;
    if (log.dataset.key !== key) {
      log.dataset.key = key;
      log.replaceChildren();
      const focus = snap.lines.filter((line) => !line.agentId || line.agentId === officeId || line.agentId === "all");
      const rows = focus.length ? focus : snap.lines;
      if (!rows.length) {
        const li = document.createElement("li");
        li.textContent = "Waiting for signatures, balances, and the schedule.";
        log.append(li);
      }
      for (const line of rows.slice(0, 18)) {
        const li = document.createElement("li");
        const tag = document.createElement("span");
        tag.textContent = line.tag;
        const body = document.createElement("span");
        body.textContent = line.text;
        li.append(tag, body);
        log.append(li);
      }
    }
    drawMiniChart();
    drawHeat();
  }

  function drawMiniChart() {
    const canvasEl = document.getElementById("office-chart");
    const note = document.getElementById("office-chart-note");
    const points = snap.spark || [];
    const usd = points.filter((p) => Number.isFinite(p.usd));
    const series = usd.length >= 2 ? usd.map((p) => p.usd) : points.map((p) => p.sol).filter((n) => Number.isFinite(n));
    note.textContent = usd.length >= 2
      ? "Session USD value from polls on this device."
      : series.length >= 2
        ? "Native SOL from polls on this device. USD needs two priced points."
        : "Not enough polls yet for a line.";
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvasEl.clientWidth || 280;
    const h = canvasEl.clientHeight || 84;
    canvasEl.width = Math.round(w * dpr);
    canvasEl.height = Math.round(h * dpr);
    const g = canvasEl.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    if (series.length < 2) return;
    const min = Math.min(...series);
    const max = Math.max(...series);
    const span = max - min || 1;
    g.beginPath();
    series.forEach((v, i) => {
      const x = 6 + (i * (w - 12)) / (series.length - 1);
      const y = 8 + ((max - v) * (h - 16)) / span;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    });
    g.strokeStyle = series[series.length - 1] >= series[0] ? "#3dff9a" : "#ff4d6a";
    g.lineWidth = 1.6;
    g.stroke();
  }

  function drawHeat() {
    const canvasEl = document.getElementById("office-heat");
    const note = document.getElementById("office-heat-note");
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvasEl.clientWidth || 280;
    const h = canvasEl.clientHeight || 64;
    canvasEl.width = Math.round(w * dpr);
    canvasEl.height = Math.round(h * dpr);
    const g = canvasEl.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const hours = scheduledHours(officeId);
    const gap = 2;
    const cw = (w - gap * 23) / 24;
    for (let hour = 0; hour < 24; hour += 1) {
      const x = hour * (cw + gap);
      g.fillStyle = hours.has(hour) ? (TOWERS.find((t) => t.id === officeId)?.color || "#3dff9a") : "rgba(255,255,255,0.08)";
      g.fillRect(x, 8, cw, h - 22);
    }
    g.fillStyle = "#8b97a6";
    g.font = "10px ui-monospace, monospace";
    g.fillText("12a", 0, h - 2);
    g.fillText("12p", w * 0.48, h - 2);
    g.fillText("11p", w - 18, h - 2);
    if (officeId === "trojan") {
      note.textContent = "No cron. Cells stay empty. The beam uses balance moves, not a schedule.";
    } else {
      note.textContent = "Scheduled hours in America/New_York. Not scan results.";
    }
  }

  document.getElementById("office-back").addEventListener("click", closeOffice);
  document.getElementById("view-toggle").addEventListener("click", () => {
    const open = document.body.classList.toggle("show-desk");
    document.getElementById("view-toggle").textContent = open ? "City" : "Desk";
    if (!open) resize();
  });
  document.getElementById("back-city").addEventListener("click", () => {
    document.body.classList.remove("show-desk");
    document.getElementById("view-toggle").textContent = "Desk";
    resize();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop();
    else {
      start();
      if (reducedMotion.matches) paint(0);
    }
  });
  window.addEventListener("resize", resize);
  reducedMotion.addEventListener("change", () => {
    if (reducedMotion.matches) {
      stop();
      paint(0);
    } else start();
  });

  const signHost = document.getElementById("city-signs");
  SIGNS.forEach((text, i) => {
    const el = document.createElement("div");
    el.className = "neon-float n" + i;
    el.textContent = text;
    signHost.append(el);
  });

  canvas.addEventListener("click", (ev) => {
    const rect = canvas.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    const y = ev.clientY - rect.top;
    let best = null;
    let bestD = 54;
    for (const tower of TOWERS) {
      if (!tower._hit) continue;
      const dist = Math.hypot(tower._hit.x - x, tower._hit.y - y);
      if (dist < bestD) {
        best = tower;
        bestD = dist;
      }
    }
    if (best) openOffice(best.id);
  });

  resize();
  syncText();
  if (reducedMotion.matches) paint(0);
  else start();

  return { sync: syncText };
}

function scheduledHours(id) {
  const agent = AGENTS.find((item) => item.id === id);
  const hours = new Set();
  if (!agent) return hours;
  if (agent.kind === "interval") {
    for (let h = 0; h < 24; h += 1) hours.add(h);
  } else if (agent.kind === "trend") {
    [8, 10, 12, 14, 16, 18, 20, 22].forEach((h) => hours.add(h));
  } else if (agent.kind === "daily") {
    hours.add(agent.hour);
  }
  return hours;
}

function quad(pts, fill) {
  const ctx = quad.ctx;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

function strokePoly(pts, color, alpha) {
  const ctx = quad.ctx;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  ctx.strokeStyle = hexAlpha(color, alpha);
  ctx.lineWidth = 1.2;
  ctx.stroke();
}

function bilerp(face, u, v) {
  const top = lerp(face[0], face[1], u);
  const bot = lerp(face[3], face[2], u);
  return lerp(top, bot, v);
}

function lerp(a, b, t) {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function shade(hex, alpha) {
  return hexAlpha(hex, alpha);
}

function hexAlpha(hex, alpha) {
  const n = hex.replace("#", "");
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

