import { useEffect, useMemo, useState } from 'react';
import type { AddressFinding, AnalysisResult, RunDiff, StatementKind } from '@olcys/core';
import { api, type Run } from './api';
import { Graph } from './Graph';
import { Band, CATEGORY_LABEL, Card, Highlight, Stat, dt, money, short } from './ui';

const KIND: Record<StatementKind, { label: string; cls: string }> = {
  FACT: { label: 'Fakt źródłowy', cls: 'fact' },
  COMPUTATION: { label: 'Wynik obliczenia', cls: 'calc' },
  CONCLUSION: { label: 'Wniosek do weryfikacji', cls: 'concl' },
};

type Tab = 'adresy' | 'graf' | 'ustalenia' | 'zrodla' | 'przebieg';

export function RunView({ run }: { run: Run }) {
  const r = run.result!;
  const [tab, setTab] = useState<Tab>('adresy');
  const [selected, setSelected] = useState<string | null>(r.findings[0]?.key ?? null);
  const [diff, setDiff] = useState<RunDiff | null>(null);
  useEffect(() => {
    api.diff(run.id).then((d) => setDiff(d.diff)).catch(() => setDiff(null));
  }, [run.id]);
  const attributed = r.findings.filter((f) => !f.attribution.gated && f.attribution.score > 0);
  const rejected = r.findings.filter((f) => f.attribution.gated || f.attribution.score === 0);
  const indicators = r.findings.flatMap((f) => (f.activity?.indicators ?? []).filter((i) => i.type !== 'HIGH_VOLUME'));
  const sel = r.findings.find((f) => f.key === selected);

  return (
    <div className="run">
      <Stepper r={r} />
      <div className="stats">
        <Stat label="Adresy ≥60% (przypisane)" value={r.findings.filter((f) => !f.attribution.gated && f.attribution.score >= 60).length} tone="good" />
        <Stat label="Niska / średnia pewność" value={attributed.filter((f) => f.attribution.score < 60).length} tone="warn" />
        <Stat label="Odrzucone fałszywe trafienia" value={rejected.length} tone="muted" />
        <Stat label="Wskaźniki wyjścia do fiat" value={indicators.length} tone="bad" />
        <Stat label="Tożsamości (w tym pivot)" value={r.identities.length} />
        <Stat label="Dowody (SHA-256)" value={r.evidence.length} />
      </div>

      {diff && (diff.addedAddresses.length > 0 || diff.removedAddresses.length > 0 || diff.scoreChanges.length > 0 || diff.newIndicators.length > 0) && (
        <Card title="🔔 Zmiany względem poprzedniego przebiegu" className="diff">
          <ul>
            {diff.addedAddresses.map((a) => (
              <li key={a.key}>
                ➕ Nowy adres <code>{a.key}</code> – {a.score}%
              </li>
            ))}
            {diff.removedAddresses.map((a) => (
              <li key={a.key}>
                ➖ Adres zniknął ze źródeł: <code>{a.key}</code>
              </li>
            ))}
            {diff.scoreChanges.map((c) => (
              <li key={c.key}>
                ↕ <code>{c.key}</code>: {c.from}% → {c.to}%
              </li>
            ))}
            {diff.newIndicators.map((i) => (
              <li key={i.key + i.type}>⚑ {i.title}</li>
            ))}
            {diff.newIdentities.map((i) => (
              <li key={i}>👤 Nowy identyfikator {i}</li>
            ))}
          </ul>
        </Card>
      )}
      {diff && !diff.addedAddresses.length && !diff.removedAddresses.length && !diff.scoreChanges.length && (
        <p className="muted small">Porównanie z poprzednim przebiegiem: brak zmian w adresach i wynikach.</p>
      )}

      <nav className="tabs">
        {(
          [
            ['adresy', `Adresy (${r.findings.length})`],
            ['graf', 'Graf powiązań'],
            ['ustalenia', 'Fakty / obliczenia / wnioski'],
            ['zrodla', `Źródła (${r.evidence.length})`],
            ['przebieg', 'Przebieg i parametry'],
          ] as [Tab, string][]
        ).map(([t, l]) => (
          <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
            {l}
          </button>
        ))}
        <span className="spacer" />
        <a className="btn" href={`/api/runs/${run.id}/report.html`} target="_blank" rel="noreferrer">
          📄 Raport (druk / PDF)
        </a>
        <a className="btn ghost" href={`/api/runs/${run.id}/export.json`}>
          ⬇ Pakiet dowodowy JSON
        </a>
      </nav>

      {tab === 'adresy' && (
        <div className="split">
          <div className="list">
            {r.findings.map((f) => (
              <button key={f.key} className={`addr-row ${selected === f.key ? 'sel' : ''} ${f.attribution.gated ? 'gated' : ''}`} onClick={() => setSelected(f.key)}>
                <div className="addr-top">
                  <span className="chain">{f.chain}</span>
                  <code>{short(f.address, 7)}</code>
                  <Band band={f.attribution.band} score={f.attribution.score} />
                </div>
                <div className="addr-sub">
                  {CATEGORY_LABEL[f.classification.category]}
                  {f.classification.entity ? ` · ${f.classification.entity}` : ''}
                  {f.activity?.indicators.filter((i) => i.type !== 'HIGH_VOLUME').length ? ` · ⚑ ${f.activity.indicators.filter((i) => i.type !== 'HIGH_VOLUME').length}` : ''}
                </div>
              </button>
            ))}
            {r.profileChanges.length > 0 && (
              <Card title="⏳ Zmiany w czasie (archiwum)">
                {r.profileChanges.map((c, i) => (
                  <div key={i} className="change">
                    <div className="muted small">
                      {short(c.url, 18)} · {c.from?.slice(0, 10)} → {c.to.slice(0, 10)}
                    </div>
                    {c.removed.map((x) => (
                      <div key={x} className="neg small">
                        − {short(x, 8)}
                      </div>
                    ))}
                    {c.added.map((x) => (
                      <div key={x} className="pos small">
                        + {short(x, 8)}
                      </div>
                    ))}
                  </div>
                ))}
              </Card>
            )}
          </div>
          <div className="detail">{sel ? <AddressDetail f={sel} r={r} runId={run.id} /> : <p>Wybierz adres.</p>}</div>
        </div>
      )}

      {tab === 'graf' && (
        <Card title="Graf powiązań: podmiot → identyfikatory → adresy" actions={<Legend />}>
          <Graph
            result={r}
            onSelect={(k) => {
              setSelected(k);
              setTab('adresy');
            }}
          />
        </Card>
      )}

      {tab === 'ustalenia' && <Statements r={r} />}
      {tab === 'zrodla' && <Evidence r={r} runId={run.id} />}
      {tab === 'przebieg' && <Trace r={r} />}
    </div>
  );
}

