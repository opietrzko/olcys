/**
 * Warianty nicku na platformach z różnymi zasadami nazw użytkownika.
 *
 * Np. GitHub nie pozwala na "_" w loginie, więc "jan_kowal" może tam być "jan-kowal".
 * Konto-wariant dostaje pełne powiązanie tylko wtedy, gdy jego treść wspomina oryginalny nick;
 * inaczej powiązanie jest słabe, bo wariant mógł zarejestrować ktokolwiek.
 */

export type NickRules = 'github' | 'devto';

/** Loginy do sprawdzenia na platformie, oryginalny jako pierwszy. */
export function nickVariants(nick: string, rules: NickRules): string[] {
  const n = nick.trim().replace(/^@/, '');
  const out = [n];
  if (rules === 'github') {
    // GitHub: litery, cyfry i pojedyncze myślniki, bez myślnika na początku i końcu.
    const v = n.replace(/[_.]+/g, '-').replace(/-{2,}/g, '-').replace(/^-|-$/g, '');
    if (v && v !== n) out.push(v);
  } else if (rules === 'devto') {
    // DEV (Forem): litery, cyfry i podkreślenia; konta zakładane przez GitHub mogą mieć "_" zamiast "-".
    const v = n.replace(/[-.]+/g, '_');
    if (v !== n) out.push(v);
    const w = n.replace(/_+/g, '-');
    if (w !== n && w !== v) out.push(w);
  }
  return [...new Set(out)];
}

export interface VariantConfirmation {
  /** Login faktycznie znaleziony na platformie. */
  login: string;
  /** true, gdy znaleziony login różni się od nicku podanego przez analityka. */
  isVariant: boolean;
  /** true, gdy treść konta-wariantu go nie potwierdza - pipeline traktuje wtedy powiązanie jako WEAK. */
  weak: boolean;
  note?: string;
}

/** Ocena, jak silnie znaleziony login należy do podmiotu, na podstawie treści opublikowanych pod nim. */
export function confirmVariant(original: string, login: string, texts: string[]): VariantConfirmation {
  const o = original.trim().replace(/^@/, '');
  if (o.toLowerCase() === login.toLowerCase()) return { login, isVariant: false, weak: false };
  const needle = o.toLowerCase();
  const confirmed = texts.some((t) => t.toLowerCase().includes(needle));
  return {
    login,
    isVariant: true,
    weak: !confirmed,
    note: confirmed
      ? `login wariantowy „${login}” potwierdzony: treść konta wymienia nick „${o}”`
      : `login wariantowy „${login}” bez potwierdzenia nicku „${o}” w treści konta – powiązanie słabe`,
  };
}
