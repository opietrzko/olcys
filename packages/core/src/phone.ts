/**
 * Numery telefonów jako identyfikator (np. ten sam numer w ogłoszeniu P2P i na stronie WWW).
 * Normalizacja do postaci E.164 (domyślnie +48 dla 9-cyfrowych numerów krajowych).
 * Ekstrakcja wymaga słowa kluczowego przed numerem – ogranicza fałszywe trafienia (kwoty, identyfikatory).
 */
const PHONE_RE = /(?:\btel\.?|\btelefon\w*|\bphone|\bkom\.?|\bkomórk\w*|\bwhatsapp|\bsignal|\bsms|\bdzwoń|\bzadzwoń)[:\s]*((?:\+|00)?\d[\d \-()]{7,16}\d)/gi;

export function normalizePhone(input: string): string | null {
  const trimmed = input.trim();
  let digits = trimmed.replace(/\D/g, '');
  const intl = trimmed.startsWith('+') || trimmed.startsWith('00');
  if (trimmed.startsWith('00')) digits = digits.slice(2);
  if (!intl && digits.length === 9) return `+48${digits}`;
  if (!intl && digits.length === 11 && digits.startsWith('48')) return `+${digits}`;
  if (intl && digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  return null;
}

export function extractPhones(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(PHONE_RE)) {
    const n = normalizePhone(m[1]);
    if (n) out.add(n);
  }
  return [...out];
}