function Legend() {
  return (
    <span className="legend small">
      <span className="dot" style={{ background: '#15803d' }} /> ≥80% <span className="dot" style={{ background: '#22c55e' }} /> 60–79% <span className="dot" style={{ background: '#eab308' }} /> 40–59% <span className="dot" style={{ background: '#fb923c' }} /> &lt;40% <span className="dot" style={{ background: '#9ca3af' }} /> wykluczone · kropkowana linia = homonim
    </span>
  );
}

function Stepper({ r }: { r: AnalysisResult }) {
  const occ = r.findings.reduce((s, f) => s + f.occurrences.length + f.foreignOccurrences.length, 0);
  const steps = [
    ['Dane wejściowe', `${r.input.length} identyf.`],
    ['Ślady OSINT', `${r.evidence.length} dokumentów · ${r.identities.filter((i) => i.strength === 'PIVOT').length} pivot`],
    ['Wykrycie adresów', `${occ} wystąpień · ${r.findings.length} adresów`],
    ['Wskaźnik Pewności', `maks. ${Math.max(0, ...r.findings.map((f) => f.attribution.score))}%`],
    ['Odrzucenie błędnych', `${r.findings.filter((f) => f.attribution.gated || f.attribution.score === 0).length} odrzuconych`],
    ['Aktywność blockchain', `${r.findings.filter((f) => f.activity).length} adresów · ${r.findings.reduce((s, f) => s + (f.activity?.indicators.length ?? 0), 0)} wskaźn.`],
    ['Źródła i raport', `${r.statements.length} twierdzeń`],
  ];
  return (
    <ol className="stepper">
      {steps.map(([t, d], i) => (
        <li key={t}>
          <span className="num">{i + 1}</span>
          <div>
            <b>{t}</b>
            <div className="small muted">{d}</div>
          </div>
        </li>
      ))}
    </ol>
  );
}

