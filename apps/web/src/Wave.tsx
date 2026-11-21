import { useContext, useEffect, useRef } from 'react';
import { ThemeCtx } from './ui';

/**
 * Fala sygnału w nagłówku pulpitu: warstwy przebiegów w rampie akcentu.
 * Energia rośnie, gdy w tle trwa analiza. Kolory czytane ze zmiennych CSS (motyw jasny i ciemny z tych samych tokenów).
 * Pętla zatrzymuje się poza ekranem i w ukrytej karcie; przy prefers-reduced-motion rysuje jedną statyczną klatkę.
 */

type RGB = [number, number, number];

function parseColor(v: string, fallback: RGB): RGB {
  const s = v.trim();
  if (s.startsWith('#')) {
    const h = s.length === 4 ? s.slice(1).split('').map((c) => c + c).join('') : s.slice(1, 7);
    const n = parseInt(h, 16);
    if (!Number.isNaN(n)) return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const m = s.match(/rgba?\(([^)]+)\)/);
  if (m) {
    const [r, g, b] = m[1].split(/[ ,]+/).map(Number);
    return [r, g, b];
  }
  return fallback;
}

const rgba = ([r, g, b]: RGB, a: number) => `rgba(${r},${g},${b},${a})`;
const smooth = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

const LINES = 10;
const PARTICLES = 14;

