import type { EvidenceDocument, Identifier, IdentifierType } from '@olcys/core';
import type { EngineConfig } from '../config';
import type { CollectedDocument } from '../evidence';
import type { SafeFetch } from '../http';

export interface ConnectorContext {
  config: EngineConfig;
  fetch: SafeFetch;
  log: (message: string) => void;
  /** Problem ze źródłem (limit API, błąd HTTP) – trafia do raportu jako błąd konektora, analiza trwa dalej. */
  warn: (message: string) => void;
}

/** Konektor źródła Web2. Nowe źródło = nowa klasa implementująca ten interfejs + rejestracja w registry.ts. */
export interface SourceConnector {
  id: string;
  title: string;
  /** Opis legalności / zgodności z regulaminem źródła – prezentowany w UI i dokumentacji. */
  compliance: string;
  accepts: IdentifierType[];
  /** Maks. głębokość pivotu identyfikatora, dla której konektor jest wywoływany (np. wyszukiwarka – tylko blisko wejścia). */
  maxIdentityDepth?: number;
  /** Czy w bieżącej konfiguracji konektor sięga do realnego Internetu. */
  isLive(config: EngineConfig): boolean;
  enabled(config: EngineConfig): boolean;
  collect(query: Identifier, ctx: ConnectorContext): Promise<CollectedDocument[]>;
}

/** Konektor historii zasobu (archiwum) – zwraca wcześniejsze wersje dokumentu. */
export interface HistoryConnector {
  id: string;
  title: string;
  compliance: string;
  isLive(config: EngineConfig): boolean;
  history(doc: EvidenceDocument, ctx: ConnectorContext): Promise<CollectedDocument[]>;
}

