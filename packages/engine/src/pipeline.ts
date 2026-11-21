/**
 * Pipeline analizy OŁCyŚ:
 *  1. Identyfikatory wejściowe → konektory Web2 → dokumenty-dowody (URL, czas, SHA-256, surowa treść)
 *  2. Pivotowanie: identyfikatory odkryte na profilach podmiotu (Telegram, WWW, e-mail…) → kolejne źródła
 *  3. Historia zasobów (archiwum) → wykrywanie podmiany adresów
 *  4. Ekstrakcja i walidacja adresów, przypisanie autora do tożsamości podmiotu, ocena kontekstu
 *  5. Klasyfikacja adresów (etykiety, bytecode) → odrzucanie fałszywych trafień
 *  6. Wskaźnik Pewności (reguły) + analiza aktywności blockchain (cash-out)
 *  7. Fakty / obliczenia / wnioski + pełny ślad przebiegu
 */
import {
  addressKey,
  LabelRegistry,
  analyzeChain,
  assessContext,
  classifyAddress,
  computeConfidence,
  detectProfileChanges,
  extractAddresses,
  isExcluded,
  normalizeText,
  normalizePhone,
  extractPhones,
  validateAddress,
  RULES_VERSION,
  type AddressFinding,
  type AnalysisResult,
  type Chain,
  type EvidenceDocument,
  type Identifier,
  type Occurrence,
  type RateTable,
  type Segment,
  type SubjectIdentity,
  type TraceStep,
  type Transfer,
} from '@olcys/core';
import { ENGINE_VERSION, type EngineConfig } from './config';
import { ALL_CONNECTORS, HISTORY_CONNECTORS } from './connectors/registry';
import type { ConnectorContext, HistoryConnector, SourceConnector } from './connectors/types';
import { toEvidence } from './evidence';
import { createSafeFetch, type EgressLogEntry } from './http';
import { createLlmClient } from './llm';
import { createChainProvider } from './providers';
import { buildStatements } from './statements';
import { fetchLiveRates } from './rates';

export interface AnalysisInput {
  identifiers: Identifier[];
  options?: { maxDepth?: number; disabledConnectors?: string[]; useHistory?: boolean };
}

export interface PipelineOutput {
  result: AnalysisResult;
  raw: Record<string, string>;
}

export interface EngineDeps {
  config: EngineConfig;
  labels: LabelRegistry;
  labelDatasets: { name: string; count: number }[];
  rates: RateTable;
  connectors?: SourceConnector[];
  history?: HistoryConnector[];
}

const norm = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const idKey = (i: Identifier) => `${i.type}:${i.type === 'address' ? i.value : i.value.toLowerCase()}`;

