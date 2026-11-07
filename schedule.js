// Wall-clock schedules in America/New_York. Pure functions, no DOM.

export const TZ = "America/New_York";

export const RUN_WINDOW_MS = 2 * 60 * 1000;

export const AGENTS = [
  {
    id: "scanner",
    name: "Pump.fun scanner",
    cron: "0,30 * * * *",
    schedule: "Every 30 min · :00 and :30",
    kind: "interval",
    step: 30,
  },
  {
    id: "copy",
    name: "Copy trade alerts",
    cron: "0,30 * * * *",
    schedule: "Every 30 min · :00 and :30",
    kind: "interval",
    step: 30,
  },
  {
    id: "rug",
    name: "Rug watch",
    cron: "*/10 * * * *",
    schedule: "Every 10 min",
    kind: "interval",
    step: 10,
  },
  {
    id: "trend",
    name: "Trend spotter",
    cron: "0 8-23/2 * * *",
    schedule: "Even hours · 8 AM–10 PM",
    kind: "trend",
  },
  {
    id: "scout",
    name: "Wallet scout",
    cron: "0 20 * * *",
    schedule: "Daily · 8:00 PM",
    kind: "daily",
    hour: 20,
    minute: 0,
  },
  {
    id: "recap",
    name: "Nightly recap",
    cron: "0 21 * * *",
    schedule: "Daily · 9:00 PM",
    kind: "daily",
    hour: 21,
    minute: 0,
  },
];

export function zonedParts(date, timeZone = TZ) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const bag = {};
  for (const part of fmt.formatToParts(date)) bag[part.type] = part.value;
  let hour = Number(bag.hour);
  let day = Number(bag.day);
  let month = Number(bag.month);
  let year = Number(bag.year);
  // Some engines report midnight as hour 24.
  if (hour === 24) hour = 0;
  return {
    year,
    month,
    day,
    hour,
    minute: Number(bag.minute),
    second: Number(bag.second),
  };
}

export function zonedToUtc(year, month, day, hour, minute, second, timeZone = TZ) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const wallAsUtc = (ms) => {
    const bag = {};
    for (const part of fmt.formatToParts(new Date(ms))) bag[part.type] = part.value;
    let h = Number(bag.hour);
    let y = Number(bag.year);
    let m = Number(bag.month);
    let d = Number(bag.day);
    if (h === 24) {
      h = 0;
    }
    return Date.UTC(y, m - 1, d, h, Number(bag.minute), Number(bag.second));
  };
  const desired = Date.UTC(year, month - 1, day, hour, minute, second);
  let utc = desired;
  for (let i = 0; i < 4; i += 1) {
    const shown = wallAsUtc(utc);
    const diff = shown - desired;
    if (diff === 0) break;
    utc -= diff;
  }
  return new Date(utc);
}

function addDays(parts, days) {
  const dt = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return {
    year: dt.getUTCFullYear(),
    month: dt.getUTCMonth() + 1,
    day: dt.getUTCDate(),
  };
}

function addMinutes(parts, mins, timeZone) {
  const total = parts.hour * 60 + parts.minute + mins;
  const extraDays = Math.floor(total / 1440);
  const minsInDay = ((total % 1440) + 1440) % 1440;
  const next = addDays(parts, extraDays);
  return zonedToUtc(
    next.year,
    next.month,
    next.day,
    Math.floor(minsInDay / 60),
    minsInDay % 60,
    0,
    timeZone
  );
}

export function nextInterval(now, stepMin, timeZone = TZ) {
  const parts = zonedParts(now, timeZone);
  const mod = (parts.hour * 60 + parts.minute) % stepMin;
  if (mod === 0) {
    const boundary = zonedToUtc(parts.year, parts.month, parts.day, parts.hour, parts.minute, 0, timeZone);
    if (now.getTime() <= boundary.getTime()) return boundary;
    return addMinutes(parts, stepMin, timeZone);
  }
  return addMinutes(parts, stepMin - mod, timeZone);
}

export function nextDaily(now, hour, minute, timeZone = TZ) {
  const parts = zonedParts(now, timeZone);
  const today = zonedToUtc(parts.year, parts.month, parts.day, hour, minute, 0, timeZone);
  if (now.getTime() <= today.getTime()) return today;
  const tomorrow = addDays(parts, 1);
  return zonedToUtc(tomorrow.year, tomorrow.month, tomorrow.day, hour, minute, 0, timeZone);
}

