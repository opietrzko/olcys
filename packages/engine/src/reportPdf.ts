/// <reference path="./pdfmake.d.ts" />
/**
 * Raport OSINT jako dokument PDF generowany na serwerze (pdfmake, czysty JavaScript – bez przeglądarki, działa on-prem).
 * Treść i kolejność sekcji jak w raporcie HTML; kolory z systemu wizualnego aplikacji:
 * pewność w rampie jednego odcienia zawsze z etykietą słowną, czerwień tylko dla cash-out, bursztyn dla wniosków do weryfikacji.
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import pdfmake from 'pdfmake';
import { SCORING_RULES, type AnalysisResult, type StatementKind } from '@olcys/core';

const require = createRequire(import.meta.url);
const FONT_DIR = join(dirname(require.resolve('pdfmake/package.json')), 'fonts', 'Roboto');

pdfmake.setFonts({
  Roboto: {
    normal: join(FONT_DIR, 'Roboto-Regular.ttf'),
    bold: join(FONT_DIR, 'Roboto-Medium.ttf'),
    italics: join(FONT_DIR, 'Roboto-Italic.ttf'),
    bolditalics: join(FONT_DIR, 'Roboto-MediumItalic.ttf'),
  },
  // Courier (czcionka standardowa PDF) tylko dla ciągów ASCII: adresy, skróty, identyfikatory dowodów
  Courier: { normal: 'Courier', bold: 'Courier-Bold', italics: 'Courier-Oblique', bolditalics: 'Courier-BoldOblique' },
});
// raport nie pobiera niczego z sieci ani z dysku poza czcionkami
pdfmake.setUrlAccessPolicy(() => false);
const STANDARD_FONTS = new Set(['Courier', 'Courier-Bold', 'Courier-Oblique', 'Courier-BoldOblique']);
pdfmake.setLocalAccessPolicy((p) => p.startsWith(FONT_DIR) || STANDARD_FONTS.has(p));

/* ---------- paleta (jasny motyw aplikacji) ---------- */
const C = {
  text: '#171717',
  text2: '#4d4d4d',
  text3: '#666666',
  border: '#e5e5e5',
  borderStrong: '#d1d1d1',
  surface2: '#f5f5f5',
  accent: '#0062d1',
  accentSoft: '#eaf2fd',
  accentBorder: '#b9d3f6',
  danger: '#c4291c',
  dangerSoft: '#fdeceb',
  warn: '#9a4d00',
  warnSoft: '#fff4e2',
  warnBorder: '#f2d29f',
};
const BAND: Record<string, { label: string; fill: string; color: string }> = {
  BARDZO_WYSOKIE: { label: 'Bardzo wysokie', fill: '#0b4fa8', color: '#ffffff' },
  PRAWDOPODOBNE: { label: 'Prawdopodobne', fill: '#2f6fcf', color: '#ffffff' },
  SREDNIE: { label: 'Średnie', fill: '#a9c7f0', color: '#0d2a52' },
  NISKIE: { label: 'Niskie / szum', fill: '#e1ebf9', color: '#1f3a63' },
  WYKLUCZONE: { label: 'Wykluczone', fill: '#efefef', color: '#4d4d4d' },
};
const KIND: Record<StatementKind, { label: string; color: string; fill: string; line: string }> = {
  FACT: { label: 'Fakt źródłowy', color: C.text, fill: '#ffffff', line: C.borderStrong },
  COMPUTATION: { label: 'Wynik obliczenia', color: C.accent, fill: C.accentSoft, line: C.accentBorder },
  CONCLUSION: { label: 'Wniosek do weryfikacji', color: C.warn, fill: C.warnSoft, line: C.warnBorder },
};

