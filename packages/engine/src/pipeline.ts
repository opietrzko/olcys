/**
 * Pipeline analizy KryptoTrop:
 *  1. Identyfikatory wejściowe -> konektory Web2 -> dokumenty-dowody (URL, czas, SHA-256, surowa treść)
 *  2. Pivotowanie: identyfikatory odkryte na profilach podmiotu (Telegram, WWW, e-mail...) -> kolejne źródła
 *  3. Historia zasobów (archiwum) -> wykrywanie podmiany adresów
 *  4. Ekstrakcja i walidacja adresów, przypisanie autora do tożsamości podmiotu, ocena kontekstu
 *  5. Klasyfikacja adresów (etykiety, bytecode) -> odrzucanie fałszywych trafień
 *  6. Wskaźnik Pewności (reguły) + analiza aktywności blockchain (cash-out)
 *  7. Fakty / obliczenia / wnioski + pełny ślad przebiegu
 */
import {
  addressKey,
  LabelRegistry,
  analyzeChain,
  assessContext,
  clusterCommonInputs,
  classifyAddress,
  computeConfidence,
  detectProfileChanges,
  extractAddresses,
  inferInstitutional,
  resolveAsset,
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
  type IdentifierType,
  type Occurrence,
  type RateTable,
  type Segment,
  type SubjectIdentity,
  type TraceStep,
  type Transfer,
  type AddressLabel,
} from '@olcys/core';
import { ENGINE_VERSION, type EngineConfig } from './config';
import { ALL_CONNECTORS, HISTORY_CONNECTORS } from './connectors/registry';
import type { ConnectorContext, HistoryConnector, SourceConnector } from './connectors/types';
import { toEvidence } from './evidence';
import { createSafeFetch, type EgressLogEntry } from './http';
import { createLlmClient } from './llm';
import { createChainProvider, type AddressInfo } from './providers';
import { buildStatements } from './statements';
import { extendHistoricalRates, fetchLiveRates } from './rates';

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

/** Limit bezpieczeństwa liczby identyfikatorów w jednym przebiegu (ochrona przed "rozlaniem" analizy). */
const MAX_IDENTITIES = Number(process.env.OLCYS_MAX_IDENTITIES ?? 60);

/** Kolejność przyjmowania tropów z dokumentu przy limicie: identyfikatory osoby przed linkami do stron. */
const PIVOT_PRIORITY: Record<IdentifierType, number> = { nick: 0, telegram: 1, email: 2, phone: 3, name: 4, address: 5, url: 6 };

const norm = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[łŁ]/g, 'l').toLowerCase().replace(/\s+/g, ' ').trim();
const idKey = (i: Identifier) => `${i.type}:${i.type === 'address' ? i.value : i.value.toLowerCase()}`;

