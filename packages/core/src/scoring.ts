/**
 * Wskaźnik Pewności (Confidence Score) – algorytm regułowy, deterministyczny i w pełni wyjaśnialny.
 *
 *   score = clamp( BAZA(najlepsze wystąpienie) + Σ korekty , 0, 100 )
 *   BRAMKA: adres z kategorii wykluczonej (CEX, kontrakt, mikser, zbiórka…) => 0%, niezależnie od reszty.
 *
 * Każda reguła zapisuje: identyfikator, wartość, przesłankę i wystąpienia, na których się opiera.
 * Wersja reguł jest zapisywana z każdym wynikiem, by analizę można było odtworzyć.
 */
import type {
  AddressClassification,
  AppliedRule,
  AttributionScore,
  ConfidenceBand,
  ContextCategory,
  LinkStrength,
  Occurrence,
} from './types';
import { EXCLUDED_CATEGORIES } from './types';

export const RULES_VERSION = 'olcys-score/1.0.0';

export const SCORING_RULES = {
  base: {
    OFFICIAL_PROFILE: { value: 85, label: 'Adres na autorskim profilu / stronie podmiotu' },
    SALE_OR_SETTLEMENT: { value: 70, label: 'Adres w ogłoszeniu sprzedaży / rozliczeniu' },
    DISCUSSION: { value: 50, label: 'Adres w dyskusji na forum / grupie' },
    MASS_COMMENT: { value: 20, label: 'Adres w masowych komentarzach (giveaway, konkurs)' },
    THIRD_PARTY_REFERENCE: { value: 15, label: 'Autor wskazuje adres cudzy (np. „wpłaciłem na…”)' },
  } satisfies Record<ContextCategory, { value: number; label: string }>,
  identity: {
    DIRECT: { value: 0, label: 'Autor = identyfikator podany przez analityka' },
    PIVOT: { value: -5, label: 'Autor powiązany pośrednio (identyfikator odkryty w innym źródle)' },
    MENTION: { value: -20, label: 'Identyfikator podmiotu wymieniony obok adresu – autor treści niepotwierdzony' },
    WEAK: { value: -35, label: 'Powiązanie słabe – autor niepotwierdzony (homonim, nazwa ENS/Keybase, cudze repozytorium)' },
  } satisfies Record<LinkStrength, { value: number; label: string }>,
  ownershipClaim: { value: 5, label: 'Autor deklaruje adres jako własny' },
  synergy: { value: 15, minFamilies: 2, label: 'Synergia śladów – ≥2 niezależne źródła Web2' },
  crossIdentityReuse: { value: -30, minForeignAuthors: 3, label: 'Ten sam adres publikują niezależne, obce tożsamości' },
  historicalOnly: { value: -5, label: 'Adres widoczny tylko w archiwalnej wersji zasobu' },
  unverifiedOnChain: { value: -10, label: 'Brak weryfikacji adresu w blockchainie (etykieta/bytecode)' },
  inferredInstitutional: { value: -40, label: 'Adres wnioskowany jako instytucjonalny (heurystyka on-chain)' },
  activityUnchecked: { value: -10, label: 'Nie sprawdzono skali aktywności adresu (brak danych do heurystyki instytucjonalnej)' },
} as const;

const SECOND_LEVEL = new Set(['com.pl', 'net.pl', 'org.pl', 'co.uk', 'org.uk', 'com.au', 'co.jp', 'com.br']);
/** Hostingi stron przypisanych do kont – strona `<login>.github.io` to ta sama usługa co profil GitHub. */
const SERVICE_ALIASES: [RegExp, string][] = [
  [/(^|\.)github\.io$|(^|\.)githubusercontent\.com$|^gist\.github\.com$|^github(\.com)?$/, 'github.com'],
  [/(^|\.)gitlab\.io$|^gitlab(\.com)?$/, 'gitlab.com'],
  [/(^|\.)codeberg\.page$|^codeberg(\.org)?$/, 'codeberg.org'],
  [/^t\.me$|^telegram(\.org|\.me)?$/, 'telegram'],
  [/(^|\.)reddit\.com$|^reddit$/, 'reddit'],
];

/**
 * Usługa (pochodzenie) źródła na potrzeby reguły synergii: różne subdomeny jednej domeny i strony hostowane
 * na koncie danego serwisu (GitHub Pages) to JEDNA usługa – wielokrotne wystąpienie w niej nie jest niezależnym potwierdzeniem.
 */