/* ---------- pomocnicze ---------- */
type Node = Record<string, unknown> | string;
const str = (v: unknown) => (v === null || v === undefined ? '' : String(v));
const dt = (s?: string | null) => (s ? s.slice(0, 19).replace('T', ' ') : '—');
const num = (n: number) => n.toLocaleString('pl-PL', { maximumFractionDigits: 2 });
/** Długie ciągi bez spacji (URL, hash, JSON) muszą móc się łamać – wstawiamy miejsca podziału o zerowej szerokości. */
const breakable = (s: string) => s.replace(/([/?&=,:.-])/g, '$1\u200b').replace(/([^\s\u200b]{18})(?=[^\s\u200b])/g, '$1\u200b');
const ascii = (s: string) => /^[\x20-\x7e]*$/.test(s);
/** Tekst o stałej szerokości: Courier dla ASCII (czcionka standardowa nie ma polskich znaków), inaczej Roboto. */
const mono = (v: unknown, extra: Record<string, unknown> = {}): Node => {
  const s = str(v);
  return ascii(s) ? { text: breakable(s), font: 'Courier', fontSize: 7.5, ...extra } : { text: breakable(s), fontSize: 7.5, ...extra };
};
const muted = (text: string, extra: Record<string, unknown> = {}): Node => ({ text, color: C.text3, ...extra });

const bandPill = (band: string, score: number): Node => {
  const b = BAND[band] ?? BAND.WYKLUCZONE;
  return {
    table: { body: [[{ text: `${score}% · ${b.label}`, bold: true, fontSize: 7.5, color: b.color, fillColor: b.fill, margin: [3, 0.5, 3, 0.5], noWrap: true }]] },
    layout: { hLineWidth: () => 0, vLineWidth: () => 0, paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0 },
  };
};

const tableLayout = {
  hLineWidth: (i: number, node: { table: { body: unknown[] } }) => (i === 0 || i === node.table.body.length ? 0.6 : 0.4),
  vLineWidth: () => 0,
  hLineColor: (i: number) => (i === 1 ? C.borderStrong : C.border),
  fillColor: (row: number) => (row === 0 ? C.surface2 : null),
  paddingLeft: () => 5,
  paddingRight: () => 5,
  paddingTop: () => 3.5,
  paddingBottom: () => 3.5,
};

function table(head: string[], rows: Node[][], widths: (string | number)[], extra: Record<string, unknown> = {}): Node {
  return {
    table: { headerRows: 1, widths, dontBreakRows: true, body: [head.map((h) => ({ text: h, bold: true, color: C.text2, fontSize: 7.5 })), ...rows] },
    layout: tableLayout,
    margin: [0, 2, 0, 8],
    ...extra,
  };
}

const h2 = (text: string): Node => ({ text, style: 'h2', headlineLevel: 1 });
const h3 = (text: string): Node => ({ text, style: 'h3' });

function statement(kind: StatementKind, text: string, refs: string[] = []): Node {
  const k = KIND[kind];
  return {
    table: {
      widths: ['*'],
      body: [[{ text: [{ text: `${k.label.toUpperCase()}  `, bold: true, color: k.color, fontSize: 6.5, characterSpacing: 0.3 }, { text }, refs.length ? { text: `  [${refs.join(', ')}]`, color: C.text3, fontSize: 7 } : ''], fillColor: k.fill }]],
    },
    layout: { hLineWidth: () => 0.6, vLineWidth: () => 0.6, hLineColor: () => k.line, vLineColor: () => k.line, paddingLeft: () => 6, paddingRight: () => 6, paddingTop: () => 3.5, paddingBottom: () => 3.5 },
    margin: [0, 0, 0, 3],
    unbreakable: true,
  };
}

/** Roboto nie ma strzałek ani znaczka ✓ – zamieniamy je na znaki, które czcionka zawiera (inaczej w PDF byłyby puste prostokąty). */
const GLYPH_FIX: [RegExp, string][] = [
  [/[→⟶⇒➔⬆⬇↑↓]/g, '›'],
  [/[←⟵⇐]/g, '‹'],
  [/[↔⇄⇔⟷]/g, '='],
  [/[✓✔]/g, 'tak'],
  [/[✗✘]/g, 'nie'],
];
function fixGlyphs<T>(node: T): T {
  if (typeof node === 'string') return GLYPH_FIX.reduce((s, [re, to]) => s.replace(re, to), node as string) as T;
  if (Array.isArray(node)) return node.map(fixGlyphs) as T;
  if (node && typeof node === 'object') {
    const o = node as Record<string, unknown>;
    for (const k of ['text', 'stack', 'columns', 'table', 'body']) if (k in o) o[k] = fixGlyphs(o[k]);
  }
  return node;
}

