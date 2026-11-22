// Recording toolkit: CDP screencast -> JPEG frames -> H.264 clip, plus a fake cursor,
// płynne ruchy myszy, przewijanie, znaczniki osi czasu i anonimizacja portfeli.
import { chromium } from 'playwright';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';

export const APP = 'http://localhost:5173/';
const ROOT = resolve(import.meta.dirname, '..');
const CLIPS = join(ROOT, 'public', 'clips');
const FFMPEG = join(ROOT, 'node_modules', '@remotion', 'compositor-win32-x64-msvc', 'ffmpeg.exe');

export function encode(name) {
  const dir = join(ROOT, 'record', 'frames', name);
  const out = join(CLIPS, `${name}.mp4`);
  execFileSync(FFMPEG, ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', 'list.txt', '-vf', 'scale=1920:1080:flags=lanczos,format=yuv420p', '-r', '30', '-fps_mode', 'cfr', '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-movflags', '+faststart', out], { cwd: dir, stdio: 'inherit' });
  return out;
}

// Prawdziwy publiczny portfel ze scenariusza B - nie może być czytelny na filmie (warunek mentora MF).
const REAL = /0x396343362be2a4da1ce0c1c210945346fb82aa49/gi;
const MASK = '0x' + '•'.repeat(40);
const REAL_SHORT = /0x396343(…|\.\.\.?)82aa49/gi; // server-side shortened form
const MASK_SHORT = '0x••••••…••••••';

const CURSOR_JS = () => {
  const install = () => {
    if (document.getElementById('__cur')) return;
    const c = document.createElement('div');
    c.id = '__cur';
    c.innerHTML = `<svg width="30" height="30" viewBox="0 0 24 24"><path d="M4 2.5 L4 19 L8.6 14.9 L11.6 21.5 L14.4 20.3 L11.5 13.8 L17.8 13.6 Z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
    Object.assign(c.style, { position: 'fixed', left: '0', top: '0', zIndex: 2147483647, pointerEvents: 'none', opacity: '0', transform: 'translate(-100px,-100px)', filter: 'drop-shadow(0 2px 3px rgba(0,0,0,.35))', transition: 'opacity .3s' });
    document.documentElement.appendChild(c);
    const st = document.createElement('style');
    st.textContent = `.__rip{position:fixed;z-index:2147483646;pointer-events:none;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;border:3px solid #2f7bff;background:rgba(47,123,255,.18);animation:__rip .55s ease-out forwards}@keyframes __rip{from{transform:scale(.3);opacity:1}to{transform:scale(1.5);opacity:0}}`;
    document.documentElement.appendChild(st);
  };
  addEventListener('mousemove', (e) => {
    install();
    const c = document.getElementById('__cur');
    c.style.opacity = '1';
    c.style.transform = `translate(${e.clientX - 3}px,${e.clientY - 2}px)`;
  }, true);
  addEventListener('mousedown', (e) => {
    const r = document.createElement('div');
    r.className = '__rip';
    r.style.left = e.clientX + 'px';
    r.style.top = e.clientY + 'px';
    document.documentElement.appendChild(r);
    setTimeout(() => r.remove(), 700);
    const c = document.getElementById('__cur');
    if (c) { c.style.scale = '0.85'; setTimeout(() => (c.style.scale = '1'), 140); }
  }, true);
  // hide native scrollbars - cleaner frames
  const s = document.createElement('style');
  s.textContent = 'html{scrollbar-width:none}::-webkit-scrollbar{display:none}';
  document.addEventListener('DOMContentLoaded', () => document.head.appendChild(s));
};

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export async function session(name) {
  const dir = join(ROOT, 'record', 'frames', name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  mkdirSync(CLIPS, { recursive: true });

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 810 }, deviceScaleFactor: 4 / 3, locale: 'pl-PL', timezoneId: 'Europe/Warsaw' });
  await ctx.addInitScript(CURSOR_JS);
  await ctx.route('**/api/**', async (route) => {
    const req = route.request();
    const url = req.url().replaceAll(encodeURIComponent(MASK), '0x396343362be2A4dA1cE0C1C210945346fb82Aa49');
    const resp = await route.fetch({ url });
    const ct = resp.headers()['content-type'] ?? '';
    if (/json|text|html/.test(ct)) await route.fulfill({ response: resp, body: (await resp.text()).replace(REAL, MASK).replace(REAL_SHORT, MASK_SHORT) });
    else await route.fulfill({ response: resp });
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));

  const cdp = await ctx.newCDPSession(page);
  const frames = [];
  const writes = [];
  let t0 = null;
  let recording = false;
  cdp.on('Page.screencastFrame', async ({ data, sessionId }) => {
    cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
    if (!recording) return;
    const now = performance.now() / 1000;
    if (t0 === null) t0 = now;
    const file = `f${String(frames.length).padStart(6, '0')}.jpg`;
    frames.push({ t: now - t0, file });
    writes.push(writeFile(join(dir, file), Buffer.from(data, 'base64')));
  });

  const markers = {};
  let mouse = { x: 720, y: 600 };

  const api = {
    page,
    wait: (ms) => page.waitForTimeout(ms),
    async hideCursor() {
      await page.evaluate(() => { const c = document.getElementById('__cur'); if (c) c.style.opacity = '0'; });
    },
    async start() {
      recording = true;
      await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
      // force a first frame immediately
      await page.evaluate(() => (document.documentElement.style.outline = '0px solid transparent'));
      await page.waitForTimeout(300);
    },
    mark(label) {
      const t = t0 === null ? 0 : performance.now() / 1000 - t0;
      markers[label] = +t.toFixed(3);
      console.log(`  ${label.padEnd(18)} ${t.toFixed(2)}s`);
    },
    async moveTo(x, y, ms = 700) {
      const from = { ...mouse };
      const n = Math.max(8, Math.round(ms / 16));
      for (let i = 1; i <= n; i++) {
        const k = ease(i / n);
        await page.mouse.move(from.x + (x - from.x) * k, from.y + (y - from.y) * k);
        await page.waitForTimeout(ms / n);
      }
      mouse = { x, y };
    },
    async hover(loc, ms = 700) {
      await loc.scrollIntoViewIfNeeded();
      const b = await loc.boundingBox();
      await api.moveTo(b.x + b.width / 2, b.y + b.height / 2, ms);
    },
    async click(loc, { ms = 700, pause = 250, dx = 0.5 } = {}) {
      await loc.scrollIntoViewIfNeeded();
      const b = await loc.boundingBox();
      await api.moveTo(b.x + b.width * dx, b.y + b.height / 2, ms);
      await page.waitForTimeout(pause);
      await page.mouse.down();
      await page.waitForTimeout(70);
      await page.mouse.up();
      await page.waitForTimeout(250);
    },
    async type(text, delay = 55) {
      for (const ch of text) {
        await page.keyboard.type(ch);
        await page.waitForTimeout(delay + Math.random() * delay * 0.6);
      }
    },
    /** Płynne przewinięcie okna do y (albo do góry elementu z przesunięciem). */
    async scrollTo(y, ms = 1400) {
      await page.evaluate(([y, ms]) => new Promise((res) => {
        const from = scrollY, to = Math.max(0, Math.min(y, document.documentElement.scrollHeight - innerHeight));
        const t0 = performance.now();
        const e = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
        const step = (now) => { const k = Math.min(1, (now - t0) / ms); scrollTo(0, from + (to - from) * e(k)); k < 1 ? requestAnimationFrame(step) : res(); };
        requestAnimationFrame(step);
      }), [y, ms]);
    },
    async scrollToEl(loc, offset = 120, ms = 1400) {
      const y = await loc.evaluate((el, off) => el.getBoundingClientRect().top + scrollY - off, offset);
      await api.scrollTo(y, ms);
    },
    async theme(which) {
      const label = { light: 'Motyw jasny', dark: 'Motyw ciemny', system: 'Motyw systemowy' }[which];
      await api.click(page.getByRole('button', { name: label }).first(), { ms: 900, pause: 350 });
    },
    async stop() {
      api.mark('end');
      await page.waitForTimeout(400);
      recording = false;
      await cdp.send('Page.stopScreencast');
      await Promise.all(writes);
      await browser.close();
      // lista dla demuxera concat: każda klatka trwa do następnej
      const end = markers.end + 0.4;
      const lines = frames.map((f, i) => `file '${f.file}'\nduration ${((frames[i + 1]?.t ?? end) - f.t).toFixed(4)}`);
      lines.push(`file '${frames.at(-1).file}'`);
      writeFileSync(join(dir, 'list.txt'), lines.join('\n'));
      writeFileSync(join(CLIPS, `${name}.json`), JSON.stringify({ duration: +end.toFixed(3), markers }, null, 2));
      console.log(`  encoding ${frames.length} frames`);
      encode(name);
      return markers;
    },
    /** Kadr w pełnej rozdzielczości (1920x1080) do porównania motywów. */
    async still(file) {
      await page.screenshot({ path: join(ROOT, 'public', 'stills', file) });
    },
  };
  mkdirSync(join(ROOT, 'public', 'stills'), { recursive: true });
  return api;
}
