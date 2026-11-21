import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { AddressFinding, AnalysisResult, RunDiff, StatementKind } from '@olcys/core';
import {
  Activity,
  ArrowDownLeft,
  ArrowUpRight,
  Bell,
  Check,
  CircleDashed,
  Clock,
  Copy,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  Fingerprint,
  Flag,
  History,
  List,
  Minus,
  Network,
  Plus,
  ScrollText,
  ShieldCheck,
  TriangleAlert,
  Wallet,
} from 'lucide-react';
import { api, type Run } from './api';
import { Graph, identityNodeId } from './Graph';
import { NodeInspector } from './NodeInspector';
import { CATEGORY_LABEL, CopyButton, Empty, ID_TYPE, LINK_LABEL, Panel, Score, Stat, amount, dt, money, plural, short, Highlight } from './ui';

const KIND: Record<StatementKind, { label: string; cls: string }> = {
  FACT: { label: 'Fakt źródłowy', cls: 'fact' },
  COMPUTATION: { label: 'Wynik obliczenia', cls: 'calc' },
  CONCLUSION: { label: 'Wniosek do weryfikacji', cls: 'concl' },
};

type Tab = 'graf' | 'adresy' | 'ustalenia' | 'zrodla' | 'przebieg';

const flagsOf = (f: AddressFinding) => (f.activity?.indicators ?? []).filter((i) => i.type !== 'HIGH_VOLUME');
const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0');

