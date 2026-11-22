/**
 * Klasyfikacja kontekstu wystąpienia adresu - regułowa, w pełni wyjaśnialna.
 * Rodzaj źródła (z konektora) wyznacza kategorię startową, słowa kluczowe w otoczeniu adresu mogą ją skorygować.
 */
import type { ContextAssessment, ContextCategory, SourceKind } from './types';

const KIND_TO_CATEGORY: Record<SourceKind, ContextCategory> = {
  OWN_PROFILE: 'OFFICIAL_PROFILE',
  OWN_WEBSITE: 'OFFICIAL_PROFILE',
  P2P_LISTING: 'SALE_OR_SETTLEMENT',
  EMAIL_SIGNATURE: 'SALE_OR_SETTLEMENT',
  MESSENGER: 'SALE_OR_SETTLEMENT',
  FORUM: 'DISCUSSION',
  MASS_COMMENT: 'MASS_COMMENT',
  UNKNOWN: 'DISCUSSION',
};

export const KEYWORDS = {
  massComment: ['giveaway', 'konkurs', 'airdrop', 'rozdajemy', 'drop your', 'zostaw adres', 'wrzuć adres', 'free crypto', 'double your', 'podwój'],
  sale: ['sprzedam', 'sprzedaż', 'kupię', 'cena', 'oferta', 'płatność', 'blik', 'przelew', 'rozliczenie', 'zapłata', 'payment', 'for sale', 'price', 'p2p', 'faktur'],
  ownership: ['mój adres', 'moj adres', 'mój portfel', 'moj portfel', 'my wallet', 'my address', 'wyślij na', 'wyslij na', 'przelej na', 'wpłać na', 'wplac na', 'wesprzyj', 'donate', 'tip jar', 'napiwek', 'send to', 'pay to'],
  thirdParty: ['wysłałem na', 'wyslalem na', 'wpłaciłem na', 'wplacilem na', 'przelałem na', 'adres giełdy', 'adres gieldy', 'kontrakt', 'contract', 'router', 'scam', 'oszust', 'uważajcie', 'uwazajcie', 'sent to', 'deposited to'],
} as const;

function findKeywords(text: string, list: readonly string[]): string[] {
  const lower = text.toLowerCase();
  return list.filter((k) => lower.includes(k));
}

export function assessContext(sourceKind: SourceKind, context: string): ContextAssessment {
  const reasons: string[] = [];
  let category = KIND_TO_CATEGORY[sourceKind];
  reasons.push(`Rodzaj źródła ${sourceKind} → kategoria startowa ${category}`);

  const mass = findKeywords(context, KEYWORDS.massComment);
  const sale = findKeywords(context, KEYWORDS.sale);
  const own = findKeywords(context, KEYWORDS.ownership);
  const third = findKeywords(context, KEYWORDS.thirdParty);

  if (third.length > 0 && own.length === 0) {
    category = 'THIRD_PARTY_REFERENCE';
    reasons.push(`Słowa wskazujące na cudzy adres (${third.join(', ')}) – adres nie jest deklarowany jako własny`);
  } else if (mass.length > 0 && category !== 'OFFICIAL_PROFILE') {
    category = 'MASS_COMMENT';
    reasons.push(`Słowa typowe dla giveaway/konkursu (${mass.join(', ')})`);
  } else if (sale.length > 0 && category === 'DISCUSSION') {
    category = 'SALE_OR_SETTLEMENT';
    reasons.push(`Kontekst transakcyjny w dyskusji (${sale.join(', ')})`);
  }

  if (own.length > 0) reasons.push(`Deklaracja własności adresu (${own.join(', ')})`);

  return {
    category,
    ownershipClaim: own.length > 0,
    matchedKeywords: [...new Set([...mass, ...sale, ...own, ...third])],
    reasons,
  };
}
