import { useMemo, useState } from 'react';
import type { FlowBucket, FlowMap as Flows } from '@olcys/core';
import { money, plural } from './ui';

/**
 * Mapa przepływów (Sankey): wpływy według kategorii kontrahenta → badany adres → wypływy.
 * Grubość pasma = wartość w PLN. Wypływy do giełd, bramek fiat i P2P są wyróżnione jako możliwe wyjście do fiat.
 * Kliknięcie pasma filtruje chronologię przepływu do tej kategorii.
 */

export type FlowSelection = { direction: 'IN' | 'OUT'; category: FlowBucket['category'] } | null;

const W = 760;
const NODE = 12;
const LEFT_X = 168;
const RIGHT_X = W - 168 - NODE;
const MID_X = (W - NODE) / 2;
const SCALE_H = 200; // wysokość węzła środkowego (największa suma)
const ROW_MIN = 40;
const GAP = 10;
const MIN_NODE = 3;

const tone = (b: FlowBucket) => (b.cashOut ? 'cash' : b.category === 'UNLABELED' ? 'plain' : 'known');

interface Placed {
  b: FlowBucket;
  y: number; // górna krawędź węzła
  h: number;
  my: number; // górna krawędź pasma przy węźle środkowym
}

export function FlowMap({ flows, selected, onSelect }: { flows: Flows; selected: FlowSelection; onSelect: (s: FlowSelection) => void }) {
  const [hover, setHover] = useState<string | null>(null);
  const layout = useMemo(() => {
    const max = Math.max(flows.totalInPln, flows.totalOutPln, 1);
    const hOf = (b: FlowBucket) => Math.max(MIN_NODE, (b.pln / max) * SCALE_H);
    const place = (bs: FlowBucket[]) => {
      let y = 0;
      return bs.map((b) => {
        const h = hOf(b);
        const row = Math.max(ROW_MIN, h);
        const p = { b, y: y + (row - h) / 2, h, my: 0 };
        y += row + GAP;
        return p;
      });
    };
    const ins = place(flows.inflows);
    const outs = place(flows.outflows);
    const colH = (ps: Placed[]) => (ps.length ? ps[ps.length - 1].y + ps[ps.length - 1].h : 0);
    const height = Math.max(colH(ins), colH(outs), SCALE_H) + 16;
    // wyśrodkowanie kolumn i węzła środkowego
    const shift = (ps: Placed[]) => {
      const off = (height - colH(ps)) / 2;
      ps.forEach((p) => (p.y += off));
    };
    shift(ins);
    shift(outs);
    const inH = ins.reduce((s, p) => s + p.h, 0);
    const outH = outs.reduce((s, p) => s + p.h, 0);
    const midH = Math.max(inH, outH, MIN_NODE);
    const midY = (height - midH) / 2;
    let a = midY + (midH - inH) / 2;
    ins.forEach((p) => ((p.my = a), (a += p.h)));
    let c = midY + (midH - outH) / 2;
    outs.forEach((p) => ((p.my = c), (c += p.h)));
    return { ins, outs, height, midY, midH };
  }, [flows]);

  const keyOf = (b: FlowBucket) => `${b.direction}:${b.category}`;
  const isSel = (b: FlowBucket) => selected?.direction === b.direction && selected.category === b.category;
  const toggle = (b: FlowBucket) => onSelect(isSel(b) ? null : { direction: b.direction, category: b.category });
  const dimmed = (b: FlowBucket) => (selected ? !isSel(b) : hover !== null && hover !== keyOf(b));

  const band = (x0: number, y0: number, x1: number, y1: number, h: number) => {
    const mx = (x0 + x1) / 2;
    return `M${x0},${y0} C${mx},${y0} ${mx},${y1} ${x1},${y1} L${x1},${y1 + h} C${mx},${y1 + h} ${mx},${y0 + h} ${x0},${y0 + h} Z`;
  };

  const focus = layout.ins.concat(layout.outs).find((p) => keyOf(p.b) === hover)?.b ?? layout.ins.concat(layout.outs).find((p) => isSel(p.b))?.b;

  const label = (p: Placed, side: 'L' | 'R') => {
    const x = side === 'L' ? LEFT_X - 8 : RIGHT_X + NODE + 8;
    const anchor = side === 'L' ? 'end' : 'start';
    const cy = p.y + p.h / 2;
    return (
      <text x={x} y={cy} textAnchor={anchor} className="flow-label">
        <tspan x={x} dy="-0.25em" className="flow-name">
          {p.b.label}
        </tspan>
        <tspan x={x} dy="1.25em" className={`flow-sum ${p.b.cashOut ? 'cash' : ''}`}>
          {money(p.b.pln)} zł · {plural(p.b.txCount, 'tx', 'tx', 'tx')}
        </tspan>
      </text>
    );
  };

  const item = (p: Placed, side: 'L' | 'R') => {
    const b = p.b;
    const k = keyOf(b);
    const nodeX = side === 'L' ? LEFT_X : RIGHT_X;
    const path = side === 'L' ? band(LEFT_X + NODE, p.y, MID_X, p.my, p.h) : band(MID_X + NODE, p.my, RIGHT_X, p.y, p.h);
    return (
      <g
        key={k}
        className={`flow-item ${tone(b)} ${dimmed(b) ? 'dim' : ''} ${isSel(b) ? 'sel' : ''}`}
        onMouseEnter={() => setHover(k)}
        onMouseLeave={() => setHover(null)}
        onClick={() => toggle(b)}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), toggle(b))}
        tabIndex={0}
        role="button"
        aria-pressed={isSel(b)}
        aria-label={`${b.direction === 'IN' ? 'Wpływy z kategorii' : 'Wypływy do kategorii'} ${b.label}: ${money(b.pln)} zł, ${plural(b.counterpartyCount, 'kontrahent', 'kontrahentów', 'kontrahentów')}${b.cashOut ? ', możliwe wyjście do fiat' : ''}. Kliknij, aby przefiltrować chronologię.`}
      >
        <path d={path} className="flow-band" />
        <rect x={nodeX} y={p.y} width={NODE} height={p.h} rx={2} className="flow-node" />
        {label(p, side)}
      </g>
    );
  };

  return (
    <div className="flowmap">
      <svg viewBox={`0 0 ${W} ${layout.height}`} role="group" aria-label="Mapa przepływów środków: wpływy, badany adres, wypływy">
        <text x={LEFT_X + NODE} y={10} textAnchor="end" className="flow-head">
          Skąd · {money(flows.totalInPln)} zł
        </text>
        <text x={RIGHT_X} y={10} className="flow-head">
          Dokąd · {money(flows.totalOutPln)} zł
        </text>
        {layout.ins.map((p) => item(p, 'L'))}
        {layout.outs.map((p) => item(p, 'R'))}
        <rect x={MID_X} y={layout.midY} width={NODE} height={layout.midH} rx={2} className="flow-mid" />
      </svg>
      <div className="flow-detail small" aria-live="polite">
        {focus ? (
          <>
            <b>
              {focus.direction === 'IN' ? 'Wpływy z: ' : 'Wypływy do: '}
              {focus.label}
            </b>{' '}
            · {money(focus.pln)} zł · {plural(focus.counterpartyCount, 'kontrahent', 'kontrahentów', 'kontrahentów')}
            {focus.cashOut && <span className="kind concl" style={{ marginLeft: 8 }}>możliwe wyjście do fiat</span>}
            <ul>
              {focus.top.map((c) => (
                <li key={c.address}>
                  {c.label ?? <code>{c.address.slice(0, 8)}…{c.address.slice(-6)}</code>} – {money(c.pln)} zł ({plural(c.txCount, 'transakcja', 'transakcje', 'transakcji')})
                </li>
              ))}
              {focus.counterpartyCount > focus.top.length && <li className="faint">i {focus.counterpartyCount - focus.top.length} innych</li>}
            </ul>
          </>
        ) : (
          <span className="faint">
            Najedź na pasmo, aby zobaczyć kontrahentów; kliknij, aby przefiltrować chronologię poniżej. Na czerwono: wypływy do giełd, bramek krypto-fiat i usług P2P
            {flows.cashOutPln > 0 ? ` (łącznie ${money(flows.cashOutPln)} zł)` : ''}.
          </span>
        )}
      </div>
    </div>
  );
}

/** Kategoria wykresu dla kategorii etykiety kontrahenta – ta sama reguła co flowCategory w @olcys/core. */
export function flowCategoryOf(category: string | undefined): FlowBucket['category'] {
  switch (category) {
    case 'CEX':
    case 'CUSTODIAL':
      return 'CEX';
    case 'OFFRAMP':
      return 'OFFRAMP';
    case 'P2P_SERVICE':
      return 'P2P';
    case 'DEX':
      return 'DEX';
    case 'BRIDGE':
      return 'BRIDGE';
    case 'MIXER':
    case 'SANCTIONED':
      return 'MIXER';
    case 'SMART_CONTRACT':
    case 'TOKEN_CONTRACT':
      return 'CONTRACT';
    case 'CHARITY':
      return 'CHARITY';
    default:
      return 'UNLABELED';
  }
}
