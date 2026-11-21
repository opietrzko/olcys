import { useEffect, useRef } from 'react';
import cytoscape from 'cytoscape';
import type { AnalysisResult } from '@olcys/core';
import { short } from './ui';

const BAND_COLOR: Record<string, string> = {
  BARDZO_WYSOKIE: '#15803d',
  PRAWDOPODOBNE: '#22c55e',
  SREDNIE: '#eab308',
  NISKIE: '#fb923c',
  WYKLUCZONE: '#9ca3af',
};

/** Graf powiązań: podmiot → identyfikatory (pivot) → adresy (kolor = Wskaźnik Pewności). */
export function Graph({ result, onSelect }: { result: AnalysisResult; onSelect?: (key: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const idKey = (t: string, v: string) => `id:${t}:${v.toLowerCase()}`;
    const els: cytoscape.ElementDefinition[] = [{ data: { id: 'subject', label: 'Podmiot', kind: 'subject' } }];
    const evQuery = new Map(result.evidence.map((e) => [e.id, e.query]));
    for (const i of result.identities) {
      els.push({ data: { id: idKey(i.type, i.value), label: `${i.type}\n${short(i.value, 10)}`, kind: 'identity', strength: i.strength } });
      const parent = i.evidenceId ? evQuery.get(i.evidenceId) : undefined;
      els.push({ data: { id: `e:${i.type}:${i.value}`, source: parent ? idKey(parent.type, parent.value) : 'subject', target: idKey(i.type, i.value), label: i.strength === 'DIRECT' ? 'wejście' : 'pivot', strength: i.strength } });
    }
    for (const f of result.findings) {
      els.push({ data: { id: `a:${f.key}`, key: f.key, label: `${f.chain} ${short(f.address, 5)}\n${f.attribution.score}%`, kind: 'address', color: BAND_COLOR[f.attribution.band], gated: f.attribution.gated ? 1 : 0 } });
      const seen = new Set<string>();
      for (const o of f.occurrences) {
        const [t, ...rest] = (o.identityLink?.identity ?? '').split(':');
        const src = idKey(t, rest.join(':'));
        const edgeId = `o:${src}:${f.key}:${o.family}`;
        if (seen.has(edgeId) || !els.some((e) => e.data.id === src)) continue;
        seen.add(edgeId);
        els.push({ data: { id: edgeId, source: src, target: `a:${f.key}`, label: o.family.replace('mock:', ''), gated: f.attribution.gated ? 1 : 0, strength: o.identityLink?.strength } });
      }
    }
    const cy = cytoscape({
      container: ref.current,
      elements: els,
      wheelSensitivity: 0.25,
      style: [
        { selector: 'node', style: { label: 'data(label)', 'text-wrap': 'wrap', 'font-size': 10, 'text-valign': 'bottom', 'text-margin-y': 4, color: '#334155', width: 22, height: 22 } },
        { selector: 'node[kind="subject"]', style: { 'background-color': '#1e3a5f', width: 38, height: 38, 'font-weight': 'bold', 'font-size': 12 } },
        { selector: 'node[kind="identity"]', style: { 'background-color': '#60a5fa', shape: 'round-rectangle' } },
        { selector: 'node[kind="identity"][strength="PIVOT"]', style: { 'background-color': '#a5b4fc' } },
        { selector: 'node[kind="address"]', style: { 'background-color': 'data(color)', shape: 'diamond', width: 26, height: 26 } },
        { selector: 'node[gated=1]', style: { 'border-width': 2, 'border-style': 'dashed', 'border-color': '#6b7280', opacity: 0.75 } },
        { selector: 'edge', style: { width: 1.5, 'line-color': '#94a3b8', 'target-arrow-shape': 'triangle', 'target-arrow-color': '#94a3b8', 'curve-style': 'bezier', label: 'data(label)', 'font-size': 8, color: '#64748b', 'text-background-color': '#fff', 'text-background-opacity': 0.8 } },
        { selector: 'edge[gated=1]', style: { 'line-style': 'dashed', 'line-color': '#cbd5e1' } },
        { selector: 'edge[strength="WEAK"]', style: { 'line-style': 'dotted', 'line-color': '#f97316' } },
      ],
      layout: { name: 'cose', animate: false, nodeRepulsion: () => 24000, idealEdgeLength: () => 130, padding: 20 } as cytoscape.LayoutOptions,
    });
    cy.on('tap', 'node[kind="address"]', (e) => onSelect?.(e.target.data('key')));
    return () => cy.destroy();
  }, [result, onSelect]);
  return <div ref={ref} className="graph" />;
}