export function RunView({ run, runs = [] }: { run: Run; runs?: Run[] }) {
  const r = run.result!;
  const [tab, setTab] = useState<Tab>('graf');
  const [selected, setSelected] = useState<string | null>(r.findings[0]?.key ?? null);
  // wybrany węzeł nie-adresowy (podmiot / tożsamość); wybór adresu go czyści i odwrotnie
  const [node, setNode] = useState<string | null>(null);
  const pickAddress = useCallback((k: string | null) => {
    setSelected(k);
    if (k) setNode(null);
  }, []);
  const pickNode = useCallback((id: string | null) => {
    setNode(id);
    if (id) setSelected(null);
  }, []);
  const [hideExcluded, setHideExcluded] = useState(false);
  const [diff, setDiff] = useState<RunDiff | null>(null);
  // przebiegi do porównania: zakończone, inne niż bieżący (domyślnie - poprzedni)
  const baseCandidates = useMemo(() => runs.filter((x) => x.status === 'done' && x.id !== run.id), [runs, run.id]);
  const [base, setBase] = useState<string>('');
  useEffect(() => {
    api
      .diff(run.id, base || undefined)
      .then((d) => setDiff(d.diff))
      .catch(() => setDiff(null));
  }, [run.id, base]);
  const baseRun = baseCandidates.find((x) => x.id === (base || diff?.baseRunId));
  const sel = r.findings.find((f) => f.key === selected);
  const hasDiff = diff && (diff.addedAddresses.length > 0 || diff.removedAddresses.length > 0 || diff.scoreChanges.length > 0 || diff.newIndicators.length > 0);

  const tabs: [Tab, string, typeof Network, number | null][] = [
    ['graf', 'Graf powiązań', Network, null],
    ['adresy', 'Adresy', Wallet, r.findings.length],
    ['ustalenia', 'Fakty, obliczenia, wnioski', ScrollText, r.statements.length],
    ['zrodla', 'Źródła', Fingerprint, r.evidence.length],
    ['przebieg', 'Przebieg i parametry', Activity, null],
  ];
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const onTabKey = (e: KeyboardEvent, i: number) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const n = (i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length;
    setTab(tabs[n][0]);
    tabRefs.current[n]?.focus();
  };

  return (
    <div className="run">
      <Pipeline r={r} />
      <SourceFailures r={r} />

      {hasDiff && (
        <Panel
          className="changes"
          title={
            <>
              <Bell size={15} aria-hidden="true" /> Zmiany względem {base ? 'przebiegu' : 'poprzedniego przebiegu'}
              {baseRun ? <span className="faint" style={{ fontWeight: 400 }}> · {dt(baseRun.startedAt)}</span> : null}
            </>
          }
          actions={<CompareSelect runs={baseCandidates} value={base} onChange={setBase} />}
        >
          <ul>
            {diff!.addedAddresses.map((a) => (
              <li key={a.key}>
                <Plus size={14} className="pos" aria-label="Nowy adres" /> Nowy adres <code>{a.key}</code> <span className="tag">{a.score}%</span>
              </li>
            ))}
            {diff!.removedAddresses.map((a) => (
              <li key={a.key}>
                <Minus size={14} className="neg" aria-label="Usunięty adres" /> Adres zniknął ze źródeł: <code>{a.key}</code>
              </li>
            ))}
            {diff!.scoreChanges.map((c) => (
              <li key={c.key}>
                <Activity size={14} aria-hidden="true" /> <code>{c.key}</code>: {c.from}% → {c.to}%
              </li>
            ))}
            {diff!.newIndicators.map((i) => (
              <li key={i.key + i.type}>
                <Flag size={14} className="danger-text" aria-hidden="true" /> {i.title}
              </li>
            ))}
            {diff!.newIdentities.map((i) => (
              <li key={i}>
                <Plus size={14} aria-hidden="true" /> Nowy identyfikator {i}
              </li>
            ))}
          </ul>
        </Panel>
      )}
      {diff && !hasDiff && (
        <p className="small faint" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <Check size={14} aria-hidden="true" /> Porównanie z {base ? 'wybranym' : 'poprzednim'} przebiegiem{baseRun ? ` (${dt(baseRun.startedAt)})` : ''}: brak zmian w adresach i wynikach.
          {baseCandidates.length > 1 && <CompareSelect runs={baseCandidates} value={base} onChange={setBase} />}
        </p>
      )}

      <div className="tabbar">
        <div className="tabs" role="tablist" aria-label="Widoki przebiegu">
          {tabs.map(([t, l, Icon, count], i) => (
            <button
              key={t}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              role="tab"
              id={`tab-${t}`}
              aria-controls={`pane-${t}`}
              aria-selected={tab === t}
              tabIndex={tab === t ? 0 : -1}
              onClick={() => setTab(t)}
              onKeyDown={(e) => onTabKey(e, i)}
            >
              <Icon size={15} aria-hidden="true" />
              {l}
              {count !== null && <span className="count num">{count}</span>}
            </button>
          ))}
        </div>
        <div className="actions">
          <a className="btn sm" href={`/api/runs/${run.id}/report.pdf`} target="_blank" rel="noreferrer" title="Raport PDF generowany z tego przebiegu - otwiera się w przeglądarce, można go pobrać">
            <FileText size={14} aria-hidden="true" /> Raport PDF
          </a>
          <a className="btn sm ghost" href={`/api/runs/${run.id}/export.json`} title="Pakiet dowodowy JSON: wynik, surowe dowody i parametry">
            <Download size={14} aria-hidden="true" /> Pakiet dowodowy
          </a>
        </div>
      </div>

      <div role="tabpanel" id={`pane-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'graf' && (
          <div className="graph-shell">
            <div className="graph-main">
              <div className="graph-toolbar">
                <label className="sr-only" htmlFor="graph-pick">
                  Wybierz węzeł grafu
                </label>
                <select
                  id="graph-pick"
                  value={node ? `n:${node}` : selected ? `a:${selected}` : ''}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (!v) {
                      pickAddress(null);
                      pickNode(null);
                    } else if (v.startsWith('a:')) pickAddress(v.slice(2));
                    else pickNode(v.slice(2));
                  }}
                  style={{ maxWidth: 320 }}
                >
                  <option value="">Wybierz węzeł…</option>
                  <option value="n:subject">Podmiot</option>
                  <optgroup label="Tożsamości">
                    {r.identities.map((i) => (
                      <option key={`${i.type}:${i.value}`} value={`n:${identityNodeId(i.type, i.value)}`}>
                        {ID_TYPE[i.type]?.label ?? i.type}: {short(i.value, 14)}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Adresy">
                    {r.findings.map((f) => (
                      <option key={f.key} value={`a:${f.key}`}>
                        {f.chain} {short(f.address, 6)} · {f.attribution.score}%
                      </option>
                    ))}
                  </optgroup>
                </select>
                <button type="button" className="btn sm" aria-pressed={hideExcluded} onClick={() => setHideExcluded((x) => !x)}>
                  {hideExcluded ? <Eye size={14} aria-hidden="true" /> : <EyeOff size={14} aria-hidden="true" />}
                  {hideExcluded ? 'Pokaż wykluczone' : 'Ukryj wykluczone'}
                </button>
                <span className="grow" />
                <span className="small faint graph-hint">Kliknij węzeł, aby zobaczyć szczegóły i jego powiązania</span>
              </div>
              {r.findings.length || r.identities.length ? (
                <Graph result={r} selected={selected} selectedNode={node} onSelect={pickAddress} onSelectNode={pickNode} hideExcluded={hideExcluded} />
              ) : (
                <Empty icon={Network} title="Brak powiązań do pokazania">
                  Źródła nie zwróciły tożsamości ani adresów. Spróbuj innego identyfikatora lub większej głębokości pivotowania.
                </Empty>
              )}
              <Legend />
            </div>
            <aside className="inspector" aria-label="Szczegóły wybranego węzła" aria-live="polite">
              {node ? (
                <NodeInspector r={r} nodeId={node} onSelectAddress={pickAddress} onSelectNode={pickNode} />
              ) : sel ? (
                <Inspector f={sel} findings={r.findings} onSelect={pickAddress} onOpen={() => setTab('adresy')} trace={r.trace} />
              ) : (
                <Empty icon={Network} title="Wybierz węzeł">
                  Kliknij podmiot, tożsamość lub adres w grafie albo wybierz węzeł z listy nad grafem. Dla tożsamości zobaczysz, skąd pochodzi i dokąd prowadzi; dla adresu wynik, reguły i cash-out.
                </Empty>
              )}
            </aside>
          </div>
        )}

        {tab === 'adresy' && (
          <div className="split">
            <div>
              <AddressList findings={r.findings} selected={selected} onSelect={setSelected} />
              {r.profileChanges.length > 0 && (
                <Panel
                  title={
                    <>
                      <History size={15} aria-hidden="true" /> Zmiany w czasie (archiwum)
                    </>
                  }
                >
                  {r.profileChanges.map((c, i) => (
                    <div key={i} style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                      <div className="small muted">
                        {short(c.url, 18)} · {c.from?.slice(0, 10)} → {c.to.slice(0, 10)}
                      </div>
                      {c.removed.map((x) => (
                        <div key={x} className="neg small mono">
                          − {short(x, 8)}
                        </div>
                      ))}
                      {c.added.map((x) => (
                        <div key={x} className="pos small mono">
                          + {short(x, 8)}
                        </div>
                      ))}
                    </div>
                  ))}
                </Panel>
              )}
            </div>
            <div>
              {sel ? (
                <AddressDetail f={sel} r={r} runId={run.id} />
              ) : (
                <Panel>
                  <Empty icon={Wallet} title="Nie wykryto adresów">
                    W zebranych dokumentach nie znaleziono adresów kryptowalutowych powiązanych z podmiotem.
                  </Empty>
                </Panel>
              )}
            </div>
          </div>
        )}

        {tab === 'ustalenia' && <Statements r={r} />}
        {tab === 'zrodla' && <Evidence r={r} runId={run.id} />}
        {tab === 'przebieg' && <Trace r={r} />}
      </div>
    </div>
  );
}

function Legend() {
  return (
    <div className="graph-legend" aria-label="Legenda">
      <span className="lg">
        <span className="lg-node" style={{ background: 'var(--text)' }} /> Podmiot
      </span>
      <span className="lg">
        <span className="lg-node sq" style={{ background: 'var(--surface)', border: '1.5px solid var(--text-2)' }} /> Identyfikator
      </span>
      <span className="lg">
        <span className="lg-node dia" style={{ background: 'var(--c4)' }} /> ≥80%
      </span>
      <span className="lg">
        <span className="lg-node dia" style={{ background: 'var(--c3)' }} /> 60-79%
      </span>
      <span className="lg">
        <span className="lg-node dia" style={{ background: 'var(--c2)' }} /> 40-59%
      </span>
      <span className="lg">
        <span className="lg-node dia" style={{ background: 'var(--c1)', border: '1px solid var(--c2)' }} /> &lt;40%
      </span>
      <span className="lg">
        <span className="lg-node dia" style={{ background: 'var(--c0)', border: '1px dashed var(--c0-border)' }} /> Wykluczony
      </span>
      <span className="lg">
        <span className="lg-node sq" style={{ background: 'var(--surface)', border: '1.5px dashed var(--warn)' }} /> Trop tymczasowy
      </span>
      <span className="lg">
        <span className="lg-line dot" /> Powiązanie słabe (homonim, niepotwierdzone)
      </span>
      <span className="lg">
        <span className="lg-line" style={{ borderColor: 'var(--accent)' }} /> Powiązania wybranego węzła
      </span>
    </div>
  );
}

function Inspector({ f, findings, onSelect, onOpen, trace }: { f: AddressFinding; findings: AddressFinding[]; onSelect: (k: string) => void; onOpen: () => void; trace?: AnalysisResult['trace'] }) {
  const flags = flagsOf(f);
  // powód braku danych blockchain zapisany w przebiegu (np. limit zapytań dostawcy)
  const chainIssue = trace?.find((t) => t.step === 'chain' && t.message.includes(f.key))?.message.replace(/^Uwaga: [^ ]+ - /, '');
  return (
    <div>
      <div className="detail-head" style={{ marginBottom: 6 }}>
        <span className="chain">{f.chain}</span>
        <span className="small muted">{CATEGORY_LABEL[f.classification.category]}</span>
        <CopyButton text={f.address} label="Kopiuj adres" />
      </div>
      <code className="addr-full inspector-addr">{f.address}</code>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, margin: '14px 0 4px', flexWrap: 'wrap' }}>
        <span className="score-big num">{f.attribution.score}%</span>
        <Score band={f.attribution.band} score={f.attribution.score} value={false} />
      </div>
      {f.classification.entity && <p className="small muted" style={{ marginTop: 8 }}>{f.classification.entity}</p>}
      <table className="rules-mini">
        <tbody>
          {f.attribution.rules
            .filter((x) => x.kind !== 'info')
            .slice(0, 6)
            .map((x, i) => (
              <tr key={i}>
                <td>{x.label}</td>
                <td className={`num ${x.delta < 0 ? 'neg' : ''}`} style={{ fontWeight: 600, paddingLeft: 10 }}>
                  {x.kind === 'gate' ? '→ 0%' : signed(x.delta)}
                </td>
              </tr>
            ))}
        </tbody>
      </table>
      <a href="#/metodyka" className="method-link">
        Jak liczony jest wynik?
      </a>
      <h4>Wyjście do fiat</h4>
      {flags.length > 0 ? (
        flags.map((i, n) => (
          <div key={n} className={`indicator sev-${i.severity} ${i.basis}`}>
            <Flag size={15} aria-hidden="true" />
            <span className="indicator-title">{i.title}</span>
          </div>
        ))
      ) : (
        <p className="small muted cashout-none">
          <CircleDashed size={14} aria-hidden="true" />
          {f.activity
            ? `Brak wskaźników cash-out · ${plural(f.activity.txCount, 'transakcja', 'transakcje', 'transakcji')}`
            : f.attribution.gated
              ? 'Adres wykluczony - aktywności nie pobierano'
              : chainIssue ?? 'Brak transakcji w blockchainie dla tego adresu'}
        </p>
      )}
      <p className="small muted" style={{ marginTop: 12 }}>
        {plural(f.occurrences.length, 'wystąpienie przypisane', 'wystąpienia przypisane', 'wystąpień przypisanych')} podmiotowi
        {f.foreignOccurrences.length ? `, ${f.foreignOccurrences.length} u obcych autorów` : ''}.
      </p>
      <button type="button" className="btn" style={{ width: '100%', marginTop: 4 }} onClick={onOpen}>
        <List size={15} aria-hidden="true" /> Pełne uzasadnienie i dowody
      </button>
      {findings.length > 1 && (
        <>
          <h4>Wszystkie adresy</h4>
          <ul className="rank">
            {findings.map((x) => (
              <li key={x.key}>
                <button type="button" aria-pressed={x.key === f.key} onClick={() => onSelect(x.key)}>
                  <span className="chain">{x.chain}</span>
                  <code>{short(x.address, 5)}</code>
                  {flagsOf(x).length > 0 && (
                    <span className="flag-count" title="Wskaźniki cash-out">
                      <Flag size={11} aria-hidden="true" /> {flagsOf(x).length}
                    </span>
                  )}
                  <Score band={x.attribution.band} score={x.attribution.score} label={false} />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}


function AddressList({ findings, selected, onSelect }: { findings: AddressFinding[]; selected: string | null; onSelect: (k: string) => void }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: KeyboardEvent, i: number) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const n = Math.min(findings.length - 1, Math.max(0, i + (e.key === 'ArrowDown' ? 1 : -1)));
    onSelect(findings[n].key);
    refs.current[n]?.focus();
  };
  if (!findings.length) return null;
  return (
    <Panel title={`Adresy (${findings.length})`} flush>
      <div className="addr-list" role="listbox" aria-label="Wykryte adresy">
        {findings.map((f, i) => {
          const flags = flagsOf(f).length;
          const gated = f.attribution.gated || f.attribution.score === 0;
          return (
            <button
              key={f.key}
              ref={(el) => {
                refs.current[i] = el;
              }}
              role="option"
              aria-selected={selected === f.key}
              tabIndex={selected === f.key || (!selected && i === 0) ? 0 : -1}
              className={`addr-row ${gated ? 'gated' : ''}`}
              onClick={() => onSelect(f.key)}
              onKeyDown={(e) => onKey(e, i)}
            >
              <div className="addr-top">
                <span className="chain">{f.chain}</span>
                <code className="addr-code">{short(f.address, 7)}</code>
                <Score band={f.attribution.band} score={f.attribution.score} label={false} />
              </div>
              <div className="addr-sub">
                <span>{CATEGORY_LABEL[f.classification.category]}</span>
                {f.classification.entity && <span className="faint">· {f.classification.entity}</span>}
                {flags > 0 && (
                  <span className="flag-count" title={`${flags} wskaźników cash-out`}>
                    <Flag size={12} aria-hidden="true" /> {flags}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </Panel>
  );
}

/** Zakres przeszukania: ile źródeł odpytano i ile stron pobrano (także gdy nic nie znaleziono). */
function coverage(r: AnalysisResult) {
  const queried = r.connectorsUsed.filter((c) => (c.queries ?? 0) > 0);
  const pages = r.egress.filter((e) => e.kind === 'page' && typeof e.status === 'number').length;
  return { sources: queried.length, sourceIds: queried.map((c) => c.id), pages };
}

/**
 * An empty result is only meaningful when the sources actually answered. If nothing was found and a source
 * failed (dropped connection, rate limit), say so - otherwise it reads as "this person publishes nothing".
 */
/** Optional sources that fail on every run without extra setup (Reddit keys, a SearXNG instance) - not a sign of a flaky run. */
const OPTIONAL_SOURCES = new Set(['reddit', 'search']);

function SourceFailures({ r }: { r: AnalysisResult }) {
  if (r.evidence.length > 0) return null;
  const failed = r.connectorsUsed.filter((c) => c.errors.length > 0 && !OPTIONAL_SOURCES.has(c.id));
  if (!failed.length) return null;
  return (
    <div className="banner warn" role="status">
      <TriangleAlert size={16} aria-hidden="true" />
      <span>
        Nie znaleziono śladów, ale część źródeł nie odpowiedziała poprawnie ({failed.map((c) => c.id).join(', ')}). Wynik może być niepełny: uruchom analizę ponownie. Szczegóły błędów są w zakładce „Przebieg i parametry”.
      </span>
    </div>
  );
}

type StepState = 'done' | 'empty' | 'skipped';
const STEP_STATE: Record<StepState, string> = { done: 'ukończono', empty: 'brak danych', skipped: 'pominięto' };

/** Etapy analizy w jednym pasku: każdy etap ma swój stan (ukończony / brak danych / pominięty) i kluczową liczbę. */
function Pipeline({ r }: { r: AnalysisResult }) {
  const occ = r.findings.reduce((s, f) => s + f.occurrences.length + f.foreignOccurrences.length, 0);
  const pivots = r.identities.filter((i) => i.strength === 'PIVOT').length;
  const cov = coverage(r);
  const strong = r.findings.filter((f) => !f.attribution.gated && f.attribution.score >= 60).length;
  const weaker = r.findings.filter((f) => !f.attribution.gated && f.attribution.score > 0 && f.attribution.score < 60).length;
  const rejected = r.findings.filter((f) => f.attribution.gated || f.attribution.score === 0).length;
  const checked = r.findings.filter((f) => f.activity);
  const tx = checked.reduce((s, f) => s + (f.activity?.txCount ?? 0), 0);
  const cashout = r.findings.reduce((s, f) => s + flagsOf(f).length, 0);
  const steps: { label: string; value: number; sub: string; state: StepState; tone?: 'accent' | 'danger' }[] = [
    { label: 'Wejście', value: r.input.length, sub: plural(r.input.length, 'identyfikator', 'identyfikatory', 'identyfikatorów'), state: 'done' },
    { label: 'Ślady OSINT', value: r.evidence.length, sub: r.evidence.length ? `${plural(r.evidence.length, 'dowód', 'dowody', 'dowodów')} · ${pivots} z pivotu · ${plural(cov.sources, 'źródło', 'źródła', 'źródeł')}` : `sprawdzono ${plural(cov.sources, 'źródło', 'źródła', 'źródeł')}, ${plural(cov.pages, 'stronę', 'strony', 'stron')}`, state: r.evidence.length ? 'done' : 'empty' },
    { label: 'Wykryte adresy', value: r.findings.length, sub: plural(occ, 'wystąpienie', 'wystąpienia', 'wystąpień'), state: r.findings.length ? 'done' : 'empty' },
    { label: 'Pewność ≥60%', value: strong, sub: `${weaker} o niższej pewności`, state: r.findings.length ? 'done' : 'empty', tone: strong ? 'accent' : undefined },
    { label: 'Odrzucone', value: rejected, sub: plural(rejected, 'fałszywe trafienie', 'fałszywe trafienia', 'fałszywych trafień'), state: r.findings.length ? 'done' : 'empty' },
    { label: 'Blockchain', value: checked.length, sub: checked.length ? `${plural(checked.length, 'adres', 'adresy', 'adresów')} · ${plural(tx, 'transakcja', 'transakcje', 'transakcji')}` : 'nie sprawdzano', state: checked.length ? 'done' : 'skipped' },
    { label: 'Cash-out', value: cashout, sub: checked.length ? plural(cashout, 'wskaźnik', 'wskaźniki', 'wskaźników') : 'brak danych blockchain', state: checked.length ? 'done' : 'skipped', tone: cashout ? 'danger' : undefined },
  ];
  return (
    <ol className="pipeline" aria-label="Etapy analizy">
      {steps.map((s) => (
        <li key={s.label} className={`st-${s.state}`}>
          <div className="step">
            {s.state === 'done' ? <Check size={13} aria-hidden="true" /> : <CircleDashed size={13} aria-hidden="true" />}
            {s.label}
            <span className="sr-only">: {STEP_STATE[s.state]}</span>
          </div>
          <div className={`val num ${s.tone ?? ''}`}>{s.state === 'skipped' ? '-' : s.value}</div>
          <div className="sub">{s.sub}</div>
        </li>
      ))}
    </ol>
  );
}

function AddressDetail({ f, r, runId }: { f: AddressFinding; r: AnalysisResult; runId: string }) {
  // transfery tokenów spoza rejestru (spam) są domyślnie ukryte w chronologii - pokazywane na żądanie
  const [showIgnored, setShowIgnored] = useState(false);
  const timeline = (f.activity?.timeline ?? []).filter((t) => showIgnored || t.verifiedAsset !== false);
  const maxAbs = Math.max(100, ...f.attribution.rules.map((x) => Math.abs(x.delta)));
  const ev = useMemo(() => new Map(r.evidence.map((e) => [e.id, e])), [r]);
  return (
    <div>
      <Panel
        title={
          <>
            <span className="chain">{f.chain}</span> <code className="addr-full">{f.address}</code>
          </>
        }
        actions={
          f.explorerUrl && (
            <a className="btn sm ghost" href={f.explorerUrl} target="_blank" rel="noreferrer">
              Eksplorator <ExternalLink size={13} aria-hidden="true" />
            </a>
          )
        }
      >
        <div className="score-hero">
          <span className="score-big num">{f.attribution.score}%</span>
          <div>
            <Score band={f.attribution.band} score={f.attribution.score} value={false} />
            <div style={{ marginTop: 4 }}>
              <b>{CATEGORY_LABEL[f.classification.category]}</b>
              {f.classification.entity ? <span className="muted"> - {f.classification.entity}</span> : ''}
            </div>
            <ul className="reasons">
              {f.classification.reasons.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </div>
        </div>
        <h4 className="rules-head">
          <span>
            Jak powstał wynik <span className="faint" style={{ fontWeight: 400 }}>· reguły {f.attribution.rulesVersion}</span>
          </span>
          <a href="#/metodyka" className="method-link" style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>
            Jak liczony jest wynik?
          </a>
        </h4>
        <table className="rules">
          <tbody>
            {f.attribution.rules.map((x, i) => (
              <tr key={i} className={`rule-${x.kind}`}>
                <td className="rule-name">
                  <b>{x.label}</b>
                  <div className="small muted" style={{ overflowWrap: 'anywhere' }}>
                    {x.premise}
                  </div>
                </td>
                <td className="rule-bar">
                  {x.kind !== 'gate' && x.delta !== 0 && (
                    <div className="bar-track">
                      <div className={`bar ${x.delta >= 0 ? 'plus' : 'minus'}`} style={{ width: `${(Math.abs(x.delta) / maxAbs) * 100}%` }} />
                    </div>
                  )}
                </td>
                <td className={`rule-delta num ${x.delta < 0 ? 'neg' : ''}`}>{x.kind === 'gate' ? '→ 0%' : signed(x.delta)}</td>
              </tr>
            ))}
            <tr className="rule-total">
              <td>Wskaźnik Pewności</td>
              <td />
              <td className="num">{f.attribution.score}%</td>
            </tr>
          </tbody>
        </table>
      </Panel>

      <Panel title={`Wystąpienia przypisane podmiotowi (${f.occurrences.length})`}>
        {f.occurrences.length === 0 && <p className="muted">Brak. Adres podany na wejściu albo publikowany wyłącznie przez obce osoby.</p>}
        {f.occurrences.map((o) => (
          <div key={o.id} className="occ">
            <div className="occ-head">
              <span className="tag outline">{o.family}</span>
              <span className="tag">{o.context.category}</span>
              {o.identityLink && <span className={`tag link-${o.identityLink.strength}`}>{LINK_LABEL[o.identityLink.strength] ?? o.identityLink.strength}</span>}
              {o.archivedAt && (
                <span className="tag warn">
                  <History size={12} aria-hidden="true" /> Archiwum {o.archivedAt.slice(0, 10)}
                </span>
              )}
              {o.extraction.deobfuscated && <span className="tag warn">Zapis zaciemniony</span>}
              {o.context.aiSuggestion && <span className="tag">AI: {o.context.aiSuggestion.category}</span>}
            </div>
            <blockquote className="quote">
              „<Highlight text={o.extraction.context} needle={o.extraction.raw} />”
            </blockquote>
            <div className="occ-meta">
              <span>
                Autor <b>{o.authorHandle}</b> ↔ {o.identityLink?.identity}
              </span>
              <span className="faint">{o.identityLink?.via}</span>
              <span>
                <Clock size={12} aria-hidden="true" style={{ verticalAlign: -2 }} /> {dt(o.publishedAt ?? o.fetchedAt)}
              </span>
              <a href={o.url} target="_blank" rel="noreferrer">
                Źródło <ExternalLink size={12} aria-hidden="true" />
              </a>
              <a href={`/api/runs/${runId}/evidence/${o.evidenceId}`} target="_blank" rel="noreferrer">
                <ShieldCheck size={12} aria-hidden="true" /> Kopia dowodu <span className="mono">{ev.get(o.evidenceId)?.sha256.slice(0, 10)}…</span>
              </a>
            </div>
          </div>
        ))}
        {f.foreignOccurrences.length > 0 && <p className="small muted">Ten sam adres publikują też inni autorzy: {[...new Set(f.foreignOccurrences.map((o) => o.authorHandle))].join(', ')}.</p>}
      </Panel>

      {f.activity && (
        <Panel
          title={
            <>
              <Activity size={15} aria-hidden="true" /> Aktywność w blockchainie <span className="faint" style={{ fontWeight: 400 }}>· {f.activity.dataSource}</span>
            </>
          }
        >
          <div className="stats compact">
            <Stat label="Transakcje" value={f.activity.txCount} />
            <Stat label="Wpływy (PLN)" value={money(f.activity.totalInPln)} />
            <Stat label="Wypływy (PLN)" value={money(f.activity.totalOutPln)} />
            <Stat label="Okres" value={`${f.activity.firstSeen?.slice(0, 10) ?? '-'} → ${f.activity.lastSeen?.slice(0, 10) ?? '-'}`} />
          </div>
          {f.activity.indicators.map((i, n) => (
            <div key={n} className={`indicator sev-${i.severity} ${i.basis}`}>
              <Flag size={15} aria-hidden="true" />
              <span className="indicator-title">
                {i.title} <span className={`kind ${i.basis === 'computed' ? 'calc' : 'concl'}`}>{i.basis === 'computed' ? 'Obliczenie' : 'Wniosek do weryfikacji'}</span>
              </span>
              <div className="small">{i.description}</div>
            </div>
          ))}
          <h4 style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            Chronologia przepływu środków
            {f.activity.ignoredTokenTransfers ? (
              <label className="small faint" style={{ fontWeight: 400, display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                <input type="checkbox" checked={showIgnored} onChange={(e) => setShowIgnored(e.target.checked)} />
                pokaż pominięte tokeny ({f.activity.ignoredTokenTransfers})
              </label>
            ) : null}
          </h4>
          {timeline.length ? (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Kierunek</th>
                    <th className="num">Kwota</th>
                    <th className="num">≈ PLN · kurs NBP</th>
                    <th>Kontrahent</th>
                  </tr>
                </thead>
                <tbody>
                  {timeline.map((t, i) => (
                    <tr key={i}>
                      <td className="num" style={{ textAlign: 'left', whiteSpace: 'nowrap' }}>
                        {t.timestamp.slice(0, 16).replace('T', ' ')}
                      </td>
                      <td>
                        <span className={`dir ${t.direction === 'IN' ? 'pos' : 'neg'}`}>
                          {t.direction === 'IN' ? <ArrowDownLeft size={14} aria-hidden="true" /> : <ArrowUpRight size={14} aria-hidden="true" />}
                          {t.direction === 'IN' ? 'Wpływ' : 'Wypływ'}
                        </span>
                      </td>
                      <td className="num" title={`${t.amount} ${t.asset}`}>
                        {amount(t.amount)} <span className="asset-sym">{t.asset}</span>
                        {t.network && <span className="faint small"> · {t.network}</span>}
                        {t.verifiedAsset === false && (
                          <div className="small neg" style={{ whiteSpace: 'normal' }} title={t.note}>
                            niezweryfikowany token - pominięty
                          </div>
                        )}
                      </td>
                      <td className="num" title={t.priceBasis === 'current' ? 'Cena krypto bieżąca (brak historii z dnia transakcji)' : t.priceBasis === 'peg' ? 'Stablecoin - parytet 1 USD' : t.priceBasis === 'historical' ? 'Cena krypto z dnia transakcji' : undefined}>
                        {t.pln === null || t.pln === undefined ? (t.usd === null ? '-' : money(t.usd * f.activity!.rates.usdPln)) : money(t.pln)}
                        {t.priceBasis === 'current' && <span className="faint">*</span>}
                        {t.nbp && (
                          <div className="small faint" title={`Tabela ${t.nbp.no} - ostatni dzień roboczy przed transakcją (art. 11a ust. 1 ustawy o PIT)`}>
                            {t.nbp.mid} z {t.nbp.date}
                          </div>
                        )}
                      </td>
                      <td>{t.counterpartyLabel ?? <code>{short(t.counterparty, 6)}</code>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="muted small">Brak transakcji w pobranym zakresie.</p>
          )}
          <p className="small faint" style={{ marginTop: 10, marginBottom: 0 }}>
            {f.activity.plnBasis ?? `Wartości według kursów: ${f.activity.rates.source} (${f.activity.rates.asOf}).`}
            {f.activity.timeline.some((t) => t.priceBasis === 'current') && ' * cena krypto bieżąca - brak notowania z dnia transakcji.'}
            {f.activity.ignoredTokenTransfers ? ` Pominięto ${f.activity.ignoredTokenTransfers} transferów tokenów spoza rejestru zweryfikowanych kontraktów (możliwy spam / fałszywe stablecoiny).` : ''}
            {f.activity.networks && f.activity.networks.length > 1 ? ` Sieci: ${f.activity.networks.join(', ')}.` : ''}
          </p>
        </Panel>
      )}
    </div>
  );
}

function CompareSelect({ runs, value, onChange }: { runs: Run[]; value: string; onChange: (v: string) => void }) {
  if (!runs.length) return null;
  return (
    <label className="small" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      Porównaj z
      <select value={value} onChange={(e) => onChange(e.target.value)} aria-label="Przebieg do porównania">
        <option value="">poprzednim przebiegiem</option>
        {runs.map((x) => (
          <option key={x.id} value={x.id}>
            {dt(x.startedAt)}
            {x.summary ? ` · ${x.summary.attributed}/${x.summary.addresses} adr.` : ''}
          </option>
        ))}
      </select>
    </label>
  );
}

function Statements({ r }: { r: AnalysisResult }) {
  const [kind, setKind] = useState<StatementKind | 'ALL'>('ALL');
  const list = r.statements.filter((s) => kind === 'ALL' || s.kind === kind);
  return (
    <Panel
      title="Fakty źródłowe, wyniki obliczeń i wnioski do weryfikacji"
      flush
      actions={
        <div className="seg" role="group" aria-label="Filtr rodzaju twierdzeń">
          <button type="button" aria-pressed={kind === 'ALL'} onClick={() => setKind('ALL')}>
            Wszystkie <span className="faint num">{r.statements.length}</span>
          </button>
          {(Object.keys(KIND) as StatementKind[]).map((k) => (
            <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}>
              {KIND[k].label} <span className="faint num">{r.statements.filter((s) => s.kind === k).length}</span>
            </button>
          ))}
        </div>
      }
    >
      {list.length ? (
        <ul className="statements">
          {list.map((s, i) => (
            <li key={i}>
              <span className={`kind ${KIND[s.kind].cls}`}>{KIND[s.kind].label}</span>
              <span>{s.text}</span>
            </li>
          ))}
        </ul>
      ) : (
        <Empty icon={ScrollText} title="Brak twierdzeń tego rodzaju" />
      )}
    </Panel>
  );
}

function Evidence({ r, runId }: { r: AnalysisResult; runId: string }) {
  return (
    <Panel title="Łańcuch dowodowy: każdy zasób z URL, czasem pobrania i sumą SHA-256" flush>
      {r.evidence.length ? (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Źródło</th>
                <th>Rodzaj</th>
                <th>Pobrano</th>
                <th>SHA-256</th>
                <th>
                  <span className="sr-only">Kopia</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {r.evidence.map((e) => (
                <tr key={e.id}>
                  <td>
                    <code className="small">{e.id}</code>
                  </td>
                  <td style={{ minWidth: 260 }}>
                    {e.title}
                    <div className="small faint" style={{ overflowWrap: 'anywhere' }}>
                      {e.url}
                      {e.archivedAt ? ` · wersja archiwalna z ${e.archivedAt.slice(0, 10)}` : ''}
                    </div>
                  </td>
                  <td>
                    <span className="tag">{e.sourceKind}</span>
                    <div className="small faint" style={{ marginTop: 2 }}>
                      {e.connector} / {e.family}
                    </div>
                  </td>
                  <td className="small muted" style={{ whiteSpace: 'nowrap' }}>
                    {dt(e.fetchedAt)}
                  </td>
                  <td>
                    <code className="small" title={e.sha256}>
                      {e.sha256.slice(0, 16)}…
                    </code>
                  </td>
                  <td>
                    <a className="btn sm ghost" href={`/api/runs/${runId}/evidence/${e.id}`} target="_blank" rel="noreferrer">
                      Kopia <ExternalLink size={12} aria-hidden="true" />
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty icon={Fingerprint} title="Brak śladów powiązanych z krypto">
          Sprawdzono {plural(coverage(r).sources, 'źródło', 'źródła', 'źródeł')} ({coverage(r).sourceIds.join(', ') || '-'}) i pobrano {plural(coverage(r).pages, 'stronę', 'strony', 'stron')} z wyników
          wyszukiwania. Żadne nie zawierało adresu kryptowalutowego ani identyfikatora powiązanego z podmiotem. Szczegóły zapytań i ewentualne błędy znajdziesz w zakładce „Przebieg i parametry”.
        </Empty>
      )}
    </Panel>
  );
}

function Trace({ r }: { r: AnalysisResult }) {
  const denied = r.egress.filter((e) => e.status === 'DENIED').length;
  return (
    <div className="grid2">
      <div>
        <Panel title="Parametry wyszukiwania">
          <table className="kv">
            <tbody>
              <tr>
                <td className="muted">Identyfikatory wejściowe</td>
                <td>{r.input.map((i) => `${i.type}: ${i.value}`).join(', ')}</td>
              </tr>
              {Object.entries(r.params).map(([k, v]) => (
                <tr key={k}>
                  <td className="muted">{k}</td>
                  <td>
                    <code className="small">{typeof v === 'object' ? JSON.stringify(v) : String(v)}</code>
                  </td>
                </tr>
              ))}
              <tr>
                <td className="muted">Wersje</td>
                <td>
                  {r.engineVersion} · {r.rulesVersion}
                </td>
              </tr>
            </tbody>
          </table>
        </Panel>
        <Panel title={`Tożsamości (${r.identities.length})`}>
          <table className="kv">
            <tbody>
              {r.identities.map((i) => (
                <tr key={i.type + i.value}>
                  <td>
                    <span className="muted">{i.type}:</span> <b style={{ overflowWrap: 'anywhere' }}>{i.value}</b>
                  </td>
                  <td>
                    <span className={`tag link-${i.strength}`}>{LINK_LABEL[i.strength] ?? i.strength}</span>
                    <div className="small faint" style={{ marginTop: 2 }}>
                      {i.via}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>
      <div>
        <Panel title="Przebieg analizy">
          <ol className="trace">
            {r.trace.map((t, i) => (
              <li key={i}>
                <span className="tag mono" style={{ justifySelf: 'start' }}>
                  {t.step}
                </span>
                <span>{t.message}</span>
              </li>
            ))}
          </ol>
        </Panel>
        <Panel title={`Ruch wychodzący (${r.egress.length}${denied ? `, ${plural(denied, "zablokowane", "zablokowane", "zablokowanych")}` : "" })`}>
          <ul className="egress">
            {r.egress.map((e, i) => (
              <li key={i} className={e.status === 'DENIED' ? 'warn-text' : ''}>
                <span>{e.status === 'DENIED' ? 'ZABLOK.' : e.status}</span>
                <span>{e.url}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
