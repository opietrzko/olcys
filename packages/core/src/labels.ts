/**
 * Rejestr etykiet adresów (giełdy, kontrakty, miksery, zbiórki, bramki fiat).
 * Ładowany z lokalnych plików JSON (data/labels) – brak zależności od płatnych API etykiet.
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
 * Klasyfikacja adresu: etykieta (KROK 3.1) → flaga kontraktu (KROK 3.2) → domyślnie kandydat UNHOSTED.
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

export function isExcluded(category: AddressCategory): boolean {
  return EXCLUDED_CATEGORIES.has(category);
}
