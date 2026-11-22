import React from 'react';
import { AbsoluteFill, Easing, Img, OffthreadVideo, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { C, FONT, FRAME, FPS, H, MONO, W } from './theme';

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
const easeIO = Easing.bezier(0.65, 0, 0.35, 1);

/** tło: deterministyczna fala sygnału (jak fala w nagłówku aplikacji) */
export const WaveBg: React.FC<{ intensity?: number; light?: boolean }> = ({ intensity = 1, light = false }) => {
  const frame = useCurrentFrame();
  const t = frame / FPS;
  const lines = 12;
  const paths = Array.from({ length: lines }, (_, i) => {
    const k = i / (lines - 1);
    const amp = (70 + 110 * Math.sin(k * Math.PI)) * intensity;
    const pts: string[] = [];
    for (let x = -40; x <= W + 40; x += 24) {
      const u = x / W;
      const env = Math.sin(Math.min(1, Math.max(0, u * 1.15 - 0.05)) * Math.PI) ** 1.4;
      const y = H * 0.58 + env * amp * Math.sin(u * 7.5 + t * (0.55 + k * 0.25) + k * 2.1) + (k - 0.5) * 60 * env;
      pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    }
    return { d: 'M' + pts.join(' L'), k };
  });
  return (
    <AbsoluteFill style={{ background: light ? 'linear-gradient(160deg,#f7f9fc 0%,#eaf2fd 100%)' : `radial-gradient(1200px 700px at 75% 65%, #0c2a5c 0%, ${C.ink2} 45%, ${C.ink} 100%)` }}>
      <svg width={W} height={H} style={{ position: 'absolute', inset: 0 }}>
        <defs>
          <linearGradient id="wl" x1="0" x2="1">
            <stop offset="0" stopColor={C.accentBright} stopOpacity="0" />
            <stop offset="0.35" stopColor={C.accentBright} stopOpacity="0.9" />
            <stop offset="1" stopColor={C.accentSoft} stopOpacity="0.15" />
          </linearGradient>
        </defs>
        {paths.map(({ d, k }, i) => (
          <path key={i} d={d} fill="none" stroke="url(#wl)" strokeWidth={1.2 + (i % 3 === 0 ? 1 : 0)} opacity={0.18 + 0.5 * Math.sin(k * Math.PI)} />
        ))}
      </svg>
      {/* drobna siatka kropek */}
      <AbsoluteFill style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.07) 1px, transparent 1px)', backgroundSize: '28px 28px', opacity: light ? 0.0 : 1 }} />
    </AbsoluteFill>
  );
};

