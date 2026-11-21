/**
 * Wspólny model domenowy OŁCyŚ.
 * Nazewnictwo kategorii odpowiada załącznikowi pojęciowo-metodycznemu KAS (KROK 1–3).
 */

export type Chain = 'BTC' | 'ETH' | 'TRON' | 'LTC' | 'SOL';

/** Typ identyfikatora wejściowego / odkrytego podczas pivotowania. */
export type IdentifierType = 'name' | 'nick' | 'email' | 'telegram' | 'url' | 'address';

/** Siła powiązania identyfikatora z badanym podmiotem. */
export type LinkStrength = 'DIRECT' | 'PIVOT' | 'WEAK';

export interface Identifier {
  type: IdentifierType;
  value: string;
}

export interface SubjectIdentity extends Identifier {
  strength: LinkStrength;
  /** Skąd wiemy, że identyfikator należy do podmiotu (np. "wejście analityka", "link na profilu devhub/krypto_janek"). */
  via: string;
  /** Identyfikator dokumentu-dowodu, z którego odkryto powiązanie (dla PIVOT). */
  evidenceId?: string;
  depth: number;
}

/** Rodzaj źródła Web2 – decyduje o wyniku bazowym (KROK 2). */
export type SourceKind =
  | 'OWN_PROFILE' // autorski profil (GitHub, zweryfikowane social media)
  | 'OWN_WEBSITE' // osobista strona WWW
  | 'P2P_LISTING' // ogłoszenie sprzedaży / oferta P2P
  | 'EMAIL_SIGNATURE'
  | 'MESSENGER' // publiczny kanał / komunikator
  | 'FORUM' // forum branżowe, grupa tematyczna
  | 'MASS_COMMENT' // giveaway, konkurs, masowe komentarze
  | 'UNKNOWN';

/** Kategoria kontekstu wystąpienia adresu po analizie treści. */
export type ContextCategory =
  | 'OFFICIAL_PROFILE'
  | 'SALE_OR_SETTLEMENT'
  | 'DISCUSSION'
  | 'MASS_COMMENT'
  | 'THIRD_PARTY_REFERENCE'; // autor wskazuje cudzy adres ("wpłaciłem na giełdę 0x...")

/** Kategoria adresu Web3 (KROK 1). */
export type AddressCategory =
  | 'UNHOSTED' // kandydat na prywatny portfel – cel atrybucji
  | 'CEX'
  | 'CUSTODIAL'
  | 'DEX'
  | 'SMART_CONTRACT'
  | 'TOKEN_CONTRACT'
  | 'MIXER'
  | 'CHARITY'
  | 'BRIDGE'
  | 'OFFRAMP' // bramki krypto-fiat, kantory, karty krypto
  | 'P2P_SERVICE'
  | 'SANCTIONED'
  | 'UNKNOWN';

/** Kategorie, których NIE przypisujemy osobie (0%) – odnotowujemy tylko interakcję. */
export const EXCLUDED_CATEGORIES: ReadonlySet<AddressCategory> = new Set<AddressCategory>([
  'CEX',
  'CUSTODIAL',
  'DEX',
  'SMART_CONTRACT',
  'TOKEN_CONTRACT',
  'MIXER',
  'CHARITY',
  'BRIDGE',
  'OFFRAMP',
  'P2P_SERVICE',
  'SANCTIONED',
]);

export interface AddressLabel {
  chain: Chain;
  address: string;
  entity: string;
  category: AddressCategory;
  /** Pochodzenie etykiety – zbiór danych, API, ręczna weryfikacja. */
  source: string;
  note?: string;
}

export interface ExtractedAddress {
  chain: Chain;
  /** Postać kanoniczna (ETH: EIP-55, BTC bech32: lowercase). */
  address: string;
  raw: string;
  start: number;
  end: number;
  context: string;
  validation: 'checksum' | 'format';
  deobfuscated: boolean;
  notes: string[];
}

/** Fragment dokumentu z jednym autorem (np. pojedynczy post w wątku). */
export interface Segment {
  id: string;
  author?: { handle?: string; displayName?: string };
  text: string;
  publishedAt?: string;
  anchor?: string;
}