function AddressDetail({ f, r, runId }: { f: AddressFinding; r: AnalysisResult; runId: string }) {
  const maxAbs = Math.max(100, ...f.attribution.rules.map((x) => Math.abs(x.delta)));
  const ev = useMemo(() => new Map(r.evidence.map((e) => [e.id, e])), [r]);
  return (
    <div>
      <Card
        title={
          <>
            <span className="chain">{f.chain}</span> <code className="addr-full">{f.address}</code>
          </>
        }
        actions={f.explorerUrl && <a href={f.explorerUrl} target="_blank" rel="noreferrer">eksplorator ↗</a>}
      >
        <div className="score-head">
          <div className={`score-big band-${f.attribution.band}`}>{f.attribution.score}%</div>
          <div>
            <Band band={f.attribution.band} />
            <div className="small">
              <b>{CATEGORY_LABEL[f.classification.category]}</b>
              {f.classification.entity ? ` – ${f.classification.entity}` : ''}
            </div>
            <ul className="reasons small">
              {f.classification.reasons.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </div>
        </div>
        <h4>Jak powstał wynik (reguły {f.attribution.rulesVersion})</h4>
        <table className="rules">
          <tbody>
            {f.attribution.rules.map((x, i) => (
              <tr key={i} className={`rule-${x.kind}`}>
                <td className="rule-name">
                  <b>{x.label}</b>
                  <div className="small muted">{x.premise}</div>
                </td>
                <td className="rule-bar">
                  <div className={`bar ${x.delta >= 0 ? 'plus' : 'minus'}`} style={{ width: `${(Math.abs(x.delta) / maxAbs) * 100}%` }} />
                </td>
                <td className={`rule-delta ${x.delta >= 0 ? 'pos' : 'neg'}`}>{x.kind === 'gate' ? '→ 0%' : `${x.delta >= 0 ? '+' : ''}${x.delta}`}</td>
              </tr>
            ))}
            <tr className="rule-total">
              <td>
                <b>Wskaźnik Pewności</b>
              </td>
              <td />
              <td>
                <b>{f.attribution.score}%</b>
              </td>
            </tr>
          </tbody>
        </table>
      </Card>

      <Card title={`Wystąpienia przypisane podmiotowi (${f.occurrences.length})`}>
        {f.occurrences.length === 0 && <p className="muted">Brak – adres podany na wejściu lub publikowany wyłącznie przez obce osoby.</p>}
        {f.occurrences.map((o) => (
          <div key={o.id} className="occ">
            <div className="occ-head">
              <span className="pill">{o.family.replace('mock:', '')}</span>
              <span className="pill ghost">{o.context.category}</span>
              <span className={`pill link-${o.identityLink?.strength}`}>{o.identityLink?.strength}</span>
              {o.archivedAt && <span className="pill warn">archiwum {o.archivedAt.slice(0, 10)}</span>}
              {o.extraction.deobfuscated && <span className="pill warn">zapis zaciemniony</span>}
              {o.context.aiSuggestion && <span className="pill ai">AI: {o.context.aiSuggestion.category}</span>}
            </div>
            <blockquote>
              „<Highlight text={o.extraction.context} needle={o.extraction.raw} />”
            </blockquote>
            <div className="small muted">
              autor <b>{o.authorHandle}</b> ↔ {o.identityLink?.identity} ({o.identityLink?.via}) · {dt(o.publishedAt ?? o.fetchedAt)} ·{' '}
              <a href={o.url} target="_blank" rel="noreferrer">
                źródło
              </a>{' '}
              ·{' '}
              <a href={`/api/runs/${runId}/evidence/${o.evidenceId}`} target="_blank" rel="noreferrer">
                kopia dowodu ({ev.get(o.evidenceId)?.sha256.slice(0, 10)}…)
              </a>
            </div>
          </div>
        ))}
        {f.foreignOccurrences.length > 0 && (
          <p className="small muted">
            Ten sam adres publikują też inni autorzy: {[...new Set(f.foreignOccurrences.map((o) => o.authorHandle))].join(', ')}.
          </p>
        )}
      </Card>

      {f.activity && (
        <Card title={`Aktywność w blockchainie · ${f.activity.dataSource}`}>
          <div className="stats small-stats">
            <Stat label="Transakcje" value={f.activity.txCount} />
            <Stat label="Wpływy (PLN)" value={money(f.activity.totalInPln)} />
            <Stat label="Wypływy (PLN)" value={money(f.activity.totalOutPln)} />
            <Stat label="Okres" value={`${f.activity.firstSeen?.slice(0, 10) ?? '—'} → ${f.activity.lastSeen?.slice(0, 10) ?? '—'}`} />
          </div>
          {f.activity.indicators.map((i, n) => (
            <div key={n} className={`indicator sev-${i.severity} ${i.basis}`}>
              <b>⚑ {i.title}</b> <span className="pill ghost">{i.basis === 'computed' ? 'obliczenie' : 'wniosek do weryfikacji'}</span>
              <div className="small">{i.description}</div>
            </div>
          ))}
          <h4>Chronologia przepływu środków</h4>
          <table className="timeline">
            <thead>
              <tr>
                <th>Data</th>
                <th />
                <th>Kwota</th>
                <th>≈ PLN</th>
                <th>Kontrahent</th>
              </tr>
            </thead>
            <tbody>
              {f.activity.timeline.map((t, i) => (
                <tr key={i}>
                  <td>{t.timestamp.slice(0, 16).replace('T', ' ')}</td>
                  <td className={t.direction === 'IN' ? 'pos' : 'neg'}>{t.direction === 'IN' ? '⬇ wpływ' : '⬆ wypływ'}</td>
                  <td>
                    {t.amount} {t.asset}
                  </td>
                  <td>{t.usd === null ? '—' : money(t.usd * f.activity!.rates.usdPln)}</td>
                  <td>{t.counterpartyLabel ?? <code>{short(t.counterparty, 6)}</code>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="small muted">Wartości wg kursów: {f.activity.rates.source} ({f.activity.rates.asOf}).</p>
        </Card>
      )}
    </div>
  );
}

function Statements({ r }: { r: AnalysisResult }) {
  const [kind, setKind] = useState<StatementKind | 'ALL'>('ALL');
  const list = r.statements.filter((s) => kind === 'ALL' || s.kind === kind);
  return (
    <Card
      title="Rozróżnienie: fakty źródłowe · wyniki obliczeń · wnioski wymagające weryfikacji"
      actions={
        <select value={kind} onChange={(e) => setKind(e.target.value as StatementKind | 'ALL')}>
          <option value="ALL">Wszystkie ({r.statements.length})</option>
          {(Object.keys(KIND) as StatementKind[]).map((k) => (
            <option key={k} value={k}>
              {KIND[k].label} ({r.statements.filter((s) => s.kind === k).length})
            </option>
          ))}
        </select>
      }
    >
      <ul className="statements">
        {list.map((s, i) => (
          <li key={i} className={KIND[s.kind].cls}>
            <span className="kind">{KIND[s.kind].label}</span> {s.text}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Evidence({ r, runId }: { r: AnalysisResult; runId: string }) {
  return (
    <Card title="Łańcuch dowodowy – każdy zasób z URL, czasem pobrania i sumą SHA-256">
      <table className="evidence">
        <thead>
          <tr>
            <th>ID</th>
            <th>Źródło</th>
            <th>Rodzaj</th>
            <th>Pobrano</th>
            <th>SHA-256</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {r.evidence.map((e) => (
            <tr key={e.id}>
              <td>
                <code>{e.id}</code>
              </td>
              <td>
                {e.title}
                <div className="small muted">
                  {e.url}
                  {e.archivedAt ? ` · wersja archiwalna z ${e.archivedAt.slice(0, 10)}` : ''}
                </div>
              </td>
              <td>
                <span className="pill ghost">{e.sourceKind}</span>
                <div className="small muted">
                  {e.connector} / {e.family}
                </div>
              </td>
              <td className="small">{dt(e.fetchedAt)}</td>
              <td>
                <code className="small">{e.sha256.slice(0, 16)}…</code>
              </td>
              <td>
                <a href={`/api/runs/${runId}/evidence/${e.id}`} target="_blank" rel="noreferrer">
                  kopia
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function Trace({ r }: { r: AnalysisResult }) {
  return (
    <div className="grid2">
      <Card title="Parametry wyszukiwania">
        <table className="kv">
          <tbody>
            <tr>
              <td>Identyfikatory wejściowe</td>
              <td>{r.input.map((i) => `${i.type}: ${i.value}`).join(', ')}</td>
            </tr>
            {Object.entries(r.params).map(([k, v]) => (
              <tr key={k}>
                <td>{k}</td>
                <td>
                  <code className="small">{typeof v === 'object' ? JSON.stringify(v) : String(v)}</code>
                </td>
              </tr>
            ))}
            <tr>
              <td>Wersje</td>
              <td>
                {r.engineVersion} · {r.rulesVersion}
              </td>
            </tr>
          </tbody>
        </table>
        <h4>Tożsamości</h4>
        <table className="kv">
          <tbody>
            {r.identities.map((i) => (
              <tr key={i.type + i.value}>
                <td>
                  {i.type}: <b>{i.value}</b>
                </td>
                <td>
                  <span className={`pill link-${i.strength}`}>{i.strength}</span> <span className="small muted">{i.via}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Card title="Przebieg analizy">
        <ol className="trace">
          {r.trace.map((t, i) => (
            <li key={i}>
              <span className="pill ghost">{t.step}</span> {t.message}
            </li>
          ))}
        </ol>
        <h4>Ruch wychodzący ({r.egress.length})</h4>
        <ul className="egress small">
          {r.egress.map((e, i) => (
            <li key={i} className={e.status === 'DENIED' ? 'neg' : ''}>
              {e.status === 'DENIED' ? '⛔ ZABLOKOWANO' : e.status} · {e.url}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