export function normalizeIdentifier(i: Identifier): Identifier {
  let v = i.value.trim();
  if (i.type === 'nick' || i.type === 'telegram') v = v.replace(/^@/, '').replace(/^https?:\/\/t\.me\//, '');
  if (i.type === 'email') v = v.toLowerCase();
  if (i.type === 'phone') v = normalizePhone(v) ?? v;
  return { type: i.type, value: v };
}

/** Wyznacza powiązanie autora fragmentu z tożsamościami podmiotu (najsilniejsze z możliwych). */
export function linkFor(seg: Segment, doc: EvidenceDocument, identities: SubjectIdentity[]): Occurrence['identityLink'] {
  const candidates: NonNullable<Occurrence['identityLink']>[] = [];
  const handle = (seg.author?.handle ?? doc.owner?.handle)?.replace(/^@/, '').toLowerCase();
  if (handle) {
    const m = identities.find((i) => (i.type === 'nick' || i.type === 'telegram') && i.value.toLowerCase() === handle);
    if (m) candidates.push({ strength: m.strength, identity: `${m.type}:${m.value}`, via: m.via });
  }
  // Numer telefonu podmiotu w treści (np. kontakt w ogłoszeniu) – wiąże autora z podmiotem także przy innym nicku.
  const phones = identities.filter((i) => i.type === 'phone');
  if (phones.length) {
    const inText = new Set(extractPhones(seg.text));
    const p = phones.find((i) => inText.has(i.value));
    if (p) candidates.push({ strength: p.strength === 'DIRECT' ? 'DIRECT' : 'PIVOT', identity: `phone:${p.value}`, via: `numer telefonu ${p.value} w treści (${p.via})` });
  }
  if (doc.meta.ownedByQuery === true) {
    const q = identities.find((i) => idKey(i) === idKey(doc.query));
    if (q) candidates.push({ strength: q.strength, identity: `${q.type}:${q.value}`, via: q.via });
  }
  // Otwarte przestrzenie nazw (ENS, Keybase): zgodność nazwy bez wzajemnego potwierdzenia = powiązanie słabe
  if (doc.meta.weakOwnership === true && candidates.length) {
    const c = candidates.find((x) => x.strength !== 'WEAK') ?? candidates[0];
    return { strength: 'WEAK', identity: c.identity, via: `nazwa w otwartej przestrzeni nazw (${doc.family}) zgodna z identyfikatorem – brak wzajemnego potwierdzenia w innym profilu` };
  }
  const rank = { DIRECT: 0, PIVOT: 1, MENTION: 2, WEAK: 3 } as const;
  if (candidates.length) return candidates.sort((a, b) => rank[a.strength] - rank[b.strength])[0];
  // Wzmianka: identyfikator podmiotu w tym samym fragmencie co adres (np. strona z wyników wyszukiwania)
  const lower = seg.text.toLowerCase();
  const mention = identities.find((i) => {
    if (!['nick', 'email', 'telegram'].includes(i.type) || i.value.length < 4) return false;
    const v = i.value.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^a-z0-9_])@?${v}($|[^a-z0-9_])`).test(lower);
  });
  if (mention) return { strength: 'MENTION', identity: `${mention.type}:${mention.value}`, via: `identyfikator „${mention.value}” wymieniony w tym samym fragmencie (autor treści niepotwierdzony)` };
  const display = seg.author?.displayName ?? doc.owner?.displayName;
  if (display) {
    const n = identities.find((i) => i.type === 'name' && norm(i.value) === norm(display));
    if (n) return { strength: 'WEAK', identity: `name:${n.value}`, via: 'zgodność wyłącznie imienia i nazwiska (możliwy homonim)' };
  }
  return undefined;
}

/** Linia tekstu zawierająca adres – zawężony kontekst do oceny słów kluczowych. */
function localContext(text: string, start: number, end: number): string {
  const ls = text.lastIndexOf('\n', start) + 1;
  const le = text.indexOf('\n', end);
  const line = text.slice(ls, le === -1 ? undefined : le);
  return line.length <= 320 ? line : text.slice(Math.max(0, start - 120), Math.min(text.length, end + 120));
}

export async function runAnalysis(input: AnalysisInput, deps: EngineDeps): Promise<PipelineOutput> {
  const { config } = deps;
  const labels = new LabelRegistry(deps.labels.all()); // kopia na przebieg – uzupełniana etykietami z API
  const startedAt = new Date().toISOString();
  const trace: TraceStep[] = [];
  const t = (step: string, message: string) => trace.push({ at: new Date().toISOString(), step, message });
  const egress: EgressLogEntry[] = [];
  const fetch = createSafeFetch(config, (e) => egress.push(e));
  const chain = createChainProvider(config, fetch);
  const llm = createLlmClient(config, fetch);
  let rates = deps.rates;
  if (config.chain.liveRates) {
    const lr = await fetchLiveRates(fetch, deps.rates);
    rates = lr.rates;
    for (const e of lr.errors) t('rates', `Uwaga: ${e}`);
    t('rates', `Kursy: ${rates.source}`);
  }
  const maxDepth = input.options?.maxDepth ?? config.maxDepth;
  const disabled = new Set(input.options?.disabledConnectors ?? []);
  const connectors = (deps.connectors ?? ALL_CONNECTORS).filter((c) => c.enabled(config) && !disabled.has(c.id));
  const historyConnectors = input.options?.useHistory === false ? [] : (deps.history ?? HISTORY_CONNECTORS).filter((c) => !disabled.has(c.id));
  const stats = new Map<string, { id: string; live: boolean; documents: number; errors: string[] }>();
  for (const c of [...connectors, ...historyConnectors]) stats.set(c.id, { id: c.id, live: c.isLive(config), documents: 0, errors: [] });

  const identities: SubjectIdentity[] = [];
  const seen = new Set<string>();
  for (const raw of input.identifiers) {
    const i = normalizeIdentifier(raw);
    if (seen.has(idKey(i))) continue;
    seen.add(idKey(i));
    identities.push({ ...i, strength: 'DIRECT', via: 'Wejście analityka', depth: 0 });
  }
  t('input', `Identyfikatory wejściowe: ${identities.map((i) => `${i.type}=${i.value}`).join(', ')}; maks. głębokość pivotowania ${maxDepth}`);

  const evidence = new Map<string, EvidenceDocument>();
  const rawContent: Record<string, string> = {};
  const addDoc = (ev: EvidenceDocument, raw: string, connector: string) => {
    if (evidence.has(ev.id)) return false;
    evidence.set(ev.id, ev);
    rawContent[ev.id] = raw;
    stats.get(connector)!.documents++;
    return true;
  };

  // 1–2. Zbieranie i pivotowanie (BFS po identyfikatorach)
  const queue = [...identities];
  while (queue.length) {
    const id = queue.shift()!;
    for (const c of connectors.filter((x) => x.accepts.includes(id.type) && (x.maxIdentityDepth === undefined || id.depth <= x.maxIdentityDepth))) {
      const ctx: ConnectorContext = { config, fetch, log: (m) => t(c.id, m), warn: (m) => { stats.get(c.id)!.errors.push(m); t(c.id, `Uwaga: ${m}`); } };
      let docs;
      try {
        docs = await c.collect({ type: id.type, value: id.value }, ctx);
      } catch (e) {
        const msg = `${id.type}:${id.value} – ${(e as Error).message}`;
        stats.get(c.id)!.errors.push(msg);
        t(c.id, `Błąd: ${msg}`);
        continue;
      }
      let added = 0;
      for (const d of docs) {
        const { evidence: ev, raw } = toEvidence(d, c.id, { type: id.type, value: id.value });
        if (addDoc(ev, raw, c.id)) added++;
        // pivot tylko z dokumentów należących do podmiotu i tylko przy silnym powiązaniu
        if (id.depth >= maxDepth) continue;
        const owned = ev.segments.some((s) => {
          const l = linkFor(s, ev, identities);
          return l && (l.strength === 'DIRECT' || l.strength === 'PIVOT');
        });
        if (!owned) continue;
        for (const link of ev.links) {
          const n = normalizeIdentifier(link);
          if (seen.has(idKey(n))) continue;
          seen.add(idKey(n));
          const pivot: SubjectIdentity = { ...n, strength: 'PIVOT', via: `${n.type} opublikowany w: ${ev.title}`, evidenceId: ev.id, depth: id.depth + 1 };
          identities.push(pivot);
          queue.push(pivot);
          t('pivot', `Nowy identyfikator ${n.type}=${n.value} (źródło: ${ev.url})`);
        }
      }
      if (docs.length) t(c.id, `${id.type}=${id.value}: ${docs.length} dokument(ów), nowych ${added}`);
    }
  }

  // 2b. Wzajemne potwierdzenie (ENS): inny dokument podmiotu wskazuje nazwę .eth lub adres
  for (const d of evidence.values()) {
    const needles = (d.meta.reciprocalNeedles as string[] | undefined)?.map((n) => n.toLowerCase());
    if (!d.meta.weakOwnership || !needles?.length) continue;
    const confirmedBy = [...evidence.values()].find(
      (o) => o.id !== d.id && !o.meta.weakOwnership && o.segments.some((s) => ['DIRECT', 'PIVOT'].includes(linkFor(s, o, identities)?.strength ?? '') && needles.some((n) => s.text.toLowerCase().includes(n))),
    );
    if (confirmedBy) {
      d.meta.weakOwnership = false;
      d.meta.confirmedBy = confirmedBy.id;
      t('reciprocal', `${d.title}: potwierdzone wzajemnie w ${confirmedBy.url}`);
    } else t('reciprocal', `${d.title}: brak wzajemnego potwierdzenia – powiązanie słabe`);
  }

  // 3. Historia zasobów należących do podmiotu
  const ownDocs = [...evidence.values()].filter(
    (d) => (d.sourceKind === 'OWN_PROFILE' || d.sourceKind === 'OWN_WEBSITE') && /^https?:/.test(d.url) && !d.archivedAt && d.segments.some((s) => ['DIRECT', 'PIVOT'].includes(linkFor(s, d, identities)?.strength ?? '')),
  );
  for (const h of historyConnectors) {
    const ctx: ConnectorContext = { config, fetch, log: (m) => t(h.id, m), warn: (m) => { stats.get(h.id)!.errors.push(m); t(h.id, `Uwaga: ${m}`); } };
    for (const d of ownDocs.slice(0, 15)) {
      try {
        const snaps = await h.history(d, ctx);
        for (const s of snaps) {
          const { evidence: ev, raw } = toEvidence(s, h.id, d.query);
          addDoc(ev, raw, h.id);
        }
        if (snaps.length) t(h.id, `${d.url}: ${snaps.length} wersji archiwalnych`);
      } catch (e) {
        stats.get(h.id)!.errors.push(`${d.url} – ${(e as Error).message}`);
      }
    }
  }

  // 4. Ekstrakcja adresów i ocena wystąpień
  const groups = new Map<string, { chain: Chain; address: string; occ: Occurrence[] }>();
  let occN = 0;
  for (const ev of evidence.values()) {
    for (const seg of ev.segments) {
      const text = normalizeText(seg.text);
      for (const ext of extractAddresses(text)) {
        const link = linkFor(seg, ev, identities);
        const context = assessContext(ev.sourceKind, `${ev.title}. ${localContext(text, ext.start, ext.end)}`);
        if (llm && link && occN < 40) {
          const s = await llm.classifyContext(`${ev.title}\n${ext.context}`);
          if (s) context.aiSuggestion = { ...s, model: llm.model };
        }
        const key = addressKey(ext.chain, ext.address);
        const occ: Occurrence = {
          id: `oc_${++occN}`,
          chain: ext.chain,
          address: ext.address,
          evidenceId: ev.id,
          segmentId: seg.id,
          url: seg.anchor ?? ev.url,
          family: ev.family,
          sourceKind: ev.sourceKind,
          authorHandle: seg.author?.handle ?? ev.owner?.handle ?? seg.author?.displayName ?? ev.owner?.displayName,
          identityLink: link,
          context,
          extraction: { raw: ext.raw, validation: ext.validation, deobfuscated: ext.deobfuscated, context: ext.context, notes: ext.notes },
          publishedAt: seg.publishedAt,
          fetchedAt: ev.fetchedAt,
          archivedAt: ev.archivedAt,
          historicalOnly: Boolean(ev.archivedAt),
        };
        const g = groups.get(key) ?? { chain: ext.chain, address: ext.address, occ: [] };
        g.occ.push(occ);
        groups.set(key, g);
      }
    }
  }
  const inputAddresses = identities.filter((i) => i.type === 'address').map((i) => validateAddress(i.value)).filter((v) => v.valid);
  for (const v of inputAddresses) {
    const key = addressKey(v.chain!, v.canonical!);
    if (!groups.has(key)) groups.set(key, { chain: v.chain!, address: v.canonical!, occ: [] });
  }
  t('extract', `Wykryto ${groups.size} unikalnych adresów w ${evidence.size} dokumentach (${occN} wystąpień)`);

  // 5–6. Klasyfikacja, scoring, analiza blockchain
  const findings: AddressFinding[] = [];
  const inputKeys = new Set(inputAddresses.map((v) => addressKey(v.chain!, v.canonical!)));
  for (const [key, g] of groups) {
    const subjectOcc = g.occ.filter((o) => o.identityLink);
    const foreignOcc = g.occ.filter((o) => !o.identityLink);
    if (!subjectOcc.length && !inputKeys.has(key)) continue;
    const code = g.chain === 'ETH' ? await chain.getCode(g.chain, g.address) : null;
    let isContract = code === null ? null : !/^0x0*$/.test(code);
    // KROK 3.1: etykiety z API eksploratora (gdy brak w lokalnym rejestrze)
    if (!labels.get(g.chain, g.address)) {
      const info = await chain.getInfo(g.chain, g.address);
      if (info) {
        if (isContract === null && info.isContract !== undefined) isContract = info.isContract;
        const tagText = info.tags.join(' ').toLowerCase();
        const cex = /(binance|kraken|coinbase|okx|okex|bybit|kucoin|bitfinex|huobi|htx|gate\.io|bitstamp|gemini|crypto\.com|zonda|bitbay|exchange|hot wallet|deposit)/.test(tagText);
        if (cex) labels.add({ chain: g.chain, address: g.address, entity: info.tags.join(', '), category: 'CEX', source: info.source });
        else if (/(tornado|mixer)/.test(tagText)) labels.add({ chain: g.chain, address: g.address, entity: info.tags.join(', '), category: 'MIXER', source: info.source });
        else if (info.isContract && info.name) labels.add({ chain: g.chain, address: g.address, entity: `Kontrakt ${info.name}`, category: /router|swap|dex|pool|pair/i.test(info.name) ? 'DEX' : /token|erc20|usd/i.test(info.name) ? 'TOKEN_CONTRACT' : 'SMART_CONTRACT', source: `${info.source} (zweryfikowany kontrakt)` });
        if (info.tags.length || info.name) t('labels', `${key}: ${info.source} → ${[info.name, ...info.tags].filter(Boolean).join(', ')}`);
      }
    }
    const classification = classifyAddress(g.chain, g.address, labels, isContract);
    const excluded = isExcluded(classification.category);
    const transfers = excluded ? null : await chain.getTransfers(g.chain, g.address);
    const verifiedOnChain = Boolean(labels.get(g.chain, g.address)) || code !== null || transfers !== null;
    const attribution = computeConfidence({ subjectOccurrences: subjectOcc, allOccurrences: g.occ, classification, verifiedOnChain });
    let activity;
    if (!excluded && transfers && transfers.length) {
      const neighbours = new Map<string, Transfer[]>();
      const outCps = [...new Set(transfers.filter((x) => addressKey(g.chain, x.from) === key).map((x) => x.to))].filter((a) => !labels.get(g.chain, a)).slice(0, 8);
      for (const n of outCps) {
        const nt = await chain.getTransfers(g.chain, n);
        if (nt) neighbours.set(n, nt);
      }
      activity = analyzeChain({ chain: g.chain, address: g.address, transfers, neighbours, labels, rates, dataSource: chain.sourceFor(g.chain) });
      if (transfers.length >= 1000) t('chain', `${key}: pobrano pierwsze ${transfers.length} transferów – historia może być niepełna`);
    }
    findings.push({ key, chain: g.chain, address: g.address, classification, attribution, occurrences: subjectOcc, foreignOccurrences: foreignOcc, activity, explorerUrl: chain.explorerUrl(g.chain, g.address) });
    t('score', `${key}: ${classification.category} → ${attribution.score}% (${attribution.band})${activity ? `, ${activity.indicators.length} wskaźnik(ów) aktywności` : ''}`);
  }
  findings.sort((a, b) => Number(a.attribution.gated) - Number(b.attribution.gated) || b.attribution.score - a.attribution.score);

  // 7. Zmiany w czasie, twierdzenia
  const profileChanges = detectProfileChanges(
    [...evidence.values()].filter((d) => d.sourceKind === 'OWN_PROFILE' || d.sourceKind === 'OWN_WEBSITE'),
    (d) => d.url,
  );
  if (profileChanges.length) t('history', `Wykryto ${profileChanges.length} zmian(y) adresów publikowanych na tych samych zasobach`);
  const evidenceList = [...evidence.values()];
  const statements = buildStatements(findings, identities, profileChanges, evidenceList);
  t('done', `Zakończono: ${findings.filter((f) => !f.attribution.gated && f.attribution.score >= 60).length} adres(ów) ≥60%, ${findings.filter((f) => f.attribution.gated).length} odrzuconych`);

  const result: AnalysisResult = {
    engineVersion: ENGINE_VERSION,
    rulesVersion: RULES_VERSION,
    startedAt,
    finishedAt: new Date().toISOString(),
    input: input.identifiers,
    params: {
      maxDepth,
      useHistory: historyConnectors.length > 0,
      connectors: connectors.map((c) => c.id),
      disabledConnectors: [...disabled],
      chainProvider: chain.id,
      egressAllowlist: config.egressAllowlist,
      labelDatasets: deps.labelDatasets,
      rates: { source: rates.source, asOf: rates.asOf, usdPln: rates.usdPln },
      webFetch: config.webFetch,
      llm: llm ? llm.model : null,
    },
    identities,
    evidence: evidenceList.map(({ segments: _s, ...rest }) => rest),
    findings,
    profileChanges,
    statements,
    trace,
    egress,
    connectorsUsed: [...stats.values()],
  };
  return { result, raw: rawContent };
}
