import type { ReactNode } from 'react';

export const BAND_LABEL: Record<string, string> = {
  BARDZO_WYSOKIE: 'Bardzo wysokie',
  PRAWDOPODOBNE: 'Prawdopodobne',
  SREDNIE: 'Średnie',
  NISKIE: 'Niskie / szum',
  WYKLUCZONE: 'Wykluczone',
};

export const CATEGORY_LABEL: Record<string, string> = {
  UNHOSTED: 'Portfel prywatny (kandydat)',
  CEX: 'Giełda scentralizowana',
  CUSTODIAL: 'Portfel powierniczy',
  DEX: 'Giełda zdecentralizowana',
  SMART_CONTRACT: 'Smart kontrakt',
  TOKEN_CONTRACT: 'Kontrakt tokena',
  MIXER: 'Mikser',
  CHARITY: 'Zbiórka',
  BRIDGE: 'Most',
  OFFRAMP: 'Bramka krypto-fiat',
  P2P_SERVICE: 'Usługa P2P',
  SANCTIONED: 'Sankcjonowany',
  UNKNOWN: 'Nieznany',
};

export function Band({ band, score }: { band: string; score?: number }) {
  return (
    <span className={`band band-${band}`}>
      {score !== undefined ? `${score}%` : ''} {BAND_LABEL[band] ?? band}
    </span>
  );
}

export function Card({ title, children, actions, className = '' }: { title?: ReactNode; children: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <header className="card-head">
          {title && <h3>{title}</h3>}
          {actions && <div className="card-actions">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: 'good' | 'warn' | 'bad' | 'muted' }) {
  return (
    <div className={`stat ${tone ?? ''}`}>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

export const short = (a: string, n = 8) => (a.length > n * 2 + 2 ? `${a.slice(0, n + 2)}…${a.slice(-n)}` : a);
export const dt = (s?: string | null) => (s ? new Date(s).toLocaleString('pl-PL') : '—');
export const money = (n: number) => n.toLocaleString('pl-PL', { maximumFractionDigits: 0 });

/** Podświetla adres w kontekście. */
export function Highlight({ text, needle }: { text: string; needle: string }) {
  const i = text.indexOf(needle);
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark>{needle}</mark>
      {text.slice(i + needle.length)}
    </>
  );
}