/** Dowód: pobrany zasób Web2 wraz z metadanymi pozwalającymi odtworzyć analizę. */
export interface EvidenceDocument {
  id: string;
  connector: string;
  family: string; // niezależne źródło (np. "github", "forum.example", "p2p.example")
  sourceKind: SourceKind;
  url: string;
  title: string;
  fetchedAt: string;
  contentType: string;
  sha256: string;
  sizeBytes: number;
  /** Data archiwizacji, jeśli dokument pochodzi z archiwum (Wayback). */
  archivedAt?: string;
  /** Właściciel dokumentu (np. profil), jeśli jest jeden. */
  owner?: { handle?: string; displayName?: string };
  segments: Segment[];
  /** Identyfikatory odkryte w dokumencie (pivot). */
  links: Identifier[];
  query: Identifier;
  meta: Record<string, unknown>;
}

export interface ContextAssessment {
  category: ContextCategory;
  ownershipClaim: boolean;
  matchedKeywords: string[];
  reasons: string[];
  /** Podpowiedź modelu AI (pomocnicza, nie wpływa bezpośrednio na wynik). */
  aiSuggestion?: { category: ContextCategory; model: string; rationale: string };
}

export interface Occurrence {
  id: string;
  chain: Chain;
  address: string;
  evidenceId: string;
  segmentId: string;
  url: string;
  family: string;
  sourceKind: SourceKind;
  authorHandle?: string;
  /** Powiązanie autora wystąpienia z podmiotem; brak = autor obcy. */
  identityLink?: { strength: LinkStrength; identity: string; via: string };
  context: ContextAssessment;
  extraction: Pick<ExtractedAddress, 'raw' | 'validation' | 'deobfuscated' | 'context' | 'notes'>;
  publishedAt?: string;
  fetchedAt: string;
  archivedAt?: string;
  /** true = adres widoczny tylko w archiwalnej wersji zasobu. */
  historicalOnly: boolean;
}

export interface AddressClassification {
  category: AddressCategory;
  entity?: string;
  labelSource?: string;
  /** true = bytecode != 0x; null = nie sprawdzono. */
  isContract: boolean | null;
  inferred: boolean;
  reasons: string[];
}

export type RuleKind = 'base' | 'bonus' | 'penalty' | 'gate' | 'info';

export interface AppliedRule {
  ruleId: string;
  label: string;
  kind: RuleKind;
  delta: number;
  premise: string;
  occurrenceIds: string[];
}

export type ConfidenceBand = 'BARDZO_WYSOKIE' | 'PRAWDOPODOBNE' | 'SREDNIE' | 'NISKIE' | 'WYKLUCZONE';

export interface AttributionScore {
  score: number;
  band: ConfidenceBand;
  gated: boolean;
  rules: AppliedRule[];
  bestOccurrenceId?: string;
  rulesVersion: string;
}

/* ---------- Blockchain ---------- */

export interface Transfer {
  chain: Chain;
  hash: string;
  timestamp: string;
  from: string;
  to: string;
  asset: string; // ETH, BTC, USDT, USDC, TRX ...
  amount: number;
  /** Adres kontraktu tokena / metoda wywołana (np. "swapExactETHForTokens"). */
  tokenContract?: string;
  method?: string;
}

export type IndicatorType =
  | 'CEX_DIRECT'
  | 'CEX_DEPOSIT_INFERRED'
  | 'STABLECOIN_SWAP'
  | 'OFFRAMP'
  | 'P2P_PATTERN'
  | 'MIXER_EXPOSURE'
  | 'HIGH_VOLUME';

export interface ActivityIndicator {
  type: IndicatorType;
  severity: 'info' | 'medium' | 'high';
  title: string;
  description: string;
  /** computed = wynik obliczenia z danych; inferred = wniosek heurystyczny do weryfikacji. */
  basis: 'computed' | 'inferred';
  txHashes: string[];
  counterparty?: string;
  counterpartyLabel?: string;
  amountUsd?: number;
}

export interface TimelineEntry {
  timestamp: string;
  hash: string;
  direction: 'IN' | 'OUT';
  asset: string;
  amount: number;
  usd: number | null;
  counterparty: string;
  counterpartyLabel?: string;
  note?: string;
}

export interface ChainActivity {
  chain: Chain;
  address: string;
  dataSource: string;
  txCount: number;
  firstSeen?: string;
  lastSeen?: string;
  totals: { asset: string; in: number; out: number }[];
  totalInUsd: number;
  totalOutUsd: number;
  totalInPln: number;
  totalOutPln: number;
  counterparties: { address: string; label?: string; category?: AddressCategory; inUsd: number; outUsd: number; txCount: number }[];
  indicators: ActivityIndicator[];
  timeline: TimelineEntry[];
  rates: RateTable;
}

export interface RateTable {
  source: string;
  asOf: string;
  usdPln: number;
  usd: Record<string, number>;
}
