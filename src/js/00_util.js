"use strict";
/* =====================================================================
   Sync Strike — rhythm combat
   Модули собираются в один файл (tools/build.js). Порядок важен.
   ===================================================================== */

/* ---------- Математика и мелочи ---------- */
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const invLerp = (a, b, v) => clamp((v - a) / (b - a), 0, 1);
const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(rand(a, b + 1));
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const sign = v => (v < 0 ? -1 : 1);
const easeOut = t => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
const easeIn = t => Math.pow(clamp(t, 0, 1), 2);
const easeInOut = t => { t = clamp(t, 0, 1); return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; };
/** Экспоненциальное сглаживание, не зависящее от частоты кадров. */
const damp = (a, b, rate, dt) => lerp(a, b, 1 - Math.exp(-rate * dt));
const TAU = Math.PI * 2;

function fmtTime(sec) {
  if (!isFinite(sec) || sec < 0) sec = 0;
  sec = Math.floor(sec);
  return Math.floor(sec / 60) + ":" + String(sec % 60).padStart(2, "0");
}

/** Перцентиль массива (копирует и сортирует подвыборку для скорости). */
function percentile(arr, p, step = 1) {
  const tmp = [];
  for (let i = 0; i < arr.length; i += step) tmp.push(arr[i]);
  if (!tmp.length) return 0;
  tmp.sort((a, b) => a - b);
  return tmp[clamp(Math.floor(p * (tmp.length - 1)), 0, tmp.length - 1)];
}
function median(arr) { return percentile(arr, 0.5); }

/** Двоичный поиск: индекс последнего элемента <= t (или -1). */
function lowerIndex(sorted, t) {
  let lo = 0, hi = sorted.length - 1, res = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] <= t) { res = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return res;
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
/** rgba-строка из hex + альфа (кэшируется). */
const _rgbaCache = new Map();
function rgba(hex, a) {
  a = Math.round(clamp(a, 0, 1) * 100) / 100;
  const key = hex + a;
  let s = _rgbaCache.get(key);
  if (!s) {
    const [r, g, b] = hexToRgb(hex);
    s = `rgba(${r},${g},${b},${a})`;
    if (_rgbaCache.size > 4000) _rgbaCache.clear();
    _rgbaCache.set(key, s);
  }
  return s;
}
function mixHex(h1, h2, t) {
  const a = hexToRgb(h1), b = hexToRgb(h2);
  t = clamp(t, 0, 1);
  const c = a.map((v, i) => clamp(Math.round(lerp(v, b[i], t)), 0, 255));
  return "#" + c.map(v => v.toString(16).padStart(2, "0")).join("");
}

/** Детерминированный псевдослучай для процедурных декораций. */
function hash1(i) { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const yieldToUI = () => new Promise(r => setTimeout(r, 0));

/* ---------- Хранилище (localStorage может быть недоступен) ---------- */
const Store = {
  get(key, fallback) {
    try { const v = localStorage.getItem("syncstrike." + key); return v == null ? fallback : JSON.parse(v); }
    catch (e) { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem("syncstrike." + key, JSON.stringify(value)); } catch (e) { /* приватный режим */ }
  }
};

/* ---------- Простая шина событий ---------- */
class Emitter {
  constructor() { this._h = {}; }
  on(ev, fn) { (this._h[ev] || (this._h[ev] = [])).push(fn); return () => this.off(ev, fn); }
  off(ev, fn) { const l = this._h[ev]; if (l) { const i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); } }
  emit(ev, a, b) { const l = this._h[ev]; if (l) for (let i = 0; i < l.length; i++) l[i](a, b); }
}

/* ---------- Прямоугольники ---------- */
function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