/* ---------------- title card ---------------- */
export const TitleCard: React.FC<{ kicker?: string; title: string; subtitle?: string; logo?: boolean }> = ({ kicker, title, subtitle, logo = true }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const s = (d: number) => spring({ frame: frame - d, fps, config: { damping: 200 }, durationInFrames: 28 });
  const out = interpolate(frame, [durationInFrames - 12, durationInFrames], [1, 0], clamp);
  const rise = (d: number) => ({ opacity: s(d) * out, transform: `translateY(${(1 - s(d)) * 28}px)` });
  return (
    <AbsoluteFill>
      <WaveBg />
      <AbsoluteFill style={{ justifyContent: 'center', padding: '0 160px', fontFamily: FONT, color: C.white }}>
        {logo && <Img src={staticFile('brand/kryptotrop-logo-bialy.svg')} style={{ width: 330, marginBottom: 54, ...rise(0) }} />}
        {kicker && <div style={{ fontSize: 26, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.accentSoft, marginBottom: 22, ...rise(6) }}>{kicker}</div>}
        <div style={{ fontSize: 96, fontWeight: 650, lineHeight: 1.02, letterSpacing: '-0.035em', maxWidth: 1250, ...rise(10) }}>{title}</div>
        {subtitle && <div style={{ fontSize: 34, fontWeight: 400, lineHeight: 1.4, color: C.muted, marginTop: 34, maxWidth: 1150, ...rise(18) }}>{subtitle}</div>}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/* ---------------- lower-third caption ---------------- */
export type Cap = { step?: string; title: string; text?: string; at?: number; until?: number };

export const Caption: React.FC<Cap & { durationInFrames: number }> = ({ step, title, text, at = 0.35, until, durationInFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const start = Math.round(at * fps);
  const end = until !== undefined ? Math.round(until * fps) : durationInFrames - 10;
  const inS = spring({ frame: frame - start, fps, config: { damping: 22, stiffness: 140, mass: 0.8 } });
  const outS = interpolate(frame, [end - 10, end], [1, 0], clamp);
  const o = Math.min(inS, outS);
  const bar = interpolate(frame - start, [4, 22], [0, 1], { ...clamp, easing: easeIO });
  return (
    <div style={{ position: 'absolute', left: 120, bottom: 92, maxWidth: 1180, opacity: o, transform: `translateY(${(1 - inS) * 40}px)`, fontFamily: FONT }}>
      <div style={{ display: 'flex', alignItems: 'stretch', background: 'rgba(8,11,20,0.84)', backdropFilter: 'blur(14px)', borderRadius: 18, boxShadow: '0 18px 50px rgba(0,0,0,0.35), inset 0 0 0 1px rgba(255,255,255,0.08)', overflow: 'hidden' }}>
        <div style={{ width: 7, background: `linear-gradient(${C.accentBright}, ${C.accent})`, transform: `scaleY(${bar})`, transformOrigin: 'top' }} />
        <div style={{ padding: '22px 34px 24px 28px' }}>
          {step && <div style={{ fontSize: 19, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.accentSoft, marginBottom: 8 }}>{step}</div>}
          <div style={{ fontSize: 40, fontWeight: 620, letterSpacing: '-0.02em', color: C.white, lineHeight: 1.15 }}>{title}</div>
          {text && <div style={{ fontSize: 26, lineHeight: 1.4, color: 'rgba(255,255,255,0.74)', marginTop: 8 }}>{text}</div>}
        </div>
      </div>
    </div>
  );
};

/** nagranie aplikacji w ramce, z klatkami kluczowymi zoomu i plakietką prędkości */
export type Zoom = { at: number; s: number; x: number; y: number }; // at: sekunda ujęcia, fokus x/y w zakresie 0..1

const zoomAt = (zs: Zoom[] | undefined, t: number) => {
  if (!zs?.length) return { s: 1, x: 0.5, y: 0.5 };
  const ats = zs.map((z) => z.at);
  const f = (k: 's' | 'x' | 'y') => (zs.length === 1 ? zs[0][k] : interpolate(t, ats, zs.map((z) => z[k]), { ...clamp, easing: easeIO }));
  return { s: f('s'), x: f('x'), y: f('y') };
};

export const Screen: React.FC<{ children: React.ReactNode; zoom?: Zoom[]; badge?: string }> = ({ children, zoom, badge }) => {
  const frame = useCurrentFrame();
  const t = frame / FPS;
  const z = zoomAt(zoom, t);
  const fw = W * FRAME.scale;
  const fh = H * FRAME.scale;
  // przesunięcie, żeby punkt fokusu zbliżał się do środka przy zoomie, bez odsłaniania krawędzi
  const tx = Math.max(-(z.s - 1) / 2, Math.min((z.s - 1) / 2, (0.5 - z.x) * (z.s - 1))) * fw;
  const ty = Math.max(-(z.s - 1) / 2, Math.min((z.s - 1) / 2, (0.5 - z.y) * (z.s - 1))) * fh;
  return (
    <AbsoluteFill>
      <WaveBg intensity={0.6} />
      <div style={{ position: 'absolute', left: (W - fw) / 2, top: FRAME.top, width: fw, height: fh, borderRadius: 20, overflow: 'hidden', boxShadow: '0 40px 120px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.10)' }}>
        <div style={{ width: W, height: H, transform: `scale(${FRAME.scale})`, transformOrigin: 'top left' }}>
          <div style={{ width: W, height: H, transform: `translate(${tx / FRAME.scale}px, ${ty / FRAME.scale}px) scale(${z.s})` }}>{children}</div>
        </div>
        {badge && <SpeedBadge label={badge} />}
      </div>
    </AbsoluteFill>
  );
};

const SpeedBadge: React.FC<{ label: string }> = ({ label }) => {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [4, 14], [0, 1], clamp);
  const pulse = 0.75 + 0.25 * Math.sin(frame / 5);
  return (
    <div style={{ position: 'absolute', top: 26, right: 26, opacity: o, display: 'flex', alignItems: 'center', gap: 10, padding: '10px 18px', borderRadius: 999, background: 'rgba(8,11,20,0.82)', color: C.white, fontFamily: FONT, fontSize: 24, fontWeight: 600, boxShadow: '0 8px 24px rgba(0,0,0,0.3)' }}>
      <svg width="26" height="20" viewBox="0 0 26 20" style={{ opacity: pulse }}>
        <path d="M1 1 L12 10 L1 19 Z M13 1 L24 10 L13 19 Z" fill={C.accentBright} />
      </svg>
      {label}
    </div>
  );
};

export const Footage: React.FC<{ clip: string; from: number; rate?: number }> = ({ clip, from, rate = 1 }) => (
  <OffthreadVideo src={staticFile(`clips/${clip}.mp4`)} startFrom={Math.round(from * FPS)} playbackRate={rate} muted style={{ width: W, height: H }} />
);

/** porównanie motywów: okrągłe odsłonięcie jasny -> ciemny od przełącznika */
export const ThemeReveal: React.FC<{ light: string; dark: string; ox: number; oy: number; back?: boolean }> = ({ light, dark, ox, oy, back = true }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const R = Math.hypot(W, H);
  const a = interpolate(frame, [18, 48], [0, 1], { ...clamp, easing: easeIO });
  const b = back ? interpolate(frame, [durationInFrames - 46, durationInFrames - 16], [0, 1], { ...clamp, easing: easeIO }) : 0;
  const r = R * a * (1 - b);
  const label = (txt: string, on: number) => (
    <div style={{ opacity: on, fontFamily: FONT, fontSize: 24, fontWeight: 600, padding: '10px 20px', borderRadius: 999, background: 'rgba(8,11,20,0.82)', color: C.white, position: 'absolute', top: 26, right: 26 }}>{txt}</div>
  );
  return (
    <>
      <Img src={staticFile(`stills/${light}`)} style={{ position: 'absolute', width: W, height: H }} />
      <Img src={staticFile(`stills/${dark}`)} style={{ position: 'absolute', width: W, height: H, clipPath: `circle(${r}px at ${ox}px ${oy}px)` }} />
      <div style={{ position: 'absolute', left: ox - 4, top: oy - 4, width: 8, height: 8 }} />
      {label('Motyw jasny', 1 - Math.min(1, a * 2) + Math.max(0, b * 2 - 1))}
      {label('Motyw ciemny', Math.max(0, a * 2 - 1) * (1 - Math.min(1, b * 2)))}
    </>
  );
};

/* ---------------- closing card ---------------- */
export const Outro: React.FC<{ lines?: string[] }> = ({ lines = [] }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = (d: number) => spring({ frame: frame - d, fps, config: { damping: 200 }, durationInFrames: 30 });
  return (
    <AbsoluteFill>
      <WaveBg intensity={1.2} />
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', fontFamily: FONT, color: C.white, textAlign: 'center' }}>
        <Img src={staticFile('brand/kryptotrop-logo-bialy.svg')} style={{ width: 520, opacity: s(0), transform: `scale(${0.92 + 0.08 * s(0)})` }} />
        <div style={{ fontSize: 40, fontWeight: 500, marginTop: 40, color: 'rgba(255,255,255,0.86)', opacity: s(8) }}>Od śladów w sieci do portfeli krypto</div>
        <div style={{ marginTop: 56, display: 'flex', flexDirection: 'column', gap: 14, opacity: s(16) }}>
          {lines.map((l) => (
            <div key={l} style={{ fontSize: 27, color: C.muted, fontFamily: l.includes('github') ? MONO : FONT }}>{l}</div>
          ))}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