export function nextTrend(now, timeZone = TZ) {
  const hours = [8, 10, 12, 14, 16, 18, 20, 22];
  const parts = zonedParts(now, timeZone);
  for (const hour of hours) {
    const candidate = zonedToUtc(parts.year, parts.month, parts.day, hour, 0, 0, timeZone);
    if (candidate.getTime() >= now.getTime()) return candidate;
  }
  const tomorrow = addDays(parts, 1);
  return zonedToUtc(tomorrow.year, tomorrow.month, tomorrow.day, 8, 0, 0, timeZone);
}

export function nextAgentRun(agent, now) {
  if (agent.kind === "interval") return nextInterval(now, agent.step);
  if (agent.kind === "daily") return nextDaily(now, agent.hour, agent.minute);
  if (agent.kind === "trend") return nextTrend(now);
  return null;
}

function previousInterval(now, stepMin, timeZone = TZ) {
  const parts = zonedParts(now, timeZone);
  const mod = (parts.hour * 60 + parts.minute) % stepMin;
  if (mod === 0) {
    return zonedToUtc(parts.year, parts.month, parts.day, parts.hour, parts.minute, 0, timeZone);
  }
  return addMinutes(parts, -mod, timeZone);
}

function previousDaily(now, hour, minute, timeZone = TZ) {
  const parts = zonedParts(now, timeZone);
  const today = zonedToUtc(parts.year, parts.month, parts.day, hour, minute, 0, timeZone);
  if (now.getTime() >= today.getTime()) return today;
  const yesterday = addDays(parts, -1);
  return zonedToUtc(yesterday.year, yesterday.month, yesterday.day, hour, minute, 0, timeZone);
}

function previousTrend(now, timeZone = TZ) {
  const hours = [8, 10, 12, 14, 16, 18, 20, 22];
  const parts = zonedParts(now, timeZone);
  let last = null;
  for (const hour of hours) {
    const candidate = zonedToUtc(parts.year, parts.month, parts.day, hour, 0, 0, timeZone);
    if (candidate.getTime() <= now.getTime()) last = candidate;
  }
  if (last) return last;
  const yesterday = addDays(parts, -1);
  return zonedToUtc(yesterday.year, yesterday.month, yesterday.day, 22, 0, 0, timeZone);
}

export function previousRun(agent, now) {
  if (agent.kind === "interval") return previousInterval(now, agent.step);
  if (agent.kind === "daily") return previousDaily(now, agent.hour, agent.minute);
  if (agent.kind === "trend") return previousTrend(now);
  return null;
}

export function upcomingRun(agent, now) {
  const next = nextAgentRun(agent, now);
  if (!next) return null;
  if (next.getTime() > now.getTime()) return next;
  return nextAgentRun(agent, new Date(next.getTime() + 1000));
}

export function botPhase(agent, now) {
  const previous = previousRun(agent, now);
  const next = upcomingRun(agent, now);
  const elapsed = previous ? now.getTime() - previous.getTime() : Number.POSITIVE_INFINITY;
  const running = elapsed >= 0 && elapsed < RUN_WINDOW_MS;
  return {
    running,
    previous,
    next,
    countdownMs: next ? next.getTime() - now.getTime() : null,
    windowEnds: previous ? new Date(previous.getTime() + RUN_WINDOW_MS) : null,
  };
}

export function formatCountdown(ms) {
  if (ms == null) return "";
  if (ms <= 0) return "due";
  const total = Math.ceil(ms / 1000);
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const pad = (n) => String(n).padStart(2, "0");
  if (days > 0) return `${days}d ${pad(hours)}h ${pad(mins)}m`;
  if (hours > 0) return `${hours}h ${pad(mins)}m`;
  return `${pad(mins)}:${pad(secs)}`;
}

export function formatElapsed(ms) {
  const safe = Math.max(0, ms);
  const total = Math.floor(safe / 1000);
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const pad = (n) => String(n).padStart(2, "0");
  if (days > 0) return `${days}d ${pad(hours)}:${pad(mins)}:${pad(secs)}`;
  return `${pad(hours)}:${pad(mins)}:${pad(secs)}`;
}

export function formatEt(date, opts = {}) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    month: opts.date === false ? undefined : "short",
    day: opts.date === false ? undefined : "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: opts.seconds === false ? undefined : "2-digit",
    hour12: true,
    timeZoneName: opts.zone ? "short" : undefined,
  }).format(date);
}

export const STAKE_AT = zonedToUtc(2026, 11, 7, 12, 8, 0);
export const STAKE_SOL = 1.106;
export const STAKE_USD = 99.1;
