// Over-engineered game-feel engine: canvas particles, floating combat text,
// screen shake, coin arcs, and a synthesized Web Audio SFX kit.
// Self-initializing singleton — import and call; it owns its own DOM overlays,
// so it needs (almost) no wiring into React components.
import "./fx.css";

const PREFERS_REDUCED =
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

// ---------------------------------------------------------------- particles
type Kind = "coin" | "spark" | "ember" | "ring" | "shard";
interface P {
  x: number; y: number; vx: number; vy: number;
  life: number; ttl: number;
  size: number; color: string; kind: Kind;
  grav: number; drag: number; spin: number; rot: number;
  tx?: number; ty?: number; homing?: number; onArrive?: () => void;
}

let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let textLayer: HTMLDivElement | null = null;
let dpr = 1;
const particles: P[] = [];
let raf = 0;
let last = 0;

// screen shake state (applied to the .app container)
let shakeAmp = 0;
let appEl: HTMLElement | null = null;

function ensureDom() {
  if (canvas || typeof document === "undefined") return;
  canvas = document.createElement("canvas");
  canvas.id = "fx-canvas";
  document.body.appendChild(canvas);
  ctx = canvas.getContext("2d");
  textLayer = document.createElement("div");
  textLayer.id = "fx-text";
  document.body.appendChild(textLayer);
  resize();
  window.addEventListener("resize", resize);
}

