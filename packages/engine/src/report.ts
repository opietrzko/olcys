/**
 * Raport OSINT (HTML do druku / zapisu jako PDF) – czytelny także dla osób bez wiedzy informatycznej.
 */
import { BANDS, SCORING_RULES, type AnalysisResult, type StatementKind } from '@olcys/core';

const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const usd = (n: number) => n.toLocaleString('pl-PL', { maximumFractionDigits: 2 });
const dt = (s?: string) => (s ? s.slice(0, 19).replace('T', ' ') : '—');

const KIND: Record<StatementKind, { label: string; cls: string }> = {
  FACT: { label: 'FAKT ŹRÓDŁOWY', cls: 'fact' },
  COMPUTATION: { label: 'WYNIK OBLICZENIA', cls: 'calc' },
  CONCLUSION: { label: 'WNIOSEK DO WERYFIKACJI', cls: 'concl' },
};
const BAND_CLS: Record<string, string> = { BARDZO_WYSOKIE: 'b-vh', PRAWDOPODOBNE: 'b-h', SREDNIE: 'b-m', NISKIE: 'b-l', WYKLUCZONE: 'b-x' };
const bandLabel = (b: string) => BANDS.find((x) => x.band === b)?.label ?? b;

export function renderReportHtml(r: AnalysisResult, meta: { runId: string; analysisName: string }): string {
  const attributed = r.findings.filter((f) => !f.attribution.gated && f.attribution.score > 0);
  const rejected = r.findings.filter((f) => f.attribution.gated || f.attribution.score === 0);
  const evById = new Map(r.evidence.map((e) => [e.id, e]));
  const stmt = (k: StatementKind, key?: string) =>
    r.statements
      .filter((s) => s.kind === k && (key === undefined || s.addressKey === key))
      .map((s) => `<li class="${KIND[k].cls}"><b>${KIND[k].label}</b> ${esc(s.text)}${s.evidenceIds.length ? ` <span class="ref">[${s.evidenceIds.map(esc).join(', ')}]</span>` : ''}</li>`)
      .join('');

  return `<!doctype html><html lang="pl"><head><meta charset="utf-8"><title>Raport OSINT – ${esc(meta.analysisName)}</title>
<style>
body{font:13px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#111;max-width:1000px;margin:24px auto;padding:0 16px}
h1{font-size:22px;margin:0}h2{font-size:17px;border-bottom:2px solid #1f3a5f;padding-bottom:4px;margin-top:28px;color:#1f3a5f}h3{font-size:14px;margin:18px 0 6px}
table{border-collapse:collapse;width:100%;margin:6px 0}th,td{border:1px solid #ccd;padding:4px 6px;text-align:left;vertical-align:top}th{background:#eef2f7}
code,.mono{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;word-break:break-all}
.band{display:inline-block;padding:1px 8px;border-radius:10px;font-weight:600;font-size:12px}
.b-vh{background:#14532d;color:#fff}.b-h{background:#16a34a;color:#fff}.b-m{background:#facc15}.b-l{background:#fed7aa}.b-x{background:#e5e7eb;color:#444}
ul.st{list-style:none;padding:0}ul.st li{padding:5px 8px;margin:3px 0;border-left:5px solid}
.fact{border-color:#2563eb;background:#eff6ff}.calc{border-color:#ca8a04;background:#fefce8}.concl{border-color:#ea580c;background:#fff7ed}
.ref{color:#666;font-size:11px}.legend span{margin-right:10px}.muted{color:#666}.pos{color:#15803d}.neg{color:#b91c1c}
.card{border:1px solid #ccd;border-radius:6px;padding:10px 12px;margin:12px 0;page-break-inside:avoid}
.disclaimer{background:#f1f5f9;padding:8px 12px;border-radius:6px}
@media print{body{margin:0}a{color:#111}}
</style></head><body>
<header><h1>Raport OSINT: powiązania śladów cyfrowych z adresami kryptowalutowymi</h1>
<p class="muted">Analiza: <b>${esc(meta.analysisName)}</b> · przebieg <code>${esc(meta.runId)}</code> · ${dt(r.startedAt)} – ${dt(r.finishedAt)} UTC · ${esc(r.engineVersion)} · reguły ${esc(r.rulesVersion)}</p>
<p class="disclaimer">Raport sporządzono wyłącznie na podstawie publicznie dostępnych źródeł. Wskaźnik Pewności to wynik algorytmu regułowego i <b>nie przesądza</b> o własności adresu – wnioski oznaczone kolorem pomarańczowym wymagają weryfikacji przez analityka. Reguły punktacji opisano w sekcji 8 (Metodyka).</p>
<p class="legend"><span class="band b-vh">80–100%</span><span class="band b-h">60–79%</span><span class="band b-m">40–59%</span><span class="band b-l">1–39%</span><span class="band b-x">0% wykluczone</span></p>
</header>

<h2>1. Podsumowanie</h2>
<table><tr><th>Adres</th><th>Sieć</th><th>Kategoria</th><th>Pewność</th><th>Źródła</th><th>Wskaźniki wyjścia do fiat</th></tr>
${attributed
  .map(
    (f) => `<tr><td class="mono">${esc(f.address)}</td><td>${f.chain}</td><td>${esc(f.classification.category)}</td><td><span class="band ${BAND_CLS[f.attribution.band]}">${f.attribution.score}%</span></td><td>${[...new Set(f.occurrences.map((o) => o.family))].map(esc).join(', ')}</td><td>${
      (f.activity?.indicators ?? []).filter((i) => i.type !== 'HIGH_VOLUME').map((i) => esc(i.title)).join('<br>') || '—'
    }</td></tr>`,
  )
  .join('')}</table>
<p><b>Odrzucone / niepowiązane (${rejected.length}):</b> ${rejected.map((f) => `<code>${esc(f.address)}</code> – ${esc(f.classification.entity ?? f.attribution.rules[0]?.label)}`).join('; ') || '—'}</p>

<h2>2. Dane wejściowe i parametry wyszukiwania</h2>
<table><tr><th>Typ</th><th>Wartość</th></tr>${r.input.map((i) => `<tr><td>${esc(i.type)}</td><td>${esc(i.value)}</td></tr>`).join('')}</table>
<table><tr><th>Parametr</th><th>Wartość</th></tr>${Object.entries(r.params)
    .map(([k, v]) => `<tr><td>${esc(k)}</td><td class="mono">${esc(typeof v === 'object' ? JSON.stringify(v) : v)}</td></tr>`)
    .join('')}</table>

<h2>3. Tożsamości powiązane z podmiotem</h2>
<table><tr><th>Typ</th><th>Wartość</th><th>Siła</th><th>Podstawa</th></tr>${r.identities.map((i) => `<tr><td>${esc(i.type)}</td><td>${esc(i.value)}</td><td>${esc(i.strength)}</td><td>${esc(i.via)}</td></tr>`).join('')}</table>

<h2>4. Adresy – uzasadnienie i aktywność</h2>
${r.findings
  .map(
    (f) => `<div class="card"><h3><code>${esc(f.address)}</code> (${f.chain}) <span class="band ${BAND_CLS[f.attribution.band]}">${f.attribution.score}% · ${esc(bandLabel(f.attribution.band))}</span></h3>
<p><b>Klasyfikacja:</b> ${esc(f.classification.category)}${f.classification.entity ? ` – ${esc(f.classification.entity)}` : ''}. ${esc(f.classification.reasons.join('; '))}${f.explorerUrl ? ` · <a href="${esc(f.explorerUrl)}">eksplorator</a>` : ''}</p>
<table><tr><th>Reguła</th><th>Δ</th><th>Przesłanka</th></tr>${f.attribution.rules
      .map((x) => `<tr><td>${esc(x.ruleId)} – ${esc(x.label)}</td><td class="${x.delta >= 0 ? 'pos' : 'neg'}">${x.delta >= 0 ? '+' : ''}${x.delta}</td><td>${esc(x.premise)}</td></tr>`)
      .join('')}<tr><th>Wynik</th><th>${f.attribution.score}%</th><th></th></tr></table>
${f.occurrences.length ? `<p><b>Wystąpienia przypisane podmiotowi:</b></p><table><tr><th>Źródło</th><th>Autor / powiązanie</th><th>Kontekst</th><th>Data</th></tr>${f.occurrences
      .map((o) => `<tr><td><a href="${esc(o.url)}">${esc(o.family)}</a> <span class="ref">${esc(o.evidenceId)}</span></td><td>${esc(o.authorHandle)}<br><span class="muted">${esc(o.identityLink?.strength)}: ${esc(o.identityLink?.via)}</span></td><td>„${esc(o.extraction.context)}”<br><span class="muted">${esc(o.context.category)}${o.extraction.deobfuscated ? ' · zapis zaciemniony' : ''}${o.context.aiSuggestion ? ` · AI: ${esc(o.context.aiSuggestion.category)}` : ''}</span></td><td>${dt(o.archivedAt ?? o.publishedAt ?? o.fetchedAt)}</td></tr>`)
      .join('')}</table>` : ''}
${f.foreignOccurrences.length ? `<p class="muted">Ten sam adres opublikowało także ${f.foreignOccurrences.length} wystąpień obcych autorów: ${[...new Set(f.foreignOccurrences.map((o) => o.authorHandle))].map(esc).join(', ')}.</p>` : ''}
${
  f.activity
    ? `<p><b>Aktywność w blockchainie</b> (${esc(f.activity.dataSource)}): ${f.activity.txCount} tx, wpływy ≈ ${usd(f.activity.totalInUsd)} USD / ${usd(f.activity.totalInPln)} PLN, wypływy ≈ ${usd(f.activity.totalOutUsd)} USD / ${usd(f.activity.totalOutPln)} PLN.</p>
<ul class="st">${f.activity.indicators.map((i) => `<li class="${i.basis === 'computed' ? 'calc' : 'concl'}"><b>${i.basis === 'computed' ? 'WYNIK OBLICZENIA' : 'WNIOSEK DO WERYFIKACJI'}</b> ${esc(i.title)} – ${esc(i.description)}</li>`).join('')}</ul>
<p><b>Chronologia przepływu środków:</b></p><table><tr><th>Data</th><th>Kier.</th><th>Kwota</th><th>≈USD</th><th>Kontrahent</th><th>Tx</th></tr>${f.activity.timeline
        .map((x) => `<tr><td>${dt(x.timestamp)}</td><td>${x.direction === 'IN' ? '⬇ wpływ' : '⬆ wypływ'}</td><td>${x.amount} ${esc(x.asset)}</td><td>${x.usd === null ? '—' : usd(x.usd)}</td><td class="mono">${esc(x.counterpartyLabel ?? x.counterparty)}</td><td class="mono">${esc(x.hash.slice(0, 14))}…</td></tr>`)
        .join('')}</table>`
    : ''
}
<ul class="st">${stmt('CONCLUSION', f.key)}</ul></div>`,
  )
  .join('')}

<h2>5. Zmiany w czasie (archiwum)</h2>
${r.profileChanges.length ? `<table><tr><th>Zasób</th><th>Okres</th><th>Usunięte</th><th>Dodane</th></tr>${r.profileChanges.map((c) => `<tr><td>${esc(c.url)}</td><td>${dt(c.from)} → ${dt(c.to)}</td><td class="mono">${c.removed.map(esc).join('<br>')}</td><td class="mono">${c.added.map(esc).join('<br>')}</td></tr>`).join('')}</table>` : '<p>Nie wykryto zmian.</p>'}

<h2>6. Fakty, obliczenia i wnioski</h2>
<h3>Fakty źródłowe</h3><ul class="st">${stmt('FACT')}</ul>
<h3>Wyniki obliczeń</h3><ul class="st">${stmt('COMPUTATION')}</ul>
<h3>Wnioski wymagające weryfikacji</h3><ul class="st">${stmt('CONCLUSION')}</ul>

<h2>7. Źródła i metadane (łańcuch dowodowy)</h2>
<table><tr><th>ID</th><th>Źródło / URL</th><th>Pobrano (UTC)</th><th>Archiwum</th><th>SHA-256</th><th>Konektor</th></tr>${r.evidence
    .map((e) => `<tr><td class="mono">${esc(e.id)}</td><td>${esc(e.title)}<br><a class="mono" href="${esc(e.url)}">${esc(e.url)}</a></td><td>${dt(e.fetchedAt)}</td><td>${dt(e.archivedAt)}</td><td class="mono">${esc(e.sha256)}</td><td>${esc(e.connector)} / ${esc(e.family)}</td></tr>`)
    .join('')}</table>
<p class="muted">Surowe kopie wszystkich zasobów przechowywane są w bazie wraz z sumami SHA-256 – umożliwia to odtworzenie i weryfikację analizy (${evById.size} dokumentów).</p>

<h2>8. Metodyka – reguły Wskaźnika Pewności (${esc(r.rulesVersion)})</h2>
<table><tr><th>Reguła</th><th>Wartość</th></tr>
${Object.entries(SCORING_RULES.base).map(([k, v]) => `<tr><td>Baza: ${esc(v.label)} (${k})</td><td>${v.value}</td></tr>`).join('')}
${Object.entries(SCORING_RULES.identity).map(([k, v]) => `<tr><td>Tożsamość: ${esc(v.label)} (${k})</td><td>${v.value}</td></tr>`).join('')}
${(['ownershipClaim', 'synergy', 'crossIdentityReuse', 'historicalOnly', 'unverifiedOnChain', 'inferredInstitutional'] as const).map((k) => `<tr><td>${esc(SCORING_RULES[k].label)}</td><td>${SCORING_RULES[k].value > 0 ? '+' : ''}${SCORING_RULES[k].value}</td></tr>`).join('')}
<tr><td>Bramka: adres giełdy, kontraktu, miksera, zbiórki, bramki fiat (etykieta lub bytecode ≠ 0x)</td><td>0%</td></tr></table>

<h2>9. Przebieg analizy</h2>
<table><tr><th>Czas</th><th>Etap</th><th>Opis</th></tr>${r.trace.map((x) => `<tr><td>${dt(x.at)}</td><td>${esc(x.step)}</td><td>${esc(x.message)}</td></tr>`).join('')}</table>
<p class="muted">Ruch wychodzący: ${r.egress.length} żądań, w tym zablokowanych przez allowlistę: ${r.egress.filter((e) => e.status === 'DENIED').length}.</p>
</body></html>`;
}
