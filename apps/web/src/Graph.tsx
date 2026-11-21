import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import cytoscape from 'cytoscape';
import type { AnalysisResult } from '@olcys/core';
import { Maximize, ZoomIn, ZoomOut } from 'lucide-react';
import { BAND_LABEL, ID_TYPE, ThemeCtx, short } from './ui';

const BAND_VAR: Record<string, [string, string]> = {
  BARDZO_WYSOKIE: ['--c4', '--c4-text'],
  PRAWDOPODOBNE: ['--c3', '--c3-text'],
  SREDNIE: ['--c2', '--c2-text'],
  NISKIE: ['--c1', '--c1-text'],
  WYKLUCZONE: ['--c0', '--c0-text'],
};

const COL_W = 250;
const ROW_H = 92;
const MIN_FIT_ZOOM = 0.7;

/** Dopasowanie do widoku, ale nie mniej niż 0,7 – przy dużych sprawach etykiety zostają czytelne, a widok zaczyna się od podmiotu. */
function fitClamped(cy: cytoscape.Core) {
  cy.fit(undefined, 48);
  if (cy.zoom() < MIN_FIT_ZOOM) {
    const s = cy.$id('subject');
    cy.zoom({ level: MIN_FIT_ZOOM, renderedPosition: s.nonempty() ? s.renderedPosition() : { x: 60, y: cy.height() / 2 } });
  }
  if (cy.zoom() > 1.6) cy.zoom({ level: 1.6, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } });
}

interface Props {
  result: AnalysisResult;
  selected: string | null;
  onSelect: (key: string | null) => void;
  hideExcluded: boolean;
}

