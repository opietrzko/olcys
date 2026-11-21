import { useCallback, useEffect, useState } from 'react';
import type { Identifier, IdentifierType } from '@olcys/core';
import {
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  ClipboardList,
  FolderSearch,
  LoaderCircle,
  Monitor,
  Moon,
  Plus,
  RefreshCw,
  Repeat,
  Search,
  Settings,
  ShieldCheck,
  Sun,
  TriangleAlert,
  X,
} from 'lucide-react';
import { api, type Analysis, type Meta, type Run } from './api';
import { RunView } from './RunView';
import { Band, Empty, ErrorNote, IdTag, Panel, Skeleton, ThemeCtx, dt, plural, useTheme, type ThemePref } from './ui';

function useHash() {
  const [hash, setHash] = useState(location.hash || '#/');
  useEffect(() => {
    const on = () => setHash(location.hash || '#/');
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  return hash;
}

/** Praca analityka – w głównej nawigacji tylko sprawy. */
const NAV = [{ href: '#/', key: 'analizy', label: 'Analizy', icon: FolderSearch }];

/** Treści dla administratora / IT i jury – poza codzienną ścieżką analityka. Metodyka jest linkowana przy wyniku adresu. */
const ADMIN_NAV = [
  { href: '#/zrodla', key: 'zrodla', label: 'Źródła i zgodność', icon: ShieldCheck },
  { href: '#/audyt', key: 'audyt', label: 'Audyt', icon: ClipboardList },
];

const THEMES: { v: ThemePref; label: string; icon: typeof Sun }[] = [
  { v: 'light', label: 'Motyw jasny', icon: Sun },
  { v: 'system', label: 'Motyw systemowy', icon: Monitor },
  { v: 'dark', label: 'Motyw ciemny', icon: Moon },
];

export function App() {
  const hash = useHash();
  const { pref, setPref, resolved } = useTheme();
  const [meta, setMeta] = useState<Meta | null>(null);
  const [metaErr, setMetaErr] = useState(false);
  useEffect(() => {
    api.meta().then(setMeta).catch(() => setMetaErr(true));
  }, []);
  const parts = hash.replace(/^#\//, '').split('/');
  const section = parts[0] === '' || parts[0] === 'a' ? 'analizy' : parts[0];
  useEffect(() => {
    const titles: Record<string, string> = { analizy: 'Analizy', metodyka: 'Metodyka', zrodla: 'Źródła i zgodność', audyt: 'Audyt' };
    document.title = `${titles[section] ?? 'OŁCyŚ'} · OŁCyŚ`;
  }, [section]);
  const needsMeta = section === 'metodyka' || section === 'zrodla';
  return (
    <ThemeCtx.Provider value={resolved}>
      <a className="skip" href="#main">
        Przejdź do treści
      </a>
      <div className="app">
        <aside className="side">
          <a href="#/" className="brand" aria-label="OŁCyŚ – strona główna">
            <span className="brand-mark" aria-hidden="true">
              <Search size={16} strokeWidth={2.4} />
            </span>
            <span>
              <span className="brand-name">OŁCyŚ</span>
              <span className="brand-sub" style={{ display: 'block' }}>
                Osintowy Łapacz Cyfrowych Śladów
              </span>
            </span>
          </a>
          <nav className="nav" aria-label="Główna nawigacja">
            {NAV.map(({ href, key, label, icon: Icon }) => (
              <a key={key} href={href} aria-current={section === key ? 'page' : undefined}>
                <Icon size={16} aria-hidden="true" />
                {label}
              </a>
            ))}
          </nav>
          <div className="side-foot">
            <nav className="nav nav-admin" aria-label="Administracja">
              <span className="nav-heading">
                <Settings size={12} aria-hidden="true" />
                Administracja
              </span>
              {ADMIN_NAV.map(({ href, key, label, icon: Icon }) => (
                <a key={key} href={href} aria-current={section === key ? 'page' : undefined}>
                  <Icon size={14} aria-hidden="true" />
                  {label}
                </a>
              ))}
            </nav>
            <p className="side-note">Wyłącznie publicznie dostępne źródła (OSINT). Wskaźnik Pewności nie przesądza o własności adresu i wymaga weryfikacji analityka.</p>
            <div className="theme" role="group" aria-label="Motyw">
              {THEMES.map(({ v, label, icon: Icon }) => (
                <button key={v} type="button" aria-pressed={pref === v} aria-label={label} title={label} onClick={() => setPref(v)}>
                  <Icon size={14} aria-hidden="true" />
                </button>
              ))}
            </div>
          </div>
        </aside>
        <div className="content">
          <main id="main" tabIndex={-1}>
            {parts[0] === '' && <Home meta={meta} />}
            {parts[0] === 'a' && parts[1] && <AnalysisPage key={parts[1]} id={parts[1]} runId={parts[3]} />}
            {needsMeta && metaErr && <ErrorNote title="Nie można pobrać konfiguracji z API">Sprawdź, czy serwer OŁCyŚ działa (domyślnie port 4000), i odśwież stronę.</ErrorNote>}
            {needsMeta && !meta && !metaErr && (
              <Panel>
                <Skeleton rows={6} />
              </Panel>
            )}
            {parts[0] === 'metodyka' && meta && <Methodology meta={meta} />}
            {parts[0] === 'zrodla' && meta && <Sources meta={meta} />}
            {parts[0] === 'audyt' && <Audit />}
          </main>
        </div>
      </div>
    </ThemeCtx.Provider>
  );
}

/* ---------- Lista + nowa analiza ---------- */

const TYPES: { v: IdentifierType; l: string; ph: string }[] = [
  { v: 'nick', l: 'Nick / login', ph: 'np. login z forum lub GitHub' },
  { v: 'email', l: 'E-mail', ph: 'np. jan@example.com' },
  { v: 'telegram', l: 'Telegram', ph: 'np. @nazwa_kanalu' },
  { v: 'phone', l: 'Telefon', ph: 'np. +48 600 123 456' },
  { v: 'name', l: 'Imię i nazwisko', ph: 'np. Jan Kowalski' },
  { v: 'url', l: 'URL profilu / strony', ph: 'https://…' },
  { v: 'address', l: 'Adres krypto', ph: '0x… / bc1… / T…' },
];

const SCHEDULES: { v: number | ''; l: string }[] = [
  { v: '', l: 'Jednorazowo' },
  { v: 5, l: 'Co 5 minut' },
  { v: 60, l: 'Co godzinę' },
  { v: 1440, l: 'Codziennie' },
  { v: 10080, l: 'Co tydzień' },
];

const STATUS_LABEL: Record<string, string> = { done: 'Zakończony', running: 'W toku', failed: 'Błąd', queued: 'W kolejce' };

function Home({ meta }: { meta: Meta | null }) {
  const [list, setList] = useState<Analysis[] | null>(null);
  const [err, setErr] = useState(false);
  const load = useCallback(
    () =>
      api
        .analyses()
        .then((l) => {
          setList(l);
          setErr(false);
        })
        .catch(() => setErr(true)),
    [],
  );
  useEffect(() => {
    void load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [load]);
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Analizy</h1>
          <p className="lede">Podaj co najmniej jeden identyfikator podmiotu. OŁCyŚ przeszuka publiczne źródła, wskaże adresy krypto z Wskaźnikiem Pewności i sprawdzi wyjście środków do walut tradycyjnych.</p>
        </div>
      </div>
      <div className="grid-home">
        <NewAnalysis meta={meta} />
        <Panel title={`Sprawy${list?.length ? ` (${list.length})` : ''}`} flush>
          {err && (
            <div style={{ padding: 16 }}>
              <ErrorNote title="Brak połączenia z API">Lista odświeży się sama, gdy serwer będzie dostępny.</ErrorNote>
            </div>
          )}
          {!list && !err && (
            <div style={{ padding: 16 }}>
              <Skeleton rows={5} height={14} />
            </div>
          )}
          {list?.length === 0 && (
            <Empty icon={FolderSearch} title="Nie ma jeszcze żadnej sprawy">
              Wpisz identyfikator w formularzu obok, np. nick z forum, e-mail lub adres portfela, i kliknij „Uruchom analizę”.
            </Empty>
          )}
          {!!list?.length && (
            <div className="table-wrap">
              <table className="table hover">
                <thead>
                  <tr>
                    <th>Sprawa</th>
                    <th>Ostatni przebieg</th>
                    <th className="num">Adresy ≥60%</th>
                    <th className="num">Cash-out</th>
                    <th className="num">Utworzono</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((a) => (
                    <tr key={a.id} onClick={() => (location.hash = `#/a/${a.id}`)}>
                      <td style={{ minWidth: 240 }}>
                        <a className="title-link" href={`#/a/${a.id}`} onClick={(e) => e.stopPropagation()}>
                          {a.name}
                        </a>
                        <div className="ids">
                          {a.identifiers.map((i) => (
                            <IdTag key={i.type + i.value} type={i.type} value={i.value} />
                          ))}
                        </div>
                      </td>
                      <td>
                        {a.lastRun ? (
                          <span className={`status ${a.lastRun.status}`}>
                            <span className="dot" aria-hidden="true" />
                            {STATUS_LABEL[a.lastRun.status] ?? a.lastRun.status}
                          </span>
                        ) : (
                          <span className="faint">—</span>
                        )}
                        <div className="small faint" style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                          {a.scheduleMinutes ? (
                            <>
                              <Repeat size={12} aria-hidden="true" /> co {a.scheduleMinutes} min ·{' '}
                            </>
                          ) : null}
                          {plural(a.runCount ?? 0, 'przebieg', 'przebiegi', 'przebiegów')}
                        </div>
                      </td>
                      <td className="num">
                        {a.lastRun?.summary ? (
                          <>
                            <b>{a.lastRun.summary.attributed}</b>
                            <div className="small faint">{plural(a.lastRun.summary.rejected, 'odrzucony', 'odrzucone', 'odrzuconych')}</div>
                          </>
                        ) : (
                          <span className="faint">—</span>
                        )}
                      </td>
                      <td className="num">{a.lastRun?.summary ? <span className={a.lastRun.summary.indicators ? 'danger-text' : 'faint'}>{a.lastRun.summary.indicators}</span> : <span className="faint">—</span>}</td>
                      <td className="num small muted">{dt(a.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}

function NewAnalysis({ meta }: { meta: Meta | null }) {
  const [name, setName] = useState('');
  const [ids, setIds] = useState<Identifier[]>([{ type: 'nick', value: '' }]);
  const [schedule, setSchedule] = useState<number | ''>('');
  const [history, setHistory] = useState(true);
  const [depth, setDepth] = useState(6);
  const live = meta?.sources;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const identifiers = ids.filter((i) => i.value.trim());
    if (!identifiers.length) return setErr('Podaj co najmniej jeden identyfikator.');
    setBusy(true);
    setErr('');
    try {
      const { analysis } = await api.create({ name: name || identifiers.map((i) => i.value).join(', '), identifiers, options: { useHistory: history, maxDepth: depth }, scheduleMinutes: schedule || null });
      location.hash = `#/a/${analysis.id}`;
    } catch (e) {
      setErr(`Nie udało się uruchomić analizy: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Panel title="Nowa analiza">
      <form onSubmit={submit} noValidate>
        {live && !live.githubToken && (
          <div className="banner warn">
            <TriangleAlert size={16} aria-hidden="true" />
            <span>Brak GITHUB_TOKEN: GitHub pozwala na 60 zapytań na godzinę z adresu IP. Przy wyczerpaniu limitu pobierane są tylko pliki README i FUNDING.yml.</span>
          </div>
        )}
        {live && !live.searxng && (
          <div className="banner">
            <CircleAlert size={16} aria-hidden="true" />
            <span>Wyszukiwarka wyłączona. Ustaw SEARXNG_URL, aby przeszukiwać otwarty Internet.</span>
          </div>
        )}
        <label className="field">
          <span>Nazwa sprawy</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="np. Czynności sprawdzające 2026/123" />
        </label>
        <div className="field" role="group" aria-labelledby="ids-label">
          <span id="ids-label" className="label">
            Identyfikatory <span className="hint">co najmniej jeden</span>
          </span>
          <div>
            {ids.map((i, n) => (
              <div className="id-row" key={n}>
                <select aria-label={`Rodzaj identyfikatora ${n + 1}`} value={i.type} onChange={(e) => setIds(ids.map((x, k) => (k === n ? { ...x, type: e.target.value as IdentifierType } : x)))}>
                  {TYPES.map((t) => (
                    <option key={t.v} value={t.v}>
                      {t.l}
                    </option>
                  ))}
                </select>
                <input
                  aria-label={`Wartość identyfikatora ${n + 1}`}
                  aria-invalid={Boolean(err) && !ids.some((x) => x.value.trim())}
                  value={i.value}
                  placeholder={TYPES.find((t) => t.v === i.type)?.ph}
                  onChange={(e) => setIds(ids.map((x, k) => (k === n ? { ...x, value: e.target.value } : x)))}
                />
                {ids.length > 1 ? (
                  <button type="button" className="btn ghost icon-only" onClick={() => setIds(ids.filter((_, k) => k !== n))} aria-label={`Usuń identyfikator ${n + 1}`}>
                    <X size={16} aria-hidden="true" />
                  </button>
                ) : (
                  <span />
                )}
              </div>
            ))}
            <button type="button" className="btn ghost sm" style={{ marginTop: 2 }} onClick={() => setIds([...ids, { type: 'email', value: '' }])}>
              <Plus size={14} aria-hidden="true" /> Dodaj identyfikator
            </button>
          </div>
        </div>
        <div className="row">
          <label className="field">
            <span>Głębokość pivotowania</span>
            <select value={depth} onChange={(e) => setDepth(Number(e.target.value))}>
              {[6, 3, 2, 1, 0].map((d) => (
                <option key={d} value={d}>
                  {d === 6 ? 'Do wyczerpania tropów (maks. 6)' : d === 0 ? '0 – tylko wejście' : `${d} ${d === 1 ? 'skok' : 'skoki'}`}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Harmonogram</span>
            <select value={schedule} onChange={(e) => setSchedule(e.target.value ? Number(e.target.value) : '')}>
              {SCHEDULES.map((s) => (
                <option key={String(s.v)} value={s.v}>
                  {s.l}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="check" style={{ marginTop: -4, marginBottom: 12 }}>
          <input type="checkbox" checked={history} onChange={(e) => setHistory(e.target.checked)} />
          Sprawdzaj wersje archiwalne (Wayback) – wykrywa podmianę adresu
        </label>
        {err && (
          <p className="form-error" role="alert">
            <CircleAlert size={16} aria-hidden="true" />
            {err}
          </p>
        )}
        <button type="submit" className="btn primary" disabled={busy} style={{ width: '100%', height: 38 }}>
          {busy ? <LoaderCircle size={16} className="spin" aria-hidden="true" /> : <Search size={16} aria-hidden="true" />}
          {busy ? 'Uruchamianie…' : 'Uruchom analizę'}
        </button>
        {live && (
          <p className="small faint" style={{ marginTop: 12, marginBottom: 0 }}>
            Źródła: {live.connectors.filter((c) => c.enabled && c.kind === 'source').map((c) => c.id).join(', ')} oraz archiwum.
          </p>
        )}
      </form>
    </Panel>
  );
}

/* ---------- Analiza ---------- */

function AnalysisPage({ id, runId }: { id: string; runId?: string }) {
  const [data, setData] = useState<{ analysis: Analysis; runs: Run[] } | null>(null);
  const [err, setErr] = useState('');
  const [run, setRun] = useState<Run | null>(null);
  const [rerunning, setRerunning] = useState(false);
  const load = useCallback(
    () =>
      api
        .analysis(id)
        .then((d) => {
          setData(d);
          setErr('');
        })
        .catch((e: Error) => setErr(e.message)),
    [id],
  );
  useEffect(() => {
    void load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [load]);
  const current = runId ?? data?.runs.find((r) => r.status === 'done')?.id ?? data?.runs[0]?.id;
  const currentRun = data?.runs.find((r) => r.id === current);
  const currentStatus = currentRun?.status;
  useEffect(() => {
    if (current && currentStatus === 'done' && run?.id !== current) api.run(current).then(setRun);
  }, [current, currentStatus, run?.id]);
  if (err && !data)
    return (
      <ErrorNote title={err.startsWith('404') ? 'Nie znaleziono sprawy' : 'Nie można wczytać sprawy'}>
        {err.startsWith('404') ? 'Sprawa mogła zostać utworzona w innej sesji serwera (magazyn w pamięci). ' : ''}
        <a href="#/">Wróć do listy analiz</a>
      </ErrorNote>
    );
  if (!data)
    return (
      <>
        <Skeleton rows={2} height={20} />
        <div style={{ height: 20 }} />
        <Panel>
          <Skeleton rows={8} />
        </Panel>
      </>
    );
  const a = data.analysis;
  return (
    <div>
      <div className="page-head">
        <div style={{ minWidth: 0 }}>
          <nav className="crumbs" aria-label="Ścieżka">
            <a href="#/">Analizy</a>
            <ChevronRight size={14} aria-hidden="true" />
            <span aria-current="page">Sprawa</span>
          </nav>
          <h1>{a.name}</h1>
          <div className="meta-row">
            <span className="ids" style={{ marginTop: 0 }}>
              {a.identifiers.map((i) => (
                <IdTag key={i.type + i.value} type={i.type} value={i.value} />
              ))}
            </span>
            <span>
              Utworzona {dt(a.createdAt)} przez {a.createdBy}
            </span>
          </div>
        </div>
        <div className="actions">
          <label className="sr-only" htmlFor="sched">
            Harmonogram
          </label>
          <select
            id="sched"
            value={a.scheduleMinutes ?? ''}
            onChange={async (e) => {
              await api.schedule(a.id, e.target.value ? Number(e.target.value) : null);
              void load();
            }}
          >
            <option value="">Bez harmonogramu</option>
            <option value={5}>Co 5 minut</option>
            <option value={60}>Co godzinę</option>
            <option value={1440}>Codziennie</option>
            <option value={10080}>Co tydzień</option>
          </select>
          <button
            className="btn primary"
            disabled={rerunning}
            onClick={async () => {
              setRerunning(true);
              try {
                const r = await api.rerun(a.id);
                await load();
                location.hash = `#/a/${a.id}/r/${r.id}`;
              } finally {
                setRerunning(false);
              }
            }}
          >
            <RefreshCw size={15} className={rerunning ? 'spin' : ''} aria-hidden="true" /> Uruchom ponownie
          </button>
        </div>
      </div>
      <div className="runs" aria-label="Przebiegi">
        <span className="runs-label">Przebiegi</span>
        {data.runs.map((r) => (
          <a key={r.id} href={`#/a/${a.id}/r/${r.id}`} className={`run-chip st-${r.status}`} aria-current={r.id === current ? 'true' : undefined}>
            <span className={`status ${r.status}`}>
              <span className="dot" aria-hidden="true" />
            </span>
            {r.trigger === 'schedule' && <Repeat size={12} aria-label="z harmonogramu" />}
            {dt(r.startedAt)}
            {r.status !== 'done' && <span className="sr-only">{STATUS_LABEL[r.status]}</span>}
            {r.summary && (
              <span className="faint num">
                {r.summary.attributed}/{r.summary.addresses}
              </span>
            )}
          </a>
        ))}
        {a.nextRunAt && <span className="small faint">Następny przebieg: {dt(a.nextRunAt)}</span>}
      </div>
      {(currentStatus === 'running' || currentStatus === 'queued') && (
        <Panel className="tone-accent">
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }} role="status">
            <LoaderCircle size={20} className="spin" aria-hidden="true" style={{ color: 'var(--accent)' }} />
            <div>
              <b>Trwa analiza</b>
              <div className="small muted">Przeszukiwanie źródeł, ekstrakcja adresów i weryfikacja w blockchainie. Wynik pojawi się tu automatycznie.</div>
            </div>
          </div>
        </Panel>
      )}
      {currentStatus === 'failed' && <ErrorNote title="Przebieg zakończony błędem">{currentRun?.error}</ErrorNote>}
      {currentStatus === 'done' && (!run || run.id !== current) && (
        <Panel>
          <Skeleton rows={6} />
        </Panel>
      )}
      {run?.result && run.id === current && <RunView key={run.id} run={run} />}
    </div>
  );
}

/* ---------- Metodyka ---------- */

function Methodology({ meta }: { meta: Meta }) {
  const rules = meta.scoring.rules as Record<string, { value: number; label: string }> & Meta['scoring']['rules'];
  const extra = ['ownershipClaim', 'synergy', 'crossIdentityReuse', 'historicalOnly', 'unverifiedOnChain', 'inferredInstitutional'];
  const signed = (v: number) => (v > 0 ? `+${v}` : v < 0 ? `−${Math.abs(v)}` : '0');
  return (
    <>
      <div className="page-head">
        <div>
          <button type="button" className="back" onClick={() => (history.length > 1 ? history.back() : (location.hash = '#/'))}>
            <ChevronLeft size={14} aria-hidden="true" />
            Wróć do sprawy
          </button>
          <h1>Metodyka Wskaźnika Pewności</h1>
          <p className="lede">
            Wskaźnik Pewności liczą jawne, deterministyczne reguły w wersji <code>{meta.rulesVersion}</code>. Te same dane zawsze dają ten sam wynik.
          </p>
        </div>
      </div>
      <div className="grid2">
        <Panel title="Algorytm Wskaźnika Pewności">
          <p>
            <code>wynik = min(100, max(0, BAZA(najlepsze wystąpienie) + Σ korekt))</code>
          </p>
          <p className="muted">Adres z kategorii wykluczonej (giełda, kontrakt, mikser, zbiórka, bramka fiat) otrzymuje 0% niezależnie od pozostałych reguł.</p>
          <h4>Wynik bazowy według kontekstu</h4>
          <table className="kv">
            <tbody>
              {Object.entries(rules.base).map(([k, v]) => (
                <tr key={k}>
                  <td>{v.label}</td>
                  <td className="num">
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
                    {v.label} <span className={`tag link-${k}`}>{k}</span>
                  </td>
                  <td className="num">{signed(v.value)}</td>
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
                  <td className={`num ${rules[k].value >= 0 ? 'pos' : 'neg'}`}>{signed(rules[k].value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
        <div>
          <Panel title="Przedziały">
            {meta.scoring.bands.map((b) => (
              <div key={b.band} className="band-row">
                <Band band={b.band} /> <span className="muted">{b.label}</span>
              </div>
            ))}
          </Panel>
          <Panel title="Odrzucanie fałszywych trafień">
            <ol className="list-plain">
              <li>
                Etykiety adresów z lokalnych zbiorów ({meta.labelsCount} etykiet: {meta.labelDatasets.map((d) => d.name).join(', ')}).
              </li>
              <li>
                Flaga kontraktu: <code>eth_getCode ≠ 0x</code> oznacza smart kontrakt, nie konto prywatne.
              </li>
              <li>Kontekst „wpłaciłem na…”, „adres giełdy”, „scam” oznacza adres cudzy (15 pkt).</li>
              <li>Ten sam adres u co najmniej 3 obcych autorów: kara −30 (giveaway, zbiórka, oszustwo).</li>
              <li>Zgodność wyłącznie imienia i nazwiska: możliwy homonim, kara −35.</li>
            </ol>
          </Panel>
          <Panel title="Wskaźniki wyjścia do fiat (cash-out)">
            <ul className="list-plain">
              <li>Wysyłka na adres giełdy lub portfel powierniczy (etykieta).</li>
              <li>
                Wnioskowany adres depozytowy: co najmniej {meta.activityThresholds.depositForwardRatio * 100}% środków przekazane do giełdy w ciągu {meta.activityThresholds.depositForwardHours} h.
              </li>
              <li>Wymiana na stablecoiny przez DEX od {meta.activityThresholds.significantSwapUsd} USD.</li>
              <li>Bramki krypto-fiat, kantory, karty (etykieta OFFRAMP).</li>
              <li>Wzorzec P2P: co najmniej {meta.activityThresholds.p2pMinTransfers} okrągłe wpłaty stablecoin od różnych osób.</li>
              <li>Kontakt z mikserem lub podmiotem sankcjonowanym.</li>
            </ul>
          </Panel>
        </div>
      </div>
    </>
  );
}

function Sources({ meta }: { meta: Meta }) {
  const info = meta.sources;
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Źródła i zgodność</h1>
          <p className="lede">Każdy konektor korzysta wyłącznie z publicznie dostępnych danych, bez logowania i obchodzenia zabezpieczeń. Ruch wychodzący jest kontrolowany i logowany.</p>
        </div>
      </div>
      <div className="grid2">
        <Panel title="Konektory źródeł publicznych" flush>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Źródło</th>
                  <th>Stan</th>
                </tr>
              </thead>
              <tbody>
                {info.connectors.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <b>{c.title}</b>
                      <div className="small muted">{c.compliance}</div>
                      <div className="small faint" style={{ marginTop: 2 }}>
                        Przyjmuje: {c.accepts.join(', ')}
                      </div>
                    </td>
                    <td>{c.enabled ? <span className="tag ok">Aktywny</span> : <span className="tag">Wyłączony</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
        <div>
          <Panel title="Kontrola ruchu wychodzącego">
            <p>
              Zapytania API (zawierające identyfikatory) trafiają <b>wyłącznie</b> do zatwierdzonych hostów. Pobieranie stron odkrytych w dowodach:{' '}
              <b>{info.webFetch === 'public' ? 'dowolna publiczna strona (GET) z blokadą adresów wewnętrznych (ochrona SSRF)' : 'tylko allowlista'}</b>. Każde żądanie jest logowane w przebiegu.
            </p>
            <div className="allow">
              {info.egressAllowlist.map((h) => (
                <span key={h} className="tag mono">
                  {h}
                </span>
              ))}
            </div>
            <table className="kv small">
              <tbody>
                <tr>
                  <td className="muted">Blockchain</td>
                  <td style={{ overflowWrap: 'anywhere' }}>{info.chainProvider}</td>
                </tr>
                <tr>
                  <td className="muted">Kursy</td>
                  <td>{info.liveRates ? 'NBP (USD/PLN) + CoinGecko' : 'Zapasowe'}</td>
                </tr>
                <tr>
                  <td className="muted">Token GitHub</td>
                  <td>{info.githubToken ? <span className="tag ok">Ustawiony</span> : <span className="tag warn">Brak</span>}</td>
                </tr>
                <tr>
                  <td className="muted">Wyszukiwarka</td>
                  <td>{info.searxng ?? 'Wyłączona'}</td>
                </tr>
                <tr>
                  <td className="muted">AI</td>
                  <td>{meta.llm ? `${meta.llm.model} @ ${meta.llm.baseUrl}` : 'Wyłączone (opcjonalnie lokalny model przez API zgodne z OpenAI)'}</td>
                </tr>
              </tbody>
            </table>
          </Panel>
          <Panel title="Zbiory etykiet adresów">
            <table className="kv">
              <tbody>
                {meta.labelDatasets.map((d) => (
                  <tr key={d.name}>
                    <td>
                      <b>{d.name}</b>
                      <div className="small muted">{d.description}</div>
                      <div className="small faint">Licencja: {d.license}</div>
                    </td>
                    <td className="num">{d.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="small faint" style={{ marginTop: 10, marginBottom: 0 }}>
              Dodatkowo: etykiety i nazwy zweryfikowanych kontraktów z API Blockscout oraz flaga kontraktu z eth_getCode.
            </p>
          </Panel>
        </div>
      </div>
    </>
  );
}

function Audit() {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof api.audit>> | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    api
      .audit()
      .then(setRows)
      .catch(() => setErr(true));
  }, []);
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Dziennik audytu</h1>
          <p className="lede">Kto, kiedy i co: każde utworzenie analizy, przebieg, podgląd, raport i eksport.</p>
        </div>
      </div>
      <Panel flush>
        {err && (
          <div style={{ padding: 16 }}>
            <ErrorNote title="Nie można pobrać dziennika audytu" />
          </div>
        )}
        {!rows && !err && (
          <div style={{ padding: 16 }}>
            <Skeleton rows={6} />
          </div>
        )}
        {rows?.length === 0 && (
          <Empty icon={ClipboardList} title="Dziennik jest pusty">
            Wpisy pojawią się po utworzeniu pierwszej analizy.
          </Empty>
        )}
        {!!rows?.length && (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Czas</th>
                  <th>Użytkownik</th>
                  <th>Czynność</th>
                  <th>Obiekt</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td className="small muted" style={{ whiteSpace: 'nowrap' }}>
                      {dt(r.at)}
                    </td>
                    <td>{r.actor}</td>
                    <td>
                      <span className="tag mono">{r.action}</span>
                    </td>
                    <td>
                      <code className="small">{r.target}</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}