export function sourceService(family: string): string {
  const f = family.toLowerCase().replace(/^www\./, '');
  for (const [re, service] of SERVICE_ALIASES) if (re.test(f)) return service;
  if (!f.includes('.')) return f;
  const parts = f.split('.');
  const n = SECOND_LEVEL.has(parts.slice(-2).join('.')) ? 3 : 2;
  return parts.slice(-n).join('.');
}

export const BANDS: { min: number; band: ConfidenceBand; label: string }[] = [
  { min: 80, band: 'BARDZO_WYSOKIE', label: 'Bardzo wysokie prawdopodobieństwo (80–100%)' },
  { min: 60, band: 'PRAWDOPODOBNE', label: 'Prawdopodobne (60–79%)' },
  { min: 40, band: 'SREDNIE', label: 'Średnie – wymaga drugiego śladu (40–59%)' },
  { min: 1, band: 'NISKIE', label: 'Niskie / szum (1–39%)' },
  { min: 0, band: 'WYKLUCZONE', label: 'Wykluczone / fałszywe trafienie (0%)' },
];

export function bandFor(score: number, gated: boolean): ConfidenceBand {
  if (gated || score <= 0) return 'WYKLUCZONE';
  return BANDS.find((b) => score >= b.min)!.band;
}

function occurrenceScore(o: Occurrence): number {
  if (!o.identityLink) return -Infinity;
  let s = SCORING_RULES.base[o.context.category].value + SCORING_RULES.identity[o.identityLink.strength].value;
  if (o.context.ownershipClaim && o.context.category !== 'THIRD_PARTY_REFERENCE') s += SCORING_RULES.ownershipClaim.value;
  return s;
}

export interface ScoreInput {
  /** Wystąpienia adresu przypisane podmiotowi (identityLink != undefined). */
  subjectOccurrences: Occurrence[];
  /** Wszystkie wystąpienia adresu w zebranym materiale (także obcych autorów). */
  allOccurrences: Occurrence[];
  classification: AddressClassification;
  /** Czy adres zweryfikowano w blockchainie (etykiety + bytecode/historia). */
  verifiedOnChain: boolean;
  /**
   * Whether tx counters or history were fetched, i.e. whether the institutional-address heuristic could run.
   * false => penalty, because without that data an exchange or service would look like a personal wallet. Defaults to true.
   */
  activityChecked?: boolean;
}

