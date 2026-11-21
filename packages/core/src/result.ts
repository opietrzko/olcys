/**
 * Struktura wyniku pojedynczego przebiegu analizy (zapisywana w bazie, renderowana w UI i raporcie).
 * Rozróżnia: FAKTY ŹRÓDŁOWE (co zostało znalezione), WYNIKI OBLICZEŃ (co policzyliśmy),
 * WNIOSKI DO WERYFIKACJI (interpretacje heurystyczne).
 */
import type {
  AddressClassification,
  AttributionScore,
  Chain,
  ChainActivity,
  EvidenceDocument,
  Identifier,
  Occurrence,
  SubjectIdentity,
} from './types';
import type { AddressCluster } from './cluster';

export interface AddressFinding {
  key: string;
  chain: Chain;
  address: string;
  classification: AddressClassification;
  attribution: AttributionScore;
  /** Wystąpienia przypisane podmiotowi. */
  occurrences: Occurrence[];
  /** Wystąpienia tego samego adresu u obcych autorów (kontekst dla reguły reuse). */
  foreignOccurrences: Occurrence[];
  activity?: ChainActivity;
  /** BTC: adresy współwydawane z badanym adresem (heurystyka wspólnego wejścia) – wniosek do weryfikacji. */
  cluster?: AddressCluster;
  explorerUrl?: string;
}

export interface ProfileAddressChange {
  url: string;
  family: string;
  from?: string; // data snapshotu
  to: string;
  removed: string[];
  added: string[];
  evidenceIds: string[];
}

export type StatementKind = 'FACT' | 'COMPUTATION' | 'CONCLUSION';

export interface Statement {
  kind: StatementKind;
  text: string;
  evidenceIds: string[];
  addressKey?: string;
}

export interface TraceStep {
  at: string;
  step: string;
  message: string;
}

export interface AnalysisResult {
  engineVersion: string;
  rulesVersion: string;
  startedAt: string;
  finishedAt: string;
  input: Identifier[];
  params: Record<string, unknown>;
  identities: SubjectIdentity[];
  evidence: Omit<EvidenceDocument, 'segments'>[];
  findings: AddressFinding[];
  profileChanges: ProfileAddressChange[];
  statements: Statement[];
  trace: TraceStep[];
  /** Dziennik ruchu wychodzącego (kontrola zgodności z allowlistą). */
  egress: { at: string; url: string; status: number | 'DENIED' | 'ERROR'; ms: number; kind?: 'api' | 'page'; replay?: boolean }[];
  /** queries = ile razy konektor został odpytany w tym przebiegu (0 = nie dotyczył podanych identyfikatorów). */
  connectorsUsed: { id: string; live: boolean; documents: number; errors: string[]; queries?: number }[];
}

export interface RunDiff {
  baseRunId: string;
  headRunId: string;
  addedAddresses: { key: string; score: number; band: string }[];
  removedAddresses: { key: string; score: number; band: string }[];
  scoreChanges: { key: string; from: number; to: number; delta: number }[];
  newIndicators: { key: string; type: string; title: string }[];
  newIdentities: string[];
  newEvidence: number;
}
