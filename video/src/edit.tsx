import React from 'react';
import { AbsoluteFill } from 'remotion';
import { TransitionSeries, linearTiming, springTiming, type TransitionPresentation } from '@remotion/transitions';
import { fade } from '@remotion/transitions/fade';
import { slide } from '@remotion/transitions/slide';
import { wipe } from '@remotion/transitions/wipe';
import { Caption, Footage, Outro, Screen, ThemeReveal, TitleCard, type Cap, type Zoom } from './components';
import { FPS } from './theme';
import landing from '../public/clips/landing.json';
import scenA from '../public/clips/scenA.json';
import scenB from '../public/clips/scenB.json';
import scenA_res from '../public/clips/scenA_res.json';
import scenB_res from '../public/clips/scenB_res.json';

type ClipMeta = { duration: number; markers: Record<string, number> };
const CLIPS: Record<string, ClipMeta> = { landing, scenA, scenB, scenA_res, scenB_res } as Record<string, ClipMeta>;

/** a point in a clip: marker name, marker+offset ("done+1.5"), or seconds */
type At = string | number;
const at = (clip: string, p: At): number => {
  if (typeof p === 'number') return p;
  const m = p.match(/^([A-Za-z]+)([+-][\d.]+)?$/);
  if (!m) throw new Error(`bad marker ${p}`);
  const base = CLIPS[clip].markers[m[1]];
  if (base === undefined) throw new Error(`unknown marker ${clip}.${m[1]}`);
  return base + (m[2] ? parseFloat(m[2]) : 0);
};

export type Shot =
  | { kind: 'clip'; clip: string; from: At; to: At; rate?: number; zoom?: Zoom[]; cap?: Cap; badge?: string }
  | { kind: 'title'; secs: number; kicker?: string; title: string; subtitle?: string }
  | { kind: 'reveal'; secs: number; light: string; dark: string; ox: number; oy: number; cap?: Cap; zoom?: Zoom[] }
  | { kind: 'outro'; secs: number; lines?: string[] };

export type Tr = 'fade' | 'slideL' | 'slideU' | 'wipe' | 'cut';
export type Edit = (Shot | Tr)[];

const TR_FRAMES = 18;

const frames = (s: Shot) => {
  if (s.kind === 'clip') return Math.round(((at(s.clip, s.to) - at(s.clip, s.from)) / (s.rate ?? 1)) * FPS);
  return Math.round(s.secs * FPS);
};

const render = (s: Shot, dur: number) => {
  switch (s.kind) {
    case 'title':
      return <TitleCard kicker={s.kicker} title={s.title} subtitle={s.subtitle} />;
    case 'outro':
      return <Outro lines={s.lines} />;
    case 'reveal':
      return (
        <>
          <Screen zoom={s.zoom}>
            <ThemeReveal light={s.light} dark={s.dark} ox={s.ox} oy={s.oy} />
          </Screen>
          {s.cap && <Caption {...s.cap} durationInFrames={dur} />}
        </>
      );
    case 'clip':
      return (
        <>
          <Screen zoom={s.zoom} badge={s.badge ?? (s.rate && s.rate > 2 ? `×${s.rate}` : undefined)}>
            <Footage clip={s.clip} from={at(s.clip, s.from)} rate={s.rate} />
          </Screen>
          {s.cap && <Caption {...s.cap} durationInFrames={dur} />}
        </>
      );
  }
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const presentation = (t: Tr): TransitionPresentation<any> => {
  switch (t) {
    case 'slideL':
      return slide({ direction: 'from-right' });
    case 'slideU':
      return slide({ direction: 'from-bottom' });
    case 'wipe':
      return wipe({ direction: 'from-left' });
    default:
      return fade();
  }
};

/** całkowita długość w klatkach, z uwzględnieniem nakładania przejść */
export const editLength = (e: Edit) =>
  e.reduce((n, x) => (typeof x === 'string' ? n - (x === 'cut' ? 0 : TR_FRAMES) : n + frames(x)), 0);

export const EditPlayer: React.FC<{ edit: Edit }> = ({ edit }) => (
  <AbsoluteFill style={{ background: '#05070d' }}>
    <TransitionSeries>
      {edit.map((x, i) => {
        if (typeof x === 'string') {
          if (x === 'cut') return null;
          return (
            <TransitionSeries.Transition
              key={i}
              presentation={presentation(x)}
              timing={x === 'fade' ? linearTiming({ durationInFrames: TR_FRAMES }) : springTiming({ config: { damping: 200 }, durationInFrames: TR_FRAMES })}
            />
          );
        }
        const d = frames(x);
        return (
          <TransitionSeries.Sequence key={i} durationInFrames={d}>
            {render(x, d)}
          </TransitionSeries.Sequence>
        );
      })}
    </TransitionSeries>
  </AbsoluteFill>
);