export function normalizeIdentifier(i: Identifier): Identifier {
  let v = i.value.trim();
  if (i.type === 'nick' || i.type === 'telegram') v = v.replace(/^@/, '').replace(/^https?:\/\/t\.me\//, '');
  if (i.type === 'email') v = v.toLowerCase();
  if (i.type === 'phone') v = normalizePhone(v) ?? v;
  // https://host/ i https://host to ten sam zasób - bez tego strona byłaby pobierana i liczona dwa razy
  if (i.type === 'url') v = v.replace(/^(https?:\/\/[^/?#]+)\/$/i, '$1');
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
  // Numer telefonu podmiotu w treści (np. kontakt w ogłoszeniu) - wiąże autora z podmiotem także przy innym nicku.
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
    const reason = (doc.meta.weakReason as string | undefined) ?? `nazwa w otwartej przestrzeni nazw (${doc.family}) zgodna z identyfikatorem`;
    return { strength: 'WEAK', identity: c.identity, via: `${reason} – brak wzajemnego potwierdzenia w innym profilu` };
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
  // Imię i nazwisko wymienione w tym samym fragmencie co adres (np. strona z wyników wyszukiwania)
  const segNorm = norm(seg.text);
  const named = identities.find((i) => i.type === 'name' && norm(i.value).length >= 5 && segNorm.includes(norm(i.value)));
  if (named) return { strength: 'WEAK', identity: `name:${named.value}`, via: `imię i nazwisko „${named.value}” wymienione obok adresu (możliwy homonim, autor niepotwierdzony)` };
  return undefined;
}

const CEX_TAG = /(binance|kraken|coinbase|okx|okex|bybit|kucoin|bitfinex|huobi|htx|gate\.io|bitstamp|gemini|crypto\.com|zonda|bitbay|kanga|exchange|hot wallet|deposit)/;
/** Bramki krypto-fiat (on/off-ramp), kantory internetowe i wydawcy kart krypto - sprawdzane przed CEX_TAG, bo ich tagi też zawierają "hot wallet"/"deposit". */
const OFFRAMP_TAG = /(moonpay|transak|ramp network|mercuryo|banxa|simplex|wirex|baanx|paybis|changelly|utorg|guardarian|alchemy pay|revolut|ari10|cashify|walutomat)/;
/** Platformy handlu P2P / escrow. */
const P2P_TAG = /(paxful|localcryptos|localcoinswap|localbitcoins|noones|hodl ?hodl|bisq|p2p)/;

/** Etykieta z odpowiedzi API eksploratora (tagi publiczne / nazwa zweryfikowanego kontraktu). */
export function labelFromInfo(chain: Chain, address: string, info: AddressInfo): AddressLabel | undefined {
  const tagText = info.tags.join(' ').toLowerCase();
  if (OFFRAMP_TAG.test(tagText)) return { chain, address, entity: info.tags.join(', '), category: 'OFFRAMP', source: info.source };
  if (P2P_TAG.test(tagText)) return { chain, address, entity: info.tags.join(', '), category: 'P2P_SERVICE', source: info.source };
  if (CEX_TAG.test(tagText)) return { chain, address, entity: info.tags.join(', '), category: 'CEX', source: info.source };
  if (/(tornado|mixer)/.test(tagText) || /tornado/i.test(info.name ?? '')) return { chain, address, entity: info.tags.join(', ') || `Kontrakt ${info.name}`, category: 'MIXER', source: info.source };
  if (info.isContract && info.name)
    return {
      chain,
      address,
      entity: `Kontrakt ${info.name}`,
      category: /router|swap|dex|pool|pair|aggregat|exchange/i.test(info.name) ? 'DEX' : /token|erc20|usd/i.test(info.name) ? 'TOKEN_CONTRACT' : 'SMART_CONTRACT',
      source: `${info.source} (zweryfikowany kontrakt)`,
    };
  return undefined;
}

/** Linia tekstu zawierająca adres - zawężony kontekst do oceny słów kluczowych. */
function localContext(text: string, start: number, end: number): string {
  const ls = text.lastIndexOf('\n', start) + 1;
  const le = text.indexOf('\n', end);
  const line = text.slice(ls, le === -1 ? undefined : le);
  return line.length <= 320 ? line : text.slice(Math.max(0, start - 120), Math.min(text.length, end + 120));
}

export async function runAnalysis(input: AnalysisInput, deps: EngineDeps): Promise<PipelineOutput> {
  const { config } = deps;
  const labels = new LabelRegistry(deps.labels.all()); // kopia na przebieg - uzupełniana etykietami z API
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
  const stats = new Map<string, { id: string; live: boolean; documents: number; errors: string[]; queries: number }>();
  for (const c of [...connectors, ...historyConnectors]) stats.set(c.id, { id: c.id, live: c.isLive(config), documents: 0, errors: [], queries: 0 });

  const identities: SubjectIdentity[] = [];
  const seen = new Set<string>();
  for (const raw of input.identifiers) {
    const i = normalizeIdentifier(raw);
    if (seen.has(idKey(i))) continue;
    seen.add(idKey(i));
    identities.push({ ...i, strength: 'DIRECT', via: 'Wejście analityka', depth: 0 });
  }
  if (config.recording?.mode === 'replay') t('input', `Tryb offline: odpowiedzi źródeł odtwarzane z nagrania ${config.recording.dir} – żadne żądanie nie wychodzi do sieci`);
  if (config.recording?.mode === 'record') t('input', `Nagrywanie odpowiedzi źródeł do ${config.recording.dir} (do późniejszego odtworzenia offline)`);
  t('input', `Identyfikatory wejściowe:${identities.map((i) => `${i.type}=${i.value}`).join(', ')}; maks. głębokość pivotowania ${maxDepth}`);

  const evidence = new Map<string, EvidenceDocument>();
  const rawContent: Record<string, string> = {};
  const addDoc = (ev: EvidenceDocument, raw: string, connector: string) => {
    if (evidence.has(ev.id)) return false;
    evidence.set(ev.id, ev);
    rawContent[ev.id] = raw;
    stats.get(connector)!.documents++;
    return true;
  };

  // 1-2. Zbieranie i pivotowanie (BFS po identyfikatorach)
  const queue = [...identities];
  let capped = false;
  let maxReached = 0;
  const collectStart = Date.now();
  let budgetHit = false;
  const overBudget = () => {
    if (!budgetHit && Date.now() - collectStart > config.pivotBudgetMs) {
      budgetHit = true;
      t('pivot', `Przekroczono budżet czasu zbierania (${Math.round(config.pivotBudgetMs / 1000)} s) – ${queue.length} nieodpytanych tropów pominięto, analiza przechodzi do oceny zebranych dowodów`);
    }
    return budgetHit;
  };
  while (queue.length && !overBudget()) {
    const id = queue.shift()!;
    for (const c of connectors.filter((x) => x.accepts.includes(id.type) && (x.maxIdentityDepth === undefined || id.depth <= x.maxIdentityDepth))) {
      if (overBudget()) break;
      const ctx: ConnectorContext = { config, fetch, log: (m) => t(c.id, m), warn: (m) => { stats.get(c.id)!.errors.push(m); t(c.id, `Uwaga: ${m}`); } };
      let docs;
      try {
        stats.get(c.id)!.queries++;
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
        // "Macki": podążamy za tropami z dokumentów należących do podmiotu, aż się wyczerpią (z limitem bezpieczeństwa).
        if (id.depth >= maxDepth) continue;
        const links = ev.segments.map((s) => linkFor(s, ev, identities)).filter(Boolean);
        const strong = links.some((l) => l!.strength === 'DIRECT' || l!.strength === 'PIVOT');
        // trop tymczasowy: konto o niepotwierdzonej przynależności (np. znalezione po imieniu) lub gałąź z takiego konta
        const tentativeRoot = !strong && links.some((l) => l!.strength === 'WEAK') && (ev.meta.weakOwnership === true || id.tentative) ? (id.tentative ?? ev.id) : undefined;
        if (!strong && !tentativeRoot) continue;
        // Limit tropów z jednego dokumentu: strona z rozbudowaną nawigacją lub dokumentacja to nie profil osoby.
        const fresh = ev.links.map(normalizeIdentifier).filter((n, i, all) => !seen.has(idKey(n)) && all.findIndex((x) => idKey(x) === idKey(n)) === i);
        const ordered = fresh.sort((a, b) => PIVOT_PRIORITY[a.type] - PIVOT_PRIORITY[b.type]);
        if (ordered.length > config.maxPivotsPerDoc) t('pivot', `${ev.url}: ${ordered.length} tropów w jednym dokumencie – przyjęto ${config.maxPivotsPerDoc} (najpierw nicki, komunikatory, e-maile), ${ordered.length - config.maxPivotsPerDoc} pominięto`);
        for (const n of ordered.slice(0, config.maxPivotsPerDoc)) {
          if (seen.has(idKey(n))) continue;
          if (identities.length >= MAX_IDENTITIES) {
            if (!capped) t('pivot', `Osiągnięto limit ${MAX_IDENTITIES} identyfikatorów – dalsze tropy pominięto`);
            capped = true;
            break;
          }
          seen.add(idKey(n));
          const pivot: SubjectIdentity = tentativeRoot
            ? { ...n, strength: 'WEAK', via: `${n.type} z konta niepotwierdzonego: ${ev.title} (trop tymczasowy)`, evidenceId: ev.id, depth: id.depth + 1, tentative: tentativeRoot }
            : { ...n, strength: 'PIVOT', via: `${n.type} opublikowany w: ${ev.title}`, evidenceId: ev.id, depth: id.depth + 1 };
          identities.push(pivot);
          queue.push(pivot);
          maxReached = Math.max(maxReached, pivot.depth);
          t('pivot', `Nowy ${tentativeRoot ? 'trop tymczasowy' : 'identyfikator'} ${n.type}=${n.value} (głębokość ${pivot.depth}, źródło: ${ev.url})`);
        }
      }
      if (docs.length) t(c.id, `${id.type}=${id.value}: ${docs.length} dokument(ów), nowych ${added}`);
    }
  }

  t(
    'pivot',
    queue.length === 0 && !capped && !budgetHit
      ? `Tropy wyczerpane – ${identities.length} identyfikator(ów), najgłębszy poziom ${maxReached} z ${maxDepth}`
      : `Zakończono na limicie bezpieczeństwa (głębokość ${maxDepth}, maks. ${MAX_IDENTITIES} identyfikatorów, budżet czasu ${Math.round(config.pivotBudgetMs / 1000)} s)`,
  );

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
      // potwierdzenie konta = cała gałąź tropów tymczasowych z niego staje się pełnoprawnym pivotem
      const promoted = identities.filter((i) => i.tentative === d.id);
      for (const i of promoted) {
        i.strength = 'PIVOT';
        i.via = `${i.via.replace(' (trop tymczasowy)', '')} – potwierdzone`;
        delete i.tentative;
      }
      if (promoted.length) t('reciprocal', `Awans ${promoted.length} tropów tymczasowych na pełne powiązanie`);
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
        stats.get(h.id)!.queries++;
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

  // 5-6. Klasyfikacja, scoring, analiza blockchain
  const findings: AddressFinding[] = [];
  const inputKeys = new Set(inputAddresses.map((v) => addressKey(v.chain!, v.canonical!)));
  const infoChecked = new Set<string>();
  /** KROK 3.1 także dla kontrahentów: etykiety z API eksploratora dla najważniejszych kontrahentów (Ethereum). */
  const labelCounterparties = async (c: Chain, own: string, transfers: Transfer[]) => {
    if (c !== 'ETH') return;
    const ownKey = addressKey(c, own);
    const score = new Map<string, { address: string; n: number }>();
    for (const x of transfers) {
      if ((x.network ?? 'ethereum') !== 'ethereum') continue;
      const cp = addressKey(c, x.from) === ownKey ? x.to : x.from;
      const k = addressKey(c, cp);
      if (labels.get(c, cp) || infoChecked.has(k)) continue;
      const e = score.get(k) ?? { address: cp, n: 0 };
      e.n++;
      score.set(k, e);
    }
    const top = [...score.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 12);
    let added = 0;
    for (const [k, { address: cp }] of top) {
      infoChecked.add(k);
      const info = await chain.getInfo(c, cp);
      const l = info && labelFromInfo(c, cp, info);
      if (l) {
        labels.add(l);
        added++;
        t('labels', `Kontrahent ${cp}: ${l.entity} (${l.category}) – ${l.source}`);
      }
    }
    if (top.length) t('labels', `${ownKey}: sprawdzono etykiety ${top.length} kontrahentów w eksploratorze, rozpoznano ${added}`);
  };

  for (const [key, g] of groups) {
    const subjectOcc = g.occ.filter((o) => o.identityLink);
    const foreignOcc = g.occ.filter((o) => !o.identityLink);
    if (!subjectOcc.length && !inputKeys.has(key)) continue;
    // KROK 3.2: flaga kontraktu - Ethereum (eth_getCode), TRON (/wallet/getcontract), Solana (konto wykonywalne = program)
    const code = g.chain === 'ETH' || g.chain === 'TRON' || g.chain === 'SOL' ? await chain.getCode(g.chain, g.address) : null;
    let isContract = code === null ? null : !/^0x0*$/.test(code);
    // KROK 3.1: etykiety z API eksploratora (gdy brak w lokalnym rejestrze)
    if (!labels.get(g.chain, g.address)) {
      const info = await chain.getInfo(g.chain, g.address);
      if (info) {
        if (isContract === null && info.isContract !== undefined) isContract = info.isContract;
        const l = labelFromInfo(g.chain, g.address, info);
        if (l) labels.add(l);
        if (info.tags.length || info.name) t('labels', `${key}: ${info.source} → ${[info.name, ...info.tags].filter(Boolean).join(', ')}`);
      }
    }
    let classification = classifyAddress(g.chain, g.address, labels, isContract);
    const excluded = isExcluded(classification.category);
    const transfers = excluded ? null : await chain.getTransfers(g.chain, g.address);
    for (const n of chain.takeNotes(g.chain)) t('chain', `${key}: ${n}`);
    if (!excluded && transfers === null && chain.errorFor(g.chain)) t('chain', `Uwaga: ${key} – brak danych blockchain: ${chain.errorFor(g.chain)}`);
    // Heurystyka adresu instytucjonalnego (adres bez etykiety, ale z aktywnością typową dla giełdy / usługi)
    // Liczniki pobieramy nawet, gdy historia transferów zawiodła - sama liczba tx wystarcza do rozpoznania giełdy.
    // Bez obu danych wynik dostaje karę zamiast cichego 100%.
    let activityChecked = true;
    if (!excluded) {
      const stats = await chain.getStats(g.chain, g.address);
      activityChecked = transfers !== null || stats?.txCount !== undefined;
      const inferred = activityChecked ? inferInstitutional(g.chain, g.address, transfers ?? [], stats ?? undefined) : undefined;
      if (inferred) {
        classification = classifyAddress(g.chain, g.address, labels, isContract, inferred);
        t('labels', `${key}: ${inferred.reason}`);
      }
      if (!activityChecked) t('labels', `${key}: nie pobrano liczby transakcji ani historii – heurystyka instytucjonalna nie została wykonana`);
    }
    const verifiedOnChain = Boolean(labels.get(g.chain, g.address)) || code !== null || transfers !== null;
    const attribution = computeConfidence({ subjectOccurrences: subjectOcc, allOccurrences: g.occ, classification, verifiedOnChain, activityChecked });
    let activity;
    if (!excluded && transfers && transfers.length) {
      await labelCounterparties(g.chain, g.address, transfers);
      if (config.chain.liveRates) {
        const times = transfers.map((x) => x.timestamp).sort();
        const assets = [...new Set(transfers.map((x) => resolveAsset(x)).filter((a) => a.verified && a.priceKey).map((a) => a.priceKey!))];
        const h = await extendHistoricalRates(fetch, rates, { from: times[0], to: times[times.length - 1], assets }, config.recording?.mode === 'replay' ? undefined : config.priceArchiveDir);
        rates = h.rates;
        if (h.fetched.length) t('rates', `Kursy historyczne: ${h.fetched.join(', ')}`);
        for (const e of h.errors) t('rates', `Uwaga: ${e}`);
      }
      const neighbours = new Map<string, Transfer[]>();
      const outCps = [...new Set(transfers.filter((x) => (x.network ?? 'ethereum') === 'ethereum' || g.chain !== 'ETH').filter((x) => addressKey(g.chain, x.from) === key).map((x) => x.to))].filter((a) => !labels.get(g.chain, a)).slice(0, 8);
      for (const n of outCps) {
        // kontrahent: tylko sieć główna i krótka historia (wystarcza do wykrycia "sweep" na giełdę)
        const nt = await chain.getTransfers(g.chain, n, { mainOnly: true, maxTx: 15 });
        if (nt) neighbours.set(n, nt);
      }
      chain.takeNotes(g.chain);
      activity = analyzeChain({ chain: g.chain, address: g.address, transfers, neighbours, labels, rates, dataSource: chain.sourceFor(g.chain) });
      if (activity.ignoredTokenTransfers) t('chain', `${key}: pominięto ${activity.ignoredTokenTransfers} transferów tokenów spoza rejestru zweryfikowanych kontraktów (możliwy spam / fałszywe stablecoiny)`);
      if (transfers.length >= 1000) t('chain', `${key}: pobrano pierwsze ${transfers.length} transferów – historia może być niepełna`);
    }
    // BTC: klaster adresów współwydawanych (common-input-ownership) - wniosek do weryfikacji, bez wpływu na wynik
    const utxo = !excluded && transfers ? chain.utxoTxs(g.chain, g.address) : undefined;
    const cluster = utxo ? clusterCommonInputs(g.address, utxo, labels) : undefined;
    if (cluster) t('cluster', `${key}: ${cluster.members.length} adres(ów) współwydawanych w ${cluster.multiInputTxs} transakcjach${cluster.coinjoinSkipped.length ? `, pominięto ${cluster.coinjoinSkipped.length} tx o cechach CoinJoin` : ''}${cluster.labeledMembers ? `, ${cluster.labeledMembers} z etykietą instytucji` : ''}`);
    findings.push({ key, chain: g.chain, address: g.address, classification, attribution, occurrences: subjectOcc, foreignOccurrences: foreignOcc, activity, cluster, explorerUrl: chain.explorerUrl(g.chain, g.address) });
    t('score', `${key}: ${classification.category}${classification.inferred ? ' (wniosek)' : ''} → ${attribution.score}% (${attribution.band})${activity ? `, ${activity.indicators.length} wskaźnik(ów) aktywności` : ''}`);
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
      recording: config.recording ? { mode: config.recording.mode, dir: config.recording.dir } : null,
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