/* ---------- dokument ---------- */
export async function renderReportPdf(r: AnalysisResult, meta: { runId: string; analysisName: string }): Promise<Buffer> {
  const attributed = r.findings.filter((f) => !f.attribution.gated && f.attribution.score > 0);
  const rejected = r.findings.filter((f) => f.attribution.gated || f.attribution.score === 0);
  const statements = (k: StatementKind, key?: string) =>
    r.statements.filter((s) => s.kind === k && (key === undefined || s.addressKey === key)).map((s) => statement(k, s.text, s.evidenceIds));
  const none = (n: Node[], text = 'Brak.') => (n.length ? n : [muted(text, { margin: [0, 0, 0, 6] })]);
  const indicatorsOf = (f: (typeof r.findings)[number]) => (f.activity?.indicators ?? []).filter((i) => i.type !== 'HIGH_VOLUME');
  const cashout = attributed.reduce((n, f) => n + indicatorsOf(f).length, 0);
  const generated = new Date().toISOString();

  const content: Node[] = [
    { text: 'KryptoTrop', bold: true, color: C.accent, fontSize: 9, margin: [0, 0, 0, 4] },
    { text: 'Raport OSINT: powiązania śladów cyfrowych z adresami kryptowalutowymi', style: 'h1' },
    {
      text: [
        'Analiza: ',
        { text: meta.analysisName, bold: true, color: C.text },
        ` · przebieg ${meta.runId} · ${dt(r.startedAt)} – ${dt(r.finishedAt)} UTC · ${r.engineVersion} · reguły ${r.rulesVersion}`,
      ],
      color: C.text3,
      margin: [0, 4, 0, 10],
    },
    {
      table: {
        widths: ['*'],
        body: [
          [
            {
              text: [
                'Raport sporządzono wyłącznie na podstawie publicznie dostępnych źródeł. Wskaźnik Pewności to wynik algorytmu regułowego i ',
                { text: 'nie przesądza', bold: true },
                ' o własności adresu – wnioski oznaczone jako „Wniosek do weryfikacji” wymagają weryfikacji przez analityka. Reguły punktacji opisano w sekcji 8 (Metodyka).',
              ],
              fillColor: C.surface2,
              color: C.text2,
            },
          ],
        ],
      },
      layout: { hLineWidth: () => 0, vLineWidth: () => 0, paddingLeft: () => 9, paddingRight: () => 9, paddingTop: () => 7, paddingBottom: () => 7 },
      margin: [0, 0, 0, 10],
    },
    // pasek liczb – szybki obraz wyniku przed szczegółami
    {
      table: {
        widths: ['*', '*', '*', '*'],
        body: [
          [
            ['Adresy powiązane', attributed.length],
            ['Odrzucone / niepowiązane', rejected.length],
            ['Wskaźniki cash-out', cashout],
            ['Dokumenty dowodowe', r.evidence.length],
          ].map(([label, value], i) => ({
            stack: [
              { text: String(label), color: C.text2, fontSize: 7.5 },
              { text: String(value), fontSize: 16, bold: true, color: i === 0 && Number(value) ? C.accent : i === 2 && Number(value) ? C.danger : C.text, margin: [0, 1, 0, 0] },
            ],
          })),
        ],
      },
      layout: {
        hLineWidth: () => 0.6,
        vLineWidth: (i: number) => (i === 0 || i === 4 ? 0.6 : 0.4),
        hLineColor: () => C.border,
        vLineColor: () => C.border,
        paddingLeft: () => 8,
        paddingRight: () => 8,
        paddingTop: () => 6,
        paddingBottom: () => 7,
      },
      margin: [0, 0, 0, 4],
    },

    h2('1. Podsumowanie'),
    attributed.length
      ? table(
          ['Adres', 'Sieć', 'Kategoria', 'Pewność', 'Źródła', 'Wskaźniki wyjścia do fiat'],
          attributed.map((f) => [
            mono(f.address),
            str(f.chain),
            str(f.classification.category),
            bandPill(f.attribution.band, f.attribution.score),
            [...new Set(f.occurrences.map((o) => o.family))].join(', '),
            indicatorsOf(f).length ? { stack: indicatorsOf(f).map((i) => ({ text: i.title, color: C.danger })) } : muted('—'),
          ]),
          ['*', 32, 58, 'auto', 62, 80],
        )
      : muted('Nie wskazano adresów powiązanych z podmiotem.', { margin: [0, 0, 0, 6] }),
    {
      text: [
        { text: `Odrzucone / niepowiązane (${rejected.length}): `, bold: true },
        ...(rejected.length
          ? rejected.flatMap((f, i) => [i ? '; ' : '', { text: f.address, font: 'Courier', fontSize: 7.5 }, ` – ${str(f.classification.entity ?? f.attribution.rules[0]?.label)}`])
          : ['—']),
      ],
      margin: [0, 0, 0, 4],
    },

    h2('2. Dane wejściowe i parametry wyszukiwania'),
    table(['Typ', 'Wartość'], r.input.map((i) => [str(i.type), str(i.value)]), [90, '*']),
    table(
      ['Parametr', 'Wartość'],
      Object.entries(r.params).map(([k, v]) => [str(k), mono(typeof v === 'object' ? JSON.stringify(v) : v)]),
      [90, '*'],
    ),

    h2('3. Tożsamości powiązane z podmiotem'),
    r.identities.length
      ? table(['Typ', 'Wartość', 'Siła', 'Podstawa'], r.identities.map((i) => [str(i.type), { text: breakable(str(i.value)) }, str(i.strength), str(i.via)]), [50, 120, 48, '*'])
      : muted('Brak.'),

    h2('4. Adresy – uzasadnienie i aktywność'),
    ...r.findings.flatMap((f, n): Node[] => {
      const a = f.activity;
      const timeline = a?.timeline.filter((x) => x.verifiedAsset !== false) ?? [];
      const block: Node[] = [
        {
          columns: [
            { width: '*', stack: [{ text: f.address, font: ascii(f.address) ? 'Courier' : 'Roboto', bold: true, fontSize: 9 }, muted(`${f.chain} · ${f.classification.category}${f.classification.entity ? ` – ${f.classification.entity}` : ''}`, { fontSize: 7.5, margin: [0, 1, 0, 0] })] },
            { width: 'auto', ...(bandPill(f.attribution.band, f.attribution.score) as Record<string, unknown>) },
          ],
          columnGap: 8,
          margin: [0, n ? 10 : 2, 0, 4],
          headlineLevel: 2,
        },
        {
          text: [
            { text: 'Klasyfikacja: ', bold: true },
            f.classification.reasons.join('; '),
            ...(f.explorerUrl ? [' · ', { text: 'eksplorator', link: f.explorerUrl, color: C.accent }] : []),
          ],
          margin: [0, 0, 0, 4],
        },
        table(
          ['Reguła', 'Δ', 'Przesłanka'],
          [
            ...f.attribution.rules.map((x) => [`${x.ruleId} – ${x.label}`, { text: `${x.delta >= 0 ? '+' : '−'}${Math.abs(x.delta)}`, alignment: 'right', bold: true, color: x.delta >= 0 ? C.text : C.text2 }, str(x.premise)]),
            [{ text: 'Wynik', bold: true }, { text: `${f.attribution.score}%`, bold: true, alignment: 'right' }, ''],
          ],
          [150, 26, '*'],
        ),
      ];
      if (f.occurrences.length)
        block.push(
          h3('Wystąpienia przypisane podmiotowi'),
          table(
            ['Źródło', 'Autor / powiązanie', 'Kontekst', 'Data'],
            f.occurrences.map((o) => [
              { stack: [{ text: str(o.family), link: o.url, color: C.accent }, mono(o.evidenceId, { color: C.text3 })] },
              { stack: [str(o.authorHandle), muted(`${str(o.identityLink?.strength)}: ${str(o.identityLink?.via)}`, { fontSize: 7 })] },
              {
                stack: [
                  { text: breakable(`„${str(o.extraction.context)}”`) },
                  muted(`${str(o.context.category)}${o.extraction.deobfuscated ? ' · zapis zaciemniony' : ''}${o.context.aiSuggestion ? ` · AI: ${o.context.aiSuggestion.category}` : ''}`, { fontSize: 7 }),
                ],
              },
              dt(o.archivedAt ?? o.publishedAt ?? o.fetchedAt),
            ]),
            [96, 84, '*', 56],
          ),
        );
      if (f.foreignOccurrences.length)
        block.push(muted(`Ten sam adres opublikowało także ${f.foreignOccurrences.length} wystąpień obcych autorów: ${[...new Set(f.foreignOccurrences.map((o) => o.authorHandle))].join(', ')}.`, { margin: [0, 0, 0, 6] }));
      if (a) {
        block.push(
          {
            text: [
              { text: 'Aktywność w blockchainie ', bold: true },
              `(${a.dataSource}): ${a.txCount} tx, wpływy ≈ ${num(a.totalInUsd)} USD / ${num(a.totalInPln)} PLN, wypływy ≈ ${num(a.totalOutUsd)} USD / ${num(a.totalOutPln)} PLN.`,
            ],
            margin: [0, 2, 0, 4],
          },
          ...a.indicators.map((i) => statement(i.basis === 'computed' ? 'COMPUTATION' : 'CONCLUSION', `${i.title} – ${i.description}`)),
        );
        if (timeline.length)
          block.push(
            h3('Chronologia przepływu środków'),
            table(
              ['Data', 'Kier.', 'Kwota', '≈USD', '≈PLN', 'Kurs NBP (art. 11a)', 'Kontrahent', 'Tx'],
              timeline.map((x) => [
                dt(x.timestamp),
                x.direction === 'IN' ? 'wpływ' : { text: 'wypływ' },
                { text: [`${x.amount} ${str(x.asset)}`, x.network ? { text: ` (${x.network})`, color: C.text3 } : ''] },
                { text: x.usd === null ? '—' : `${num(x.usd)}${x.priceBasis === 'current' ? '*' : ''}`, alignment: 'right' },
                { text: x.pln === null || x.pln === undefined ? '—' : num(x.pln), alignment: 'right' },
                x.nbp ? `${x.nbp.mid} z ${x.nbp.date} (${x.nbp.no})` : muted('kurs bieżący'),
                mono(x.counterpartyLabel ?? x.counterparty),
                mono(`${x.hash.slice(0, 14)}…`.replace('…', '...')),
              ]),
              [52, 28, '*', 38, 38, 62, 70, 52],
              { fontSize: 7 },
            ),
          );
        const notes = [
          a.plnBasis ?? '',
          timeline.some((x) => x.priceBasis === 'current') ? '* cena krypto bieżąca – brak notowania z dnia transakcji.' : '',
          a.ignoredTokenTransfers ? `Pominięto ${a.ignoredTokenTransfers} transferów tokenów spoza rejestru zweryfikowanych kontraktów (możliwy spam / fałszywe stablecoiny); pełna lista w pakiecie dowodowym JSON.` : '',
        ].filter(Boolean);
        if (notes.length) block.push(muted(notes.join(' '), { fontSize: 7, margin: [0, 0, 0, 6] }));
      }
      block.push(...statements('CONCLUSION', f.key));
      return [{ stack: block }, { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 0.4, lineColor: C.border }], margin: [0, 8, 0, 0] }];
    }),

    h2('5. Zmiany w czasie (archiwum)'),
    r.profileChanges.length
      ? table(
          ['Zasób', 'Okres', 'Usunięte', 'Dodane'],
          r.profileChanges.map((c) => [{ text: breakable(c.url) }, `${dt(c.from)} → ${dt(c.to)}`, { stack: c.removed.map((x) => mono(x)) }, { stack: c.added.map((x) => mono(x)) }]),
          ['*', 90, 110, 110],
        )
      : muted('Nie wykryto zmian.'),

    h2('6. Fakty, obliczenia i wnioski'),
    h3('Fakty źródłowe'),
    ...none(statements('FACT')),
    h3('Wyniki obliczeń'),
    ...none(statements('COMPUTATION')),
    h3('Wnioski wymagające weryfikacji'),
    ...none(statements('CONCLUSION')),

    h2('7. Źródła i metadane (łańcuch dowodowy)'),
    table(
      ['ID', 'Źródło / URL / SHA-256', 'Pobrano (UTC)', 'Archiwum', 'Konektor'],
      r.evidence.map((e) => [
        mono(e.id),
        { stack: [str(e.title), mono(e.url, { link: e.url, color: C.accent }), mono(`SHA-256 ${e.sha256}`, { color: C.text3 })] },
        dt(e.fetchedAt),
        dt(e.archivedAt),
        `${str(e.connector)} / ${str(e.family)}`,
      ]),
      [86, '*', 56, 56, 60],
      { fontSize: 7.5 },
    ),
    muted(`Surowe kopie wszystkich zasobów przechowywane są w bazie wraz z sumami SHA-256 – umożliwia to odtworzenie i weryfikację analizy (${r.evidence.length} dokumentów).`),

    h2(`8. Metodyka – reguły Wskaźnika Pewności (${r.rulesVersion})`),
    table(
      ['Reguła', 'Wartość'],
      [
        ...Object.entries(SCORING_RULES.base).map(([k, v]) => [`Baza: ${v.label} (${k})`, { text: String(v.value), alignment: 'right' }]),
        ...Object.entries(SCORING_RULES.identity).map(([k, v]) => [`Tożsamość: ${v.label} (${k})`, { text: String(v.value), alignment: 'right' }]),
        ...(['ownershipClaim', 'synergy', 'crossIdentityReuse', 'historicalOnly', 'unverifiedOnChain', 'inferredInstitutional'] as const).map((k) => [
          SCORING_RULES[k].label,
          { text: `${SCORING_RULES[k].value > 0 ? '+' : ''}${SCORING_RULES[k].value}`, alignment: 'right' },
        ]),
        ['Bramka: adres giełdy, kontraktu, miksera, zbiórki, bramki fiat (etykieta lub bytecode ≠ 0x)', { text: '0%', alignment: 'right' }],
      ],
      ['*', 50],
    ),

    h2('9. Przebieg analizy'),
    table(['Czas', 'Etap', 'Opis'], r.trace.map((x) => [dt(x.at), str(x.step), { text: breakable(str(x.message)) }]), [70, 70, '*'], { fontSize: 7.5 }),
    muted(`Ruch wychodzący: ${r.egress.length} żądań, w tym zablokowanych przez allowlistę: ${r.egress.filter((e) => e.status === 'DENIED').length}.`),
  ];

  const doc = {
    pageSize: 'A4',
    pageMargins: [40, 44, 40, 48],
    info: {
      title: `Raport OSINT – ${meta.analysisName}`,
      author: 'KryptoTrop',
      subject: `Przebieg ${meta.runId}`,
      creator: `KryptoTrop ${r.engineVersion}`,
      producer: 'KryptoTrop',
    },
    defaultStyle: { font: 'Roboto', fontSize: 8.5, lineHeight: 1.25, color: C.text },
    styles: {
      h1: { fontSize: 17, bold: true, lineHeight: 1.15, characterSpacing: -0.2 },
      h2: { fontSize: 12, bold: true, margin: [0, 16, 0, 6] },
      h3: { fontSize: 9, bold: true, margin: [0, 6, 0, 3] },
    },
    // nagłówek sekcji ani adresu nie zostaje sam na dole strony
    pageBreakBefore: (node: { headlineLevel?: number; startPosition: { top: number; verticalRatio: number } }) =>
      (node.headlineLevel === 1 && node.startPosition.verticalRatio > 0.88) || (node.headlineLevel === 2 && node.startPosition.verticalRatio > 0.8),
    footer: (page: number, pages: number) => ({
      columns: [muted(`KryptoTrop · ${meta.runId} · wygenerowano ${dt(generated).slice(0, 16)} UTC`, { fontSize: 7 }), muted(`Strona ${page} z ${pages}`, { fontSize: 7, alignment: 'right' })],
      margin: [40, 18, 40, 0],
    }),
    content: fixGlyphs(content),
  };

  return pdfmake.createPdf(doc).getBuffer();
}