/** Graf powiązań w układzie kolumnowym: podmiot → identyfikatory (wg głębokości pivotu) → adresy (wg Wskaźnika Pewności). */
export function Graph({ result, selected, onSelect, hideExcluded }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);
  const theme = useContext(ThemeCtx);
  // wąski kontener (telefon): kolumny stają się wierszami, graf czyta się z góry na dół
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setNarrow(el.clientWidth < 600));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const elements = useMemo(() => {
    const idKey = (t: string, v: string) => `id:${t}:${v.toLowerCase()}`;
    const els: cytoscape.ElementDefinition[] = [];
    const evQuery = new Map(result.evidence.map((e) => [e.id, e.query]));
    const findings = [...result.findings]
      .filter((f) => !hideExcluded || !(f.attribution.gated || f.attribution.score === 0))
      .sort((a, b) => Number(a.attribution.gated) - Number(b.attribution.gated) || b.attribution.score - a.attribution.score);
    const maxDepth = Math.max(0, ...result.identities.map((i) => i.depth ?? 0));
    const addrCol = maxDepth + 2;
    const cols = new Map<number, string[]>();
    const place = (col: number, id: string) => cols.set(col, [...(cols.get(col) ?? []), id]);

    els.push({ data: { id: 'subject', label: 'Podmiot', kind: 'subject' } });
    place(0, 'subject');
    const identities = [...result.identities].sort((a, b) => (a.depth ?? 0) - (b.depth ?? 0) || a.type.localeCompare(b.type));
    const idIds = new Set<string>();
    for (const i of identities) {
      const id = idKey(i.type, i.value);
      if (idIds.has(id)) continue;
      idIds.add(id);
      els.push({ data: { id, label: `${ID_TYPE[i.type]?.label ?? i.type}\n${short(i.value, 9)}`, kind: 'identity', strength: i.strength } });
      place((i.depth ?? 0) + 1, id);
      const parent = i.evidenceId ? evQuery.get(i.evidenceId) : undefined;
      const src = parent && idIds.has(idKey(parent.type, parent.value)) ? idKey(parent.type, parent.value) : 'subject';
      els.push({ data: { id: `e:${id}`, source: src, target: id, strength: i.strength } });
    }
    for (const f of findings) {
      const id = `a:${f.key}`;
      els.push({
        data: {
          id,
          key: f.key,
          label: `${f.chain} ${short(f.address, 5)}\n${f.attribution.score}% · ${BAND_LABEL[f.attribution.band]}`,
          kind: 'address',
          band: f.attribution.band,
          gated: f.attribution.gated || f.attribution.score === 0 ? 1 : 0,
        },
      });
      place(addrCol, id);
      const seen = new Set<string>();
      for (const o of f.occurrences) {
        const [t, ...rest] = (o.identityLink?.identity ?? '').split(':');
        const src = idKey(t, rest.join(':'));
        if (!idIds.has(src) || seen.has(src)) continue;
        seen.add(src);
        els.push({ data: { id: `o:${src}:${f.key}`, source: src, target: id, label: o.family, strength: o.identityLink?.strength, gated: f.attribution.gated ? 1 : 0 } });
      }
      if (!seen.size) {
        // adres podany na wejściu: krawędź od jego węzła-identyfikatora, a gdy go brak – od podmiotu
        const inputId = [...idIds].find((k) => k === idKey('address', f.address));
        els.push({ data: { id: `o:in:${f.key}`, source: inputId ?? 'subject', target: id, label: 'wejście', strength: 'DIRECT', gated: f.attribution.gated ? 1 : 0 } });
      }
    }
    const pos = new Map<string, { x: number; y: number }>();
    for (const [col, ids] of cols)
      ids.forEach((id, row) => {
        const off = row - (ids.length - 1) / 2;
        pos.set(id, narrow ? { x: off * 150, y: col * 150 } : { x: col * COL_W, y: off * ROW_H });
      });
    for (const e of els) if (!e.data.source) e.position = pos.get(e.data.id!) ?? { x: 0, y: 0 };
    return els;
  }, [result, hideExcluded, narrow]);

  useEffect(() => {
    if (!ref.current) return;
    const css = getComputedStyle(document.documentElement);
    const v = (n: string) => css.getPropertyValue(n).trim();
    const font = v('--sans') || 'sans-serif';
    const style: cytoscape.StylesheetJson = [
      { selector: 'node', style: { label: 'data(label)', 'text-wrap': 'wrap', 'font-family': font, 'font-size': 11, 'min-zoomed-font-size': 7, 'text-valign': 'bottom', 'text-halign': 'center', 'text-margin-y': 6, color: v('--text'), 'line-height': 1.3, 'transition-property': 'opacity', 'transition-duration': 150 } },
      { selector: 'node[kind="subject"]', style: { shape: 'ellipse', width: 40, height: 40, 'background-color': v('--text'), 'font-weight': 600, 'font-size': 12 } },
      { selector: 'node[kind="identity"]', style: { shape: 'round-rectangle', width: 26, height: 26, 'background-color': v('--surface'), 'border-width': 1.5, 'border-color': v('--text-2') } },
      { selector: 'node[kind="identity"][strength="PIVOT"]', style: { 'border-style': 'solid', 'background-color': v('--surface-3') } },
      { selector: 'node[kind="identity"][strength="WEAK"]', style: { 'border-style': 'dashed', 'border-color': v('--warn') } },
      { selector: 'node[kind="address"]', style: { shape: 'diamond', width: 30, height: 30, 'border-width': 1.5, 'border-color': v('--c3') } },
      ...Object.entries(BAND_VAR).map(([band, [bg]]) => ({ selector: `node[band="${band}"]`, style: { 'background-color': v(bg) } })),
      { selector: 'node[gated=1]', style: { 'border-style': 'dashed', 'border-color': v('--c0-border'), color: v('--text-3') } },
      { selector: 'node:selected, node.sel', style: { 'overlay-opacity': 0, 'border-width': 3, 'border-color': v('--accent'), 'border-style': 'solid' } },
      { selector: 'edge', style: { width: 1.5, 'line-color': v('--border-strong'), 'target-arrow-shape': 'triangle', 'target-arrow-color': v('--border-strong'), 'arrow-scale': 0.9, 'curve-style': 'bezier', label: 'data(label)', 'font-family': font, 'font-size': 10, color: v('--text-3'), 'text-background-color': v('--surface'), 'text-background-opacity': 1, 'text-background-padding': '2px', 'transition-property': 'opacity, line-color', 'transition-duration': 150 } },
      { selector: 'edge[gated=1]', style: { 'line-style': 'dashed' } },
      { selector: 'edge[strength="WEAK"]', style: { 'line-style': 'dotted', 'line-color': v('--warn'), 'target-arrow-color': v('--warn') } },
      { selector: 'edge[strength="MENTION"]', style: { 'line-style': 'dashed' } },
      { selector: 'edge.path', style: { width: 2.5, 'line-color': v('--accent'), 'target-arrow-color': v('--accent'), color: v('--accent'), 'z-index': 10 } },
      // przygaszenie poza ścieżką: kształty i linie bledną, etykiety zostają czytelne (WCAG AA)
      { selector: 'node.faded', style: { 'background-opacity': 0.25, 'border-opacity': 0.3, 'text-opacity': 0.9 } },
      { selector: 'edge.faded', style: { 'line-opacity': 0.2, 'text-opacity': 0 } },
    ];
    const cy = cytoscape({ container: ref.current, elements, style, layout: { name: 'preset', padding: 48 }, wheelSensitivity: 0.2, minZoom: 0.3, maxZoom: 2.5, boxSelectionEnabled: false, autoungrabify: false });
    cy.on('tap', 'node[kind="address"]', (e) => onSelect(e.target.data('key')));
    cy.on('tap', (e) => {
      if (e.target === cy) onSelect(null);
    });
    cy.on('mouseover', 'node[kind="address"]', () => ref.current && (ref.current.style.cursor = 'pointer'));
    cy.on('mouseout', 'node', () => ref.current && (ref.current.style.cursor = ''));
    fitClamped(cy);
    cyRef.current = cy;
    return () => {
      cy.destroy();
      cyRef.current = null;
    };
  }, [elements, theme, onSelect]);

  // Podświetlenie ścieżki dowodowej wybranego adresu: wszystkie węzły i krawędzie prowadzące od podmiotu
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.elements().removeClass('faded path sel');
    if (!selected) return;
    const n = cy.$id(`a:${selected}`);
    if (n.empty()) return;
    const path = n.predecessors().union(n);
    cy.elements().not(path).addClass('faded');
    path.edges().addClass('path');
    n.addClass('sel');
  }, [selected, elements, theme]);

  const zoom = (f: number) => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.zoom({ level: cy.zoom() * f, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } });
  };
  const addrCount = elements.filter((e) => e.data.kind === 'address').length;
  return (
    <div style={{ position: 'relative' }}>
      <div className="graph-zoom" style={{ position: 'absolute', right: 10, top: 10, zIndex: 2, display: 'flex', gap: 4 }}>
        <button type="button" className="btn sm icon-only" onClick={() => zoom(1.25)} aria-label="Przybliż" title="Przybliż">
          <ZoomIn size={14} aria-hidden="true" />
        </button>
        <button type="button" className="btn sm icon-only" onClick={() => zoom(0.8)} aria-label="Oddal" title="Oddal">
          <ZoomOut size={14} aria-hidden="true" />
        </button>
        <button type="button" className="btn sm icon-only" onClick={() => cyRef.current && fitClamped(cyRef.current)} aria-label="Dopasuj do widoku" title="Dopasuj do widoku">
          <Maximize size={14} aria-hidden="true" />
        </button>
      </div>
      <div ref={ref} className="graph" role="img" aria-label={`Graf powiązań: podmiot, ${result.identities.length} identyfikatorów i ${addrCount} adresów. Adres można też wybrać z listy nad grafem.`} />
    </div>
  );
}
