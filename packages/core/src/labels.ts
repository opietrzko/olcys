/**
 * Rejestr etykiet adresów (giełdy, kontrakty, miksery, zbiórki, bramki fiat).
 * Ładowany z lokalnych plików JSON (data/labels) - brak zależności od płatnych API etykiet.
 */
import { addressKey } from './chains';
import type { AddressCategory, AddressClassification, AddressLabel, Chain } from './types';
import { EXCLUDED_CATEGORIES } from './types';

export class LabelRegistry {
  private map = new Map<string, AddressLabel>();

  constructor(labels: AddressLabel[] = []) {
    for (const l of labels) this.add(l);
  }

  add(label: AddressLabel): void {
    this.map.set(addressKey(label.chain, label.address), label);
  }

  get(chain: Chain, address: string): AddressLabel | undefined {
    return this.map.get(addressKey(chain, address));
  }

  get size(): number {
    return this.map.size;
  }

  all(): AddressLabel[] {
    return [...this.map.values()];
  }
}

/**
 * Klasyfikacja adresu: etykieta (KROK 3.1) -> flaga kontraktu (KROK 3.2) -> domyślnie kandydat UNHOSTED.
 * @param isContract wynik eth_getCode (true/false) lub null gdy nie sprawdzono / nie dotyczy.
 */
export function classifyAddress(
  chain: Chain,
  address: string,
  registry: LabelRegistry,
  isContract: boolean | null,
  inferred?: { category: AddressCategory; entity: string; reason: string },
): AddressClassification {
  const label = registry.get(chain, address);
  const reasons: string[] = [];
  if (label) {
    reasons.push(`Etykieta „${label.entity}” (${label.category}) ze zbioru: ${label.source}`);
    if (isContract === true) reasons.push('Adres posiada kod wykonywalny (bytecode ≠ 0x)');
    return { category: label.category, entity: label.entity, labelSource: label.source, isContract, inferred: false, reasons };
  }
  if (isContract === true) {
    reasons.push('Adres posiada kod wykonywalny (bytecode ≠ 0x) – smart kontrakt, nie konto prywatne');
    return { category: 'SMART_CONTRACT', isContract, inferred: false, reasons };
  }
  if (inferred) {
    reasons.push(inferred.reason);
    return { category: inferred.category, entity: inferred.entity, isContract, inferred: true, reasons };
  }
  if (isContract === false) reasons.push('Brak kodu wykonywalnego (bytecode = 0x) – konto EOA');
  if (isContract === null && chain === 'ETH') reasons.push('Nie sprawdzono kodu bajtowego (brak danych z API)');
  reasons.push('Brak etykiety podmiotu instytucjonalnego w rejestrze');
  return { category: 'UNHOSTED', isContract, inferred: false, reasons };
}

/** Progi heurystyki "adres instytucjonalny" - profil aktywności typowy dla giełdy / usługi, a nie osoby. */
export const INSTITUTIONAL_THRESHOLDS = { txCount: 5000, distinctCounterparties: 300 };

/**
 * Heurystyka on-chain (KROK 3, uzupełnienie etykiet): adres bez etykiety, ale z liczbą transakcji lub kontrahentów
 * typową dla giełdy, bramki płatniczej czy usługi custodial. Wynik to WNIOSEK (kara −40), a nie bramka 0%,
 * bo duża aktywność nie przesądza o charakterze adresu.
 */
export function inferInstitutional(
  chain: Chain,
  address: string,
  transfers: { from: string; to: string }[],
  stats?: { txCount?: number },
): { category: AddressCategory; entity: string; reason: string } | undefined {
  const key = addressKey(chain, address);
  const cps = new Set<string>();
  for (const t of transfers) {
    const out = addressKey(chain, t.from) === key;
    cps.add(addressKey(chain, out ? t.to : t.from));
  }
  const txCount = stats?.txCount ?? 0;
  const hitsTx = txCount >= INSTITUTIONAL_THRESHOLDS.txCount;
  const hitsCp = cps.size >= INSTITUTIONAL_THRESHOLDS.distinctCounterparties;
  if (!hitsTx && !hitsCp) return undefined;
  const parts = [hitsTx ? `${txCount} transakcji w historii (próg ${INSTITUTIONAL_THRESHOLDS.txCount})` : '', hitsCp ? `${cps.size} różnych kontrahentów w pobranym fragmencie historii (próg ${INSTITUTIONAL_THRESHOLDS.distinctCounterparties})` : ''].filter(Boolean);
  return {
    category: 'CUSTODIAL',
    entity: 'Adres o aktywności instytucjonalnej (bez etykiety)',
    reason: `Heurystyka on-chain: ${parts.join('; ')} – profil typowy dla giełdy, bramki lub usługi custodial, nie dla portfela osoby (wniosek do weryfikacji)`,
  };
}

export function isExcluded(category: AddressCategory): boolean {
  return EXCLUDED_CATEGORIES.has(category);
}