/** Only the flowing lines by default; `dots` adds the points travelling along them. */
export function Wave({ energy = 0, dots = false }: { energy?: number; dots?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const theme = useContext(ThemeCtx);
  const energyRef = useRef(energy);
  energyRef.current = energy;
  const dotsRef = useRef(dots);
  dotsRef.current = dots;
  const risen = useRef(false);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    let w = 0;
    let h = 0;
    let raf = 0;
    let visible = true;
    let last = performance.now();
    let t = 0;
    let amp = reduced.matches || risen.current ? 1 : 0; // fala „wstaje” z płaskiej linii tylko przy pierwszym wejściu
    risen.current = true;
    let en = energyRef.current;
    const pointer = { x: -1, k: 0, target: 0 };

    let accent: RGB = [0, 98, 209];
    let soft: RGB = [169, 199, 240];
    let surface: RGB = [255, 255, 255];
    const readColors = () => {
      const cs = getComputedStyle(canvas);
      accent = parseColor(cs.getPropertyValue('--accent'), accent);
      soft = parseColor(cs.getPropertyValue('--c2'), soft);
      surface = parseColor(cs.getPropertyValue('--surface'), surface);
    };
    readColors();

    const particles = Array.from({ length: PARTICLES }, (_, i) => ({
      line: LINES - 1 - (i % 3),
      u: i / PARTICLES,
      speed: 0.045 + ((i * 37) % 11) / 260,
    }));

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      const dpr = Math.min(devicePixelRatio || 1, 2);
      w = r.width;
      h = r.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (reduced.matches) draw();
    };

    const yAt = (i: number, x: number) => {
      const xn = x / Math.max(w, 1);
      const cy = w < 640 ? h - 60 : h * 0.52;
      const env = 0.18 + 0.82 * smooth(xn * 1.25);
      const depth = 0.45 + 0.55 * (i / (LINES - 1));
      const p = i * 0.55;
      const base = Math.min(h * 0.32, 84) * amp * (0.85 + en * 0.6);
      const bump = 1 + 0.9 * pointer.k * Math.exp(-(((x - pointer.x) / 140) ** 2));
      const wave =
        Math.sin(x * 0.0085 + t * 1.1 + p) * 0.6 +
        Math.sin(x * 0.0041 - t * 0.7 + p * 1.7) * 0.32 +
        Math.sin(x * 0.019 + t * 1.9 + p * 0.4) * 0.12 * (0.6 + en);
      return cy + wave * base * env * depth * bump + (i - (LINES - 1) / 2) * 6 * env;
    };

    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      const step = 6;
      // miękkie światło za falą - głębia bez cienia
      const cx = w < 640 ? w * 0.6 : w * 0.74;
      const glow = ctx.createRadialGradient(cx, h * 0.55, 0, cx, h * 0.55, Math.max(w * 0.42, 220));
      glow.addColorStop(0, rgba(accent, (0.1 + en * 0.06) * amp));
      glow.addColorStop(1, rgba(accent, 0));
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, w, h);
      // wypełnienie pod przednią falą
      const front = LINES - 1;
      const grad = ctx.createLinearGradient(0, h * 0.3, 0, h);
      grad.addColorStop(0, rgba(accent, 0.12 + en * 0.05));
      grad.addColorStop(1, rgba(accent, 0));
      ctx.beginPath();
      ctx.moveTo(0, h);
      for (let x = 0; x <= w + step; x += step) ctx.lineTo(x, yAt(front, x));
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();

      for (let i = 0; i < LINES; i++) {
        const d = i / (LINES - 1);
        const col = mix(soft, accent, d);
        ctx.beginPath();
        for (let x = 0; x <= w + step; x += step) {
          const y = yAt(i, x);
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = rgba(col, 0.22 + d * 0.7);
        ctx.lineWidth = i === front ? 2 : 1 + d * 0.5;
        ctx.stroke();
      }

      for (const pt of dotsRef.current ? particles : []) {
        const x = pt.u * w;
        const y = yAt(pt.line, x);
        const fade = smooth(pt.u / 0.1) * smooth((1 - pt.u) / 0.1) * amp;
        if (fade <= 0.01) continue;
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, Math.PI * 2);
        ctx.fillStyle = rgba(accent, 0.14 * fade);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x, y, 2.6, 0, Math.PI * 2);
        ctx.fillStyle = rgba(surface, fade);
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = rgba(accent, fade);
        ctx.stroke();
      }
    };

    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      en += (energyRef.current - en) * Math.min(1, dt * 2);
      amp += (1 - amp) * Math.min(1, dt * 1.6);
      pointer.k += (pointer.target - pointer.k) * Math.min(1, dt * 4);
      t += dt * (0.55 + en * 0.9);
      for (const pt of particles) {
        pt.u += dt * pt.speed * (0.8 + en * 1.6);
        if (pt.u > 1) pt.u -= 1;
      }
      draw();
      raf = visible && !document.hidden ? requestAnimationFrame(frame) : 0;
    };

    const start = () => {
      if (reduced.matches || raf || !visible || document.hidden) return;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    };
    const stop = () => {
      cancelAnimationFrame(raf);
      raf = 0;
    };

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible) start();
      else stop();
    });
    io.observe(canvas);
    const onVis = () => (document.hidden ? stop() : start());
    document.addEventListener('visibilitychange', onVis);
    const onMotion = () => {
      if (reduced.matches) {
        stop();
        amp = 1;
        draw();
      } else start();
    };
    reduced.addEventListener('change', onMotion);

    const host = canvas.parentElement;
    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      pointer.x = e.clientX - r.left;
      pointer.target = 1;
    };
    const onLeave = () => (pointer.target = 0);
    host?.addEventListener('pointermove', onMove);
    host?.addEventListener('pointerleave', onLeave);

    resize();
    if (reduced.matches) draw();
    else start();
    // motyw przełącza atrybut data-theme po renderze - kolory czytamy w następnej klatce
    const themeT = setTimeout(() => {
      readColors();
      if (reduced.matches) draw();
    }, 30);

    return () => {
      stop();
      clearTimeout(themeT);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      reduced.removeEventListener('change', onMotion);
      host?.removeEventListener('pointermove', onMove);
      host?.removeEventListener('pointerleave', onLeave);
    };
  }, [theme]);

  return <canvas ref={ref} className="hero-wave" aria-hidden="true" />;
}
