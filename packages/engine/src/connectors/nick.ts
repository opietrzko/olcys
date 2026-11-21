/**
 * Nickname variants across platforms with different username rules.
 *
 * Example: GitHub forbids "_" in logins, so a subject known as "jan_kowal" elsewhere may be "jan-kowal" there.
 * A variant account is only attributed with full strength when its own content mentions the original nickname
 * (self-confirmation); otherwise it is marked as a weak link, because anyone could have registered the variant.
 */

export type NickRules = 'github' | 'devto';

/** Candidate logins to try on a platform, the original first. */
export function nickVariants(nick: string, rules: NickRules): string[] {
  const n = nick.trim().replace(/^@/, '');
  const out = [n];
  if (rules === 'github') {
    // GitHub: alphanumerics and single hyphens, no leading/trailing hyphen.
    const v = n.replace(/[_.]+/g, '-').replace(/-{2,}/g, '-').replace(/^-|-$/g, '');
    if (v && v !== n) out.push(v);
  } else if (rules === 'devto') {
    // DEV (Forem): letters, digits and underscores; accounts created via GitHub may map "-" to "_".
    const v = n.replace(/[-.]+/g, '_');
    if (v !== n) out.push(v);
    const w = n.replace(/_+/g, '-');
    if (w !== n && w !== v) out.push(w);
  }
  return [...new Set(out)];
}

export interface VariantConfirmation {
  /** Login actually found on the platform. */
  login: string;
  /** True when the found login differs from the analyst's nickname. */
  isVariant: boolean;
  /** True when a variant account is not confirmed by its own content – the pipeline then treats the link as WEAK. */
  weak: boolean;
  note?: string;
}

/** Decide how strongly a found login belongs to the subject, based on texts published under that login. */
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