export function computeConfidence(input: ScoreInput): AttributionScore {
  const { subjectOccurrences, allOccurrences, classification } = input;
  const rules: AppliedRule[] = [];
  const allIds = subjectOccurrences.map((o) => o.id);

  // BRAMKA – KROK 3 załącznika
  if (EXCLUDED_CATEGORIES.has(classification.category) && !classification.inferred) {
    rules.push({
      ruleId: `GATE_${classification.category}`,
      label: `Wykluczenie: ${classification.category}${classification.entity ? ` (${classification.entity})` : ''}`,
      kind: 'gate',
      delta: 0,
      premise: classification.reasons.join('; '),
      occurrenceIds: allIds,
    });
    return { score: 0, band: 'WYKLUCZONE', gated: true, rules, rulesVersion: RULES_VERSION };
  }

  if (subjectOccurrences.length === 0) {
    rules.push({ ruleId: 'NO_SUBJECT_LINK', label: 'Brak wystąpień powiązanych z podmiotem', kind: 'info', delta: 0, premise: 'Adres publikowany wyłącznie przez obce tożsamości', occurrenceIds: [] });
    return { score: 0, band: 'WYKLUCZONE', gated: false, rules, rulesVersion: RULES_VERSION };
  }

  // BAZA – najlepsze pojedyncze wystąpienie
  const best = [...subjectOccurrences].sort((a, b) => occurrenceScore(b) - occurrenceScore(a))[0];
  const baseRule = SCORING_RULES.base[best.context.category];
  rules.push({
    ruleId: `BASE_${best.context.category}`,
    label: baseRule.label,
    kind: 'base',
    delta: baseRule.value,
    premise: `${best.family}: ${best.url} — ${best.context.reasons.join('; ')}`,
    occurrenceIds: [best.id],
  });
  const idRule = SCORING_RULES.identity[best.identityLink!.strength];
  if (idRule.value !== 0) {
    rules.push({
      ruleId: `IDENTITY_${best.identityLink!.strength}`,
      label: idRule.label,
      kind: 'penalty',
      delta: idRule.value,
      premise: `Autor „${best.authorHandle ?? '?'}” ↔ ${best.identityLink!.identity} (${best.identityLink!.via})`,
      occurrenceIds: [best.id],
    });
  }
  if (best.context.ownershipClaim && best.context.category !== 'THIRD_PARTY_REFERENCE') {
    rules.push({
      ruleId: 'OWNERSHIP_CLAIM',
      label: SCORING_RULES.ownershipClaim.label,
      kind: 'bonus',
      delta: SCORING_RULES.ownershipClaim.value,
      premise: `Słowa kluczowe: ${best.context.matchedKeywords.join(', ')}`,
      occurrenceIds: [best.id],
    });
  }

  // SYNERGIA – niezależne rodziny źródeł (wielokrotność w jednym serwisie się nie liczy)
  const strong = subjectOccurrences.filter((o) => (o.identityLink!.strength === 'DIRECT' || o.identityLink!.strength === 'PIVOT') && o.context.category !== 'THIRD_PARTY_REFERENCE' && o.context.category !== 'MASS_COMMENT');
  const families = [...new Set(strong.map((o) => sourceService(o.family)))];
  if (families.length >= SCORING_RULES.synergy.minFamilies) {
    rules.push({
      ruleId: 'SYNERGY',
      label: SCORING_RULES.synergy.label,
      kind: 'bonus',
      delta: SCORING_RULES.synergy.value,
      premise: `Niezależne źródła: ${families.join(', ')} (źródła: ${[...new Set(strong.map((o) => o.family))].join(', ')})`,
      occurrenceIds: strong.map((o) => o.id),
    });
  }

  // WIELE OBCYCH TOŻSAMOŚCI – adres zbiórki / organizatora giveaway / scam
  const foreignAuthors = new Set(
    allOccurrences.filter((o) => !o.identityLink && o.authorHandle).map((o) => o.authorHandle!.toLowerCase()),
  );
  if (foreignAuthors.size >= SCORING_RULES.crossIdentityReuse.minForeignAuthors) {
    rules.push({
      ruleId: 'CROSS_IDENTITY_REUSE',
      label: SCORING_RULES.crossIdentityReuse.label,
      kind: 'penalty',
      delta: SCORING_RULES.crossIdentityReuse.value,
      premise: `${foreignAuthors.size} obcych autorów: ${[...foreignAuthors].slice(0, 6).join(', ')}`,
      occurrenceIds: allOccurrences.filter((o) => !o.identityLink).map((o) => o.id),
    });
  }

  if (subjectOccurrences.every((o) => o.historicalOnly)) {
    rules.push({
      ruleId: 'HISTORICAL_ONLY',
      label: SCORING_RULES.historicalOnly.label,
      kind: 'penalty',
      delta: SCORING_RULES.historicalOnly.value,
      premise: `Archiwum: ${subjectOccurrences.map((o) => o.archivedAt).filter(Boolean).join(', ')}`,
      occurrenceIds: allIds,
    });
  }

  if (classification.inferred && EXCLUDED_CATEGORIES.has(classification.category)) {
    rules.push({
      ruleId: 'INFERRED_INSTITUTIONAL',
      label: SCORING_RULES.inferredInstitutional.label,
      kind: 'penalty',
      delta: SCORING_RULES.inferredInstitutional.value,
      premise: classification.reasons.join('; '),
      occurrenceIds: allIds,
    });
  }

  if (!input.verifiedOnChain) {
    rules.push({
      ruleId: 'UNVERIFIED_ON_CHAIN',
      label: SCORING_RULES.unverifiedOnChain.label,
      kind: 'penalty',
      delta: SCORING_RULES.unverifiedOnChain.value,
      premise: 'Dostawca danych blockchain nie zwrócił informacji o adresie',
      occurrenceIds: allIds,
    });
  }

  if (input.verifiedOnChain && input.activityChecked === false) {
    rules.push({
      ruleId: 'ACTIVITY_UNCHECKED',
      label: SCORING_RULES.activityUnchecked.label,
      kind: 'penalty',
      delta: SCORING_RULES.activityUnchecked.value,
      premise: 'Dostawca danych blockchain nie zwrócił liczby transakcji ani historii adresu (np. limit zapytań) – nie wykluczono adresu giełdy lub usługi',
      occurrenceIds: allIds,
    });
  }

  const raw = rules.reduce((s, r) => s + r.delta, 0);
  const score = Math.max(0, Math.min(100, raw));
  if (raw > 100) rules.push({ ruleId: 'CAP_100', label: 'Ograniczenie do 100%', kind: 'info', delta: 100 - raw, premise: `Suma reguł = ${raw}`, occurrenceIds: [] });
  if (raw < 0) rules.push({ ruleId: 'FLOOR_0', label: 'Ograniczenie do 0%', kind: 'info', delta: -raw, premise: `Suma reguł = ${raw}`, occurrenceIds: [] });
  return { score, band: bandFor(score, false), gated: false, rules, bestOccurrenceId: best.id, rulesVersion: RULES_VERSION };
}
