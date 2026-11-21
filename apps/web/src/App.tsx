import { useCallback, useEffect, useState } from 'react';
import type { Identifier, IdentifierType } from '@olcys/core';
import { api, type Analysis, type Meta, type Run } from './api';
import { RunView } from './RunView';
import { Band, Card, dt } from './ui';

function useHash() {
  const [hash, setHash] = useState(location.hash || '#/');
  useEffect(() => {
    const on = () => setHash(location.hash || '#/');
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  return hash;
}

export function App() {
  const hash = useHash();
  const [meta, setMeta] = useState<Meta | null>(null);
  useEffect(() => {
    api.meta().then(setMeta).catch(() => setMeta(null));
  }, []);
  const parts = hash.replace(/^#\//, '').split('/');
  return (
    <div className="app">
      <header className="top">
        <a href="#/" className="brand">
          <span className="owl">🦉</span>
          <span>
            <b>OŁCyŚ</b>
            <small>Osintowy Łapacz Cyfrowych Śladów</small>
          </span>
        </a>
        <nav>
          <a href="#/" className={parts[0] === '' || parts[0] === 'a' ? 'active' : ''}>
            Analizy
          </a>
          <a href="#/metodyka" className={parts[0] === 'metodyka' ? 'active' : ''}>
            Metodyka
          </a>
          <a href="#/zrodla" className={parts[0] === 'zrodla' ? 'active' : ''}>
            Źródła i zgodność
          </a>
          <a href="#/audyt" className={parts[0] === 'audyt' ? 'active' : ''}>
            Audyt
          </a>
        </nav>
        {meta && (
          <span className={`mode mode-${meta.mode}`} title={`magazyn: ${meta.store}, blockchain: ${meta.chainProvider}`}>
            {meta.mode === 'demo' ? 'TRYB DEMO · dane syntetyczne' : 'TRYB LIVE'}
          </span>
        )}
      </header>
      <main>
        {parts[0] === '' && <Home />}
        {parts[0] === 'a' && parts[1] && <AnalysisPage id={parts[1]} runId={parts[3]} />}
        {parts[0] === 'metodyka' && meta && <Methodology meta={meta} />}
        {parts[0] === 'zrodla' && meta && <Sources meta={meta} />}
        {parts[0] === 'audyt' && <Audit />}
      </main>
      <footer className="foot">Wyłącznie publicznie dostępne źródła (OSINT). Wskaźnik Pewności nie przesądza o własności adresu – wymaga weryfikacji analityka.</footer>
    </div>
  );
}

/* ---------- Lista + nowa analiza ---------- */

const TYPES: { v: IdentifierType; l: string; ph: string }[] = [
  { v: 'nick', l: 'Nick / login', ph: 'np. krypto_janek' },
  { v: 'email', l: 'E-mail', ph: 'np. jan@example.com' },
  { v: 'telegram', l: 'Telegram', ph: 'np. @janek_p2p' },
  { v: 'name', l: 'Imię i nazwisko', ph: 'np. Jan Testowy' },
  { v: 'url', l: 'URL profilu / strony', ph: 'https://…' },
  { v: 'address', l: 'Adres krypto', ph: '0x… / bc1… / T…' },
];

function Home() {
  const [list, setList] = useState<Analysis[] | null>(null);
  const load = useCallback(() => api.analyses().then(setList), []);
  useEffect(() => {
    void load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [load]);
  return (
    <div className="grid-home">
      <NewAnalysis />
      <Card title="Analizy">
        {!list && <p className="muted">Ładowanie…</p>}
        {list?.length === 0 && <p className="muted">Brak analiz. Utwórz pierwszą – lub wczytaj scenariusz demonstracyjny.</p>}
        <ul className="analyses">
          {list?.map((a) => (
            <li key={a.id}>
              <a href={`#/a/${a.id}`}>
                <b>{a.name}</b>
                <div className="small muted">
                  {a.identifiers.map((i) => `${i.type}: ${i.value}`).join(' · ')}
                </div>
                <div className="small">
                  {a.lastRun?.status === 'running' && <span className="pill warn">w toku…</span>}
                  {a.lastRun?.summary && (
                    <>
                      <span className="pill">{a.lastRun.summary.attributed} adr. ≥60%</span> <span className="pill ghost">{a.lastRun.summary.rejected} odrzuconych</span>{' '}
                      <span className="pill bad">⚑ {a.lastRun.summary.indicators}</span>
                    </>
                  )}
                  {a.scheduleMinutes && <span className="pill ghost">⟳ co {a.scheduleMinutes} min</span>} <span className="muted">· {a.runCount} przebieg(ów) · {dt(a.createdAt)}</span>
                </div>
              </a>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function NewAnalysis() {
  const [name, setName] = useState('');
  const [ids, setIds] = useState<Identifier[]>([{ type: 'nick', value: '' }]);
  const [schedule, setSchedule] = useState<number | ''>('');
  const [history, setHistory] = useState(true);
  const [depth, setDepth] = useState(2);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const demo = () => {
    setName('Scenariusz demo – Jan Testowy');
    setIds([
      { type: 'nick', value: 'krypto_janek' },
      { type: 'email', value: 'jan.testowy@example.com' },
    ]);
  };
  const submit = async () => {
    const identifiers = ids.filter((i) => i.value.trim());
    if (!identifiers.length) return setErr('Podaj co najmniej jeden identyfikator.');
    setBusy(true);
    setErr('');
    try {
      const { analysis } = await api.create({ name: name || identifiers.map((i) => i.value).join(', '), identifiers, options: { useHistory: history, maxDepth: depth }, scheduleMinutes: schedule || null });
      location.hash = `#/a/${analysis.id}`;
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card title="Nowa analiza" actions={<button className="btn ghost" onClick={demo}>Wczytaj scenariusz demo</button>}>
      <label className="field">
        Nazwa sprawy
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="np. Czynności sprawdzające 2026/123" />
      </label>
      <div className="field">Identyfikatory (co najmniej jeden)</div>
      {ids.map((i, n) => (
        <div className="id-row" key={n}>
          <select value={i.type} onChange={(e) => setIds(ids.map((x, k) => (k === n ? { ...x, type: e.target.value as IdentifierType } : x)))}>
            {TYPES.map((t) => (
              <option key={t.v} value={t.v}>
                {t.l}
              </option>
            ))}
          </select>
          <input value={i.value} placeholder={TYPES.find((t) => t.v === i.type)?.ph} onChange={(e) => setIds(ids.map((x, k) => (k === n ? { ...x, value: e.target.value } : x)))} />
          {ids.length > 1 && (
            <button className="icon" onClick={() => setIds(ids.filter((_, k) => k !== n))} aria-label="Usuń">
              ✕
            </button>
          )}
        </div>
      ))}
      <button className="link" onClick={() => setIds([...ids, { type: 'email', value: '' }])}>
        + dodaj identyfikator
      </button>
      <div className="row">
        <label className="field">
          Głębokość pivotowania
          <select value={depth} onChange={(e) => setDepth(Number(e.target.value))}>
            {[0, 1, 2, 3].map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Analiza cykliczna
          <select value={schedule} onChange={(e) => setSchedule(e.target.value ? Number(e.target.value) : '')}>
            <option value="">jednorazowo</option>
            <option value={5}>co 5 min (demo)</option>
            <option value={60}>co godzinę</option>
            <option value={1440}>codziennie</option>
            <option value={10080}>co tydzień</option>
          </select>
        </label>
        <label className="check">
          <input type="checkbox" checked={history} onChange={(e) => setHistory(e.target.checked)} /> historia (archiwum)
        </label>
      </div>
      {err && <p className="neg small">{err}</p>}
      <button className="btn primary" disabled={busy} onClick={submit}>
        {busy ? 'Uruchamianie…' : '🔎 Uruchom analizę'}
      </button>
    </Card>
  );
}

/* ---------- Analiza ---------- */

function AnalysisPage({ id, runId }: { id: string; runId?: string }) {
  const [data, setData] = useState<{ analysis: Analysis; runs: Run[] } | null>(null);
  const [run, setRun] = useState<Run | null>(null);
  const load = useCallback(() => api.analysis(id).then(setData), [id]);
  useEffect(() => {
    void load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [load]);
  const current = runId ?? data?.runs.find((r) => r.status === 'done')?.id ?? data?.runs[0]?.id;
  const currentStatus = data?.runs.find((r) => r.id === current)?.status;
  useEffect(() => {
    if (current && currentStatus === 'done' && run?.id !== current) api.run(current).then(setRun);
  }, [current, currentStatus, run?.id]);
  if (!data) return <p className="muted">Ładowanie…</p>;
  const a = data.analysis;
  return (
    <div>
      <div className="page-head">
        <div>
          <h2>{a.name}</h2>
          <div className="muted small">
            {a.identifiers.map((i) => `${i.type}: ${i.value}`).join(' · ')} · utworzona {dt(a.createdAt)} przez {a.createdBy}
          </div>
        </div>
        <div className="row">
          <select
            value={a.scheduleMinutes ?? ''}
            onChange={async (e) => {
              await api.schedule(a.id, e.target.value ? Number(e.target.value) : null);
              void load();
            }}
          >
            <option value="">bez harmonogramu</option>
            <option value={5}>⟳ co 5 min</option>
            <option value={60}>⟳ co godzinę</option>
            <option value={1440}>⟳ codziennie</option>
          </select>
          <button
            className="btn primary"
            onClick={async () => {
              const r = await api.rerun(a.id);
              await load();
              location.hash = `#/a/${a.id}/r/${r.id}`;
            }}
          >
            ↻ Uruchom ponownie
          </button>
        </div>
      </div>
      <div className="runs-bar">
        {data.runs.map((r) => (
          <a key={r.id} href={`#/a/${a.id}/r/${r.id}`} className={`run-chip ${r.id === current ? 'active' : ''} st-${r.status}`}>
            {r.trigger === 'schedule' ? '⟳' : '▶'} {dt(r.startedAt)} {r.status !== 'done' && `· ${r.status}`}
            {r.summary && <span className="small"> · {r.summary.attributed}/{r.summary.addresses}</span>}
          </a>
        ))}
        {a.nextRunAt && <span className="small muted">następny przebieg: {dt(a.nextRunAt)}</span>}
      </div>
      {currentStatus === 'running' && <Card><p>⏳ Trwa analiza – przeszukiwanie źródeł, ekstrakcja adresów, weryfikacja w blockchainie…</p></Card>}
      {currentStatus === 'failed' && <Card><p className="neg">Przebieg zakończony błędem: {data.runs.find((r) => r.id === current)?.error}</p></Card>}
      {run?.result && run.id === current && <RunView key={run.id} run={run} />}
    </div>
  );
}

/* ---------- Metodyka ---------- */

function Methodology({ meta }: { meta: Meta }) {
  const rules = meta.scoring.rules as Record<string, { value: number; label: string }> & Meta['scoring']['rules'];
  const extra = ['ownershipClaim', 'synergy', 'crossIdentityReuse', 'historicalOnly', 'unverifiedOnChain', 'inferredInstitutional'];
  return (
    <div className="grid2">
      <Card title={`Wskaźnik Pewności – algorytm (${meta.rulesVersion})`}>
        <p>
          <code>wynik = min(100, max(0, BAZA(najlepsze wystąpienie) + Σ korekt))</code>. Adres z kategorii wykluczonej (giełda, kontrakt, mikser, zbiórka, bramka fiat) otrzymuje
          <b> 0%</b> niezależnie od pozostałych reguł. Algorytm jest deterministyczny – te same dane dają ten sam wynik.
        </p>
        <h4>Wynik bazowy wg kontekstu</h4>
        <table className="kv">
          <tbody>
            {Object.entries(rules.base).map(([k, v]) => (
              <tr key={k}>
                <td>{v.label}</td>
                <td>
                  <b>{v.value}</b>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <h4>Powiązanie autora z podmiotem</h4>
        <table className="kv">
          <tbody>
            {Object.entries(rules.identity).map(([k, v]) => (
              <tr key={k}>
                <td>
                  {v.label} <span className="pill ghost">{k}</span>
                </td>
                <td>{v.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <h4>Premie i kary</h4>
        <table className="kv">
          <tbody>
            {extra.map((k) => (
              <tr key={k}>
                <td>{rules[k].label}</td>
                <td className={rules[k].value >= 0 ? 'pos' : 'neg'}>
                  {rules[k].value > 0 ? '+' : ''}
                  {rules[k].value}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <div>
        <Card title="Przedziały">
          {meta.scoring.bands.map((b) => (
            <div key={b.band} className="band-row">
              <Band band={b.band} /> {b.label}
            </div>
          ))}
        </Card>
        <Card title="Odrzucanie fałszywych trafień">
          <ol className="small">
            <li>Etykiety adresów z lokalnych zbiorów ({meta.labelsCount} etykiet: {meta.labelDatasets.map((d) => d.name).join(', ')}).</li>
            <li>Flaga kontraktu: <code>eth_getCode ≠ 0x</code> → smart kontrakt, nie konto prywatne.</li>
            <li>Kontekst „wpłaciłem na…/adres giełdy/scam” → adres cudzy (15 pkt).</li>
            <li>Ten sam adres u ≥3 obcych autorów → kara −30 (giveaway, zbiórka, oszustwo).</li>
            <li>Zgodność wyłącznie imienia i nazwiska → możliwy homonim, kara −35.</li>
          </ol>
        </Card>
        <Card title="Wskaźniki wyjścia do fiat (cash-out)">
          <ul className="small">
            <li>Wysyłka na adres giełdy / custodial (etykieta).</li>
            <li>Wnioskowany adres depozytowy: ≥{meta.activityThresholds.depositForwardRatio * 100}% środków przekazane do giełdy w ≤{meta.activityThresholds.depositForwardHours} h.</li>
            <li>Wymiana na stablecoiny przez DEX ≥ {meta.activityThresholds.significantSwapUsd} USD.</li>
            <li>Bramki krypto-fiat, kantory, karty (etykieta OFFRAMP).</li>
            <li>Wzorzec P2P: ≥{meta.activityThresholds.p2pMinTransfers} okrągłych wpłat stablecoin od różnych osób.</li>
            <li>Kontakt z mikserem / podmiotem sankcjonowanym.</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}

function Sources({ meta }: { meta: Meta }) {
  return (
    <div className="grid2">
      <Card title="Konektory źródeł">
        <table className="kv">
          <tbody>
            {meta.connectors.map((c) => (
              <tr key={c.id}>
                <td>
                  <b>{c.title}</b>
                  <div className="small muted">{c.compliance}</div>
                  <div className="small">przyjmuje: {c.accepts.join(', ')}</div>
                </td>
                <td>
                  {c.enabled ? <span className={`pill ${c.live ? 'warn' : ''}`}>{c.live ? 'Internet' : 'syntetyczne'}</span> : <span className="pill ghost">wyłączony</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <div>
        <Card title="Kontrola ruchu wychodzącego (allowlista)">
          <p className="small">Aplikacja łączy się wyłącznie z zatwierdzonymi hostami. Każde żądanie jest logowane w przebiegu analizy, próby połączeń poza listą są blokowane.</p>
          <ul>
            {meta.egressAllowlist.map((h) => (
              <li key={h}>
                <code>{h}</code>
              </li>
            ))}
          </ul>
          <p className="small">Blockchain: {meta.chainProvider} · AI: {meta.llm ? `${meta.llm.model} @ ${meta.llm.baseUrl}` : 'wyłączone (opcjonalnie lokalny model przez API zgodne z OpenAI)'}</p>
        </Card>
        <Card title="Zbiory etykiet adresów">
          {meta.labelDatasets.map((d) => (
            <div key={d.name} className="small">
              <b>{d.name}</b> ({d.count}) – {d.description} <span className="muted">Licencja: {d.license}</span>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}

function Audit() {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof api.audit>>>([]);
  useEffect(() => {
    void api.audit().then(setRows);
  }, []);
  return (
    <Card title="Dziennik audytu (kto, kiedy, co)">
      <table className="kv">
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td className="small">{dt(r.at)}</td>
              <td>{r.actor}</td>
              <td>
                <span className="pill ghost">{r.action}</span>
              </td>
              <td>
                <code className="small">{r.target}</code>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