function resize() {
  if (!canvas || !ctx) return;
  dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function loop(t: number) {
  if (!ctx || !canvas) return;
  const dt = Math.min(48, t - last) / 16.6667; // frames, clamped
  last = t;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life += dt;
    const k = p.life / p.ttl;
    if (k >= 1) {
      particles.splice(i, 1);
      continue;
    }

    if (p.homing && p.tx != null && p.ty != null) {
      // arc that curves into a target (coin → counter)
      const pull = p.homing * p.life * 0.02;
      p.vx += (p.tx - p.x) * pull * 0.02 * dt;
      p.vy += (p.ty - p.y) * pull * 0.02 * dt;
      const dist = Math.hypot(p.tx - p.x, p.ty - p.y);
      if (dist < 16 || k > 0.96) {
        p.onArrive?.();
        particles.splice(i, 1);
        continue;
      }
    }

    p.vy += p.grav * dt;
    p.vx *= Math.pow(p.drag, dt);
    p.vy *= Math.pow(p.drag, dt);
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.rot += p.spin * dt;

    const alpha = p.kind === "ring" ? 1 - k : 1 - k * k;
    ctx.globalAlpha = Math.max(0, alpha);

    if (p.kind === "spark" || p.kind === "ember") {
      ctx.globalCompositeOperation = "lighter";
    } else {
      ctx.globalCompositeOperation = "source-over";
    }

    if (p.kind === "ring") {
      const r = p.size * (0.4 + k * 2.6);
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.lineWidth = Math.max(0.5, 3 * (1 - k));
      ctx.strokeStyle = p.color;
      ctx.stroke();
    } else if (p.kind === "coin") {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      const w = p.size * (0.5 + 0.5 * Math.abs(Math.cos(p.rot))); // spin flatten
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.ellipse(0, 0, w, p.size, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(120,80,10,0.6)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    } else if (p.kind === "shard") {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
      ctx.restore();
    } else {
      // spark / ember dots
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";

  // screen shake decay
  if (shakeAmp > 0.1) {
    appEl = appEl || document.querySelector(".app");
    if (appEl) {
      const dx = (Math.sin(t * 0.09) + (rand() - 0.5)) * shakeAmp;
      const dy = (Math.cos(t * 0.11) + (rand() - 0.5)) * shakeAmp;
      appEl.style.transform = `translate(${dx.toFixed(2)}px, ${dy.toFixed(2)}px)`;
    }
    shakeAmp *= Math.pow(0.86, dt);
  } else if (appEl && appEl.style.transform) {
    appEl.style.transform = "";
    shakeAmp = 0;
  }

  if (particles.length || shakeAmp > 0.1) {
    raf = requestAnimationFrame(loop);
  } else {
    raf = 0;
  }
}

function kick() {
  if (raf) return;
  last = performance.now();
  raf = requestAnimationFrame(loop);
}

// deterministic-ish rng (avoids importing anything; fine for cosmetics)
let seed = 1234567;
function rand() {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}
function rng(a: number, b: number) {
  return a + rand() * (b - a);
}

// ------------------------------------------------------------- public: burst
export function burst(
  x: number,
  y: number,
  opts: { color?: string; count?: number; kind?: Kind; spread?: number; power?: number } = {},
) {
  if (PREFERS_REDUCED) return;
  ensureDom();
  const { color = "#ffc233", count = 14, kind = "spark", spread = Math.PI * 2, power = 4 } = opts;
  for (let i = 0; i < count; i++) {
    const a = rng(-spread / 2, spread / 2) - Math.PI / 2;
    const sp = rng(power * 0.4, power * 1.4);
    particles.push({
      x, y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      life: 0,
      ttl: rng(28, 52),
      size: kind === "ember" ? rng(1.5, 3.5) : rng(2, 4.5),
      color,
      kind,
      grav: kind === "ember" ? -0.04 : 0.12,
      drag: 0.94,
      spin: rng(-0.4, 0.4),
      rot: rng(0, Math.PI),
    });
  }
  kick();
}

// expanding shockwave ring
export function ring(x: number, y: number, color = "#fff", size = 20) {
  if (PREFERS_REDUCED) return;
  ensureDom();
  particles.push({
    x, y, vx: 0, vy: 0, life: 0, ttl: 26, size, color,
    kind: "ring", grav: 0, drag: 1, spin: 0, rot: 0,
  });
  kick();
}

// coins that fountain up then home into a target element (the gold counter)
export function coinArc(from: { x: number; y: number }, targetSel: string, count = 10) {
  ensureDom();
  const target = document.querySelector(targetSel) as HTMLElement | null;
  const tr = target?.getBoundingClientRect();
  const tx = tr ? tr.left + tr.width / 2 : from.x;
  const ty = tr ? tr.top + tr.height / 2 : from.y - 200;
  let arrived = 0;
  const total = PREFERS_REDUCED ? 0 : count;
  for (let i = 0; i < total; i++) {
    particles.push({
      x: from.x + rng(-10, 10),
      y: from.y + rng(-6, 6),
      vx: rng(-3, 3),
      vy: rng(-7, -3),
      life: 0,
      ttl: 90,
      size: rng(4, 7),
      color: i % 4 === 0 ? "#fff0b0" : "#ffc233",
      kind: "coin",
      grav: 0.14,
      drag: 0.99,
      spin: rng(-0.5, 0.5),
      rot: rng(0, 6),
      tx, ty,
      homing: rng(0.7, 1.2),
      onArrive: () => {
        arrived++;
        bumpEl(target);
        if (arrived === 1 || arrived === Math.ceil(total / 2)) sfx.coin();
      },
    });
  }
  if (total) kick();
  else bumpEl(target);
}

function bumpEl(el: HTMLElement | null) {
  if (!el) return;
  el.classList.remove("fx-bump");
  void el.offsetWidth; // reflow to restart animation
  el.classList.add("fx-bump");
}

// ------------------------------------------------------------- public: text
export function floatText(
  x: number,
  y: number,
  text: string,
  opts: { color?: string; crit?: boolean; big?: boolean } = {},
) {
  ensureDom();
  if (!textLayer) return;
  const el = document.createElement("div");
  el.className = "fx-float" + (opts.crit ? " crit" : opts.big ? " big" : "");
  el.textContent = text;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  el.style.color = opts.color || "#ffe08a";
  textLayer.appendChild(el);
  el.addEventListener("animationend", () => el.remove(), { once: true });
  // safety cleanup
  window.setTimeout(() => el.remove(), 1400);
}

export function shake(amp = 6) {
  if (PREFERS_REDUCED) return;
  ensureDom();
  shakeAmp = Math.max(shakeAmp, amp);
  kick();
}

// center of an element in viewport coords
export function centerOf(el: Element | null): { x: number; y: number } {
  const r = el?.getBoundingClientRect();
  if (!r) return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

// --------------------------------------------------------------------- SFX
// Synthesized with Web Audio — no audio files. Lazy AudioContext (unlocked on
// first user-gesture-driven sound). Mute persists in localStorage.
const MUTE_KEY = "idle-legion-muted";
let muted =
  typeof localStorage !== "undefined" && localStorage.getItem(MUTE_KEY) === "1";
let ac: AudioContext | null = null;
let master: GainNode | null = null;

function audio(): AudioContext | null {
  if (muted) return null;
  if (typeof window === "undefined") return null;
  if (!ac) {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ac = new Ctor();
    master = ac.createGain();
    master.gain.value = 0.28;
    master.connect(ac.destination);
  }
  if (ac.state === "suspended") void ac.resume();
  return ac;
}

function tone(
  freq: number,
  dur: number,
  opts: { type?: OscillatorType; gain?: number; slideTo?: number; delay?: number; attack?: number } = {},
) {
  const a = audio();
  if (!a || !master) return;
  const { type = "sine", gain = 1, slideTo, delay = 0, attack = 0.005 } = opts;
  const t0 = a.currentTime + delay;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g);
  g.connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function noise(dur: number, gain = 0.4, hp = 800) {
  const a = audio();
  if (!a || !master) return;
  const frames = Math.floor(a.sampleRate * dur);
  const buf = a.createBuffer(1, frames, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < frames; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / frames);
  const src = a.createBufferSource();
  src.buffer = buf;
  const filter = a.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.value = hp;
  const g = a.createGain();
  g.gain.value = gain;
  src.connect(filter);
  filter.connect(g);
  g.connect(master);
  src.start();
}

export const sfx = {
  coin() { tone(880, 0.09, { type: "triangle", gain: 0.5, slideTo: 1320 }); tone(1320, 0.08, { type: "triangle", gain: 0.3, delay: 0.04 }); },
  collect() { tone(560, 0.1, { type: "triangle", gain: 0.5, slideTo: 840 }); },
  click() { tone(320, 0.05, { type: "square", gain: 0.2, slideTo: 220 }); },
  hit() { noise(0.14, 0.5, 500); tone(160, 0.12, { type: "sawtooth", gain: 0.5, slideTo: 60 }); },
  crit() { noise(0.2, 0.6, 400); tone(220, 0.2, { type: "sawtooth", gain: 0.6, slideTo: 70 }); tone(660, 0.18, { type: "square", gain: 0.3, delay: 0.02 }); },
  levelup() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.16, { type: "triangle", gain: 0.4, delay: i * 0.07 })); },
  reveal() { [392, 523, 659, 880].forEach((f, i) => tone(f, 0.22, { type: "triangle", gain: 0.4, delay: i * 0.06 })); noise(0.3, 0.15, 1200); },
  legendary() { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.3, { type: "triangle", gain: 0.45, delay: i * 0.08 })); tone(130, 0.6, { type: "sawtooth", gain: 0.25 }); },
  error() { tone(200, 0.18, { type: "sawtooth", gain: 0.4, slideTo: 120 }); },
  build() { noise(0.16, 0.35, 300); tone(300, 0.14, { type: "square", gain: 0.35, slideTo: 500 }); },
  whoosh() { noise(0.3, 0.3, 300); },
  boom() { noise(0.4, 0.7, 120); tone(90, 0.5, { type: "sine", gain: 0.7, slideTo: 40 }); },
};

export function isMuted() { return muted; }
export function toggleMute(): boolean {
  muted = !muted;
  try { localStorage.setItem(MUTE_KEY, muted ? "1" : "0"); } catch { /* ignore */ }
  if (!muted) audio(); // warm up + unlock on unmute
  return muted;
}
