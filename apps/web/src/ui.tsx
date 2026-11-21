import { createContext, useEffect, useState, type ReactNode } from 'react';
import { AtSign, Check, CircleAlert, Copy, Globe, Hash, Mail, Phone, Send, User, Wallet, type LucideIcon } from 'lucide-react';

export const BAND_LABEL: Record<string, string> = {
  BARDZO_WYSOKIE: 'Bardzo wysokie',
  PRAWDOPODOBNE: 'Prawdopodobne',
  SREDNIE: 'Średnie',
  NISKIE: 'Niskie / szum',
  WYKLUCZONE: 'Wykluczone',
};

const BAND_STEPS: Record<string, number> = { BARDZO_WYSOKIE: 4, PRAWDOPODOBNE: 3, SREDNIE: 2, NISKIE: 1, WYKLUCZONE: 0 };

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

export const ID_TYPE: Record<string, { label: string; icon: LucideIcon }> = {
  nick: { label: 'Nick', icon: AtSign },
  email: { label: 'E-mail', icon: Mail },
  phone: { label: 'Telefon', icon: Phone },
  telegram: { label: 'Telegram', icon: Send },
  name: { label: 'Imię i nazwisko', icon: User },
  url: { label: 'URL', icon: Globe },
  address: { label: 'Adres krypto', icon: Wallet },
};

export const LINK_LABEL: Record<string, string> = {
  DIRECT: 'Bezpośrednie',
  PIVOT: 'Pośrednie (pivot)',
  MENTION: 'Wzmianka',
  WEAK: 'Słabe (homonim)',
};

/** Wskaźnik Pewności: liczba + 4-segmentowa skala + etykieta słowna (znaczenie nie opiera się na samym kolorze). */
export function Score({ band, score, label = true, value = true }: { band: string; score: number; label?: boolean; value?: boolean }) {
  const steps = BAND_STEPS[band] ?? 0;
  return (
    <span className={`score b-${band}`} title={`Wskaźnik Pewności ${score}% – ${BAND_LABEL[band] ?? band}`}>
      {value && <span className="score-val num">{score}%</span>}
      <span className="meter" aria-hidden="true">
        {[1, 2, 3, 4].map((i) => (
          <i key={i} className={i <= steps ? 'on' : ''} />
        ))}
      </span>
      {label && <span className="score-label">{BAND_LABEL[band] ?? band}</span>}
    </span>
  );
}

export function Band({ band }: { band: string }) {
  return <span className={`band band-${band}`}>{BAND_LABEL[band] ?? band}</span>;
}

export function Panel({ title, children, actions, className = '', flush = false, id }: { title?: ReactNode; children: ReactNode; actions?: ReactNode; className?: string; flush?: boolean; id?: string }) {
  return (
    <section className={`panel ${className}`} id={id} aria-label={typeof title === 'string' ? title : undefined}>
      {(title || actions) && (
        <header className="panel-head">
          {title ? <h2 style={{ fontSize: 14 }}>{title}</h2> : <span />}
          {actions && <div className="actions">{actions}</div>}
        </header>
      )}
      <div className={`panel-body ${flush ? 'flush' : ''}`}>{children}</div>
    </section>
  );
}

export function Stat({ label, value, tone, icon: Icon }: { label: string; value: ReactNode; tone?: 'danger' | 'accent' | 'dim'; icon?: LucideIcon }) {
  return (
    <div className={`stat ${tone ?? ''}`}>
      <div className="stat-label">
        {Icon && <Icon size={14} aria-hidden="true" />}
        {label}
      </div>
      <div className="stat-value num" style={{ textAlign: 'left' }}>
        {value}
      </div>
    </div>
  );
}

export function IdTag({ type, value }: { type: string; value: string }) {
  const t = ID_TYPE[type];
  const Icon = t?.icon ?? Hash;
  return (
    <span className="tag outline" title={t?.label ?? type}>
      <Icon size={12} aria-hidden="true" />
      <span className="sr-only">{t?.label ?? type}: </span>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</span>
    </span>
  );
}

export function Empty({ icon: Icon, title, children, action }: { icon: LucideIcon; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Icon size={20} aria-hidden="true" />
      </div>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function ErrorNote({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="banner danger" role="alert">
      <CircleAlert size={16} aria-hidden="true" />
      <div>
        <b>{title}</b>
        {children && <div className="muted">{children}</div>}
      </div>
    </div>
  );
}

export function Skeleton({ rows = 3, height = 12 }: { rows?: number; height?: number }) {
  return (
    <div style={{ display: 'grid', gap: 10 }} aria-busy="true" aria-label="Ładowanie">
      {Array.from({ length: rows }, (_, i) => (
        <span key={i} className="skel" style={{ height, width: `${92 - ((i * 17) % 40)}%` }} />
      ))}
    </div>
  );
}

/** Faktycznie użyty motyw – potrzebny grafowi (Cytoscape nie czyta zmiennych CSS). */
export const ThemeCtx = createContext<'light' | 'dark'>('light');

export const short = (a: string, n = 8) => (a.length > n * 2 + 2 ? `${a.slice(0, n + 2)}…${a.slice(-n)}` : a);
export const dt = (s?: string | null) => (s ? new Date(s).toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' }) : '—');
export const money = (n: number) => n.toLocaleString('pl-PL', { maximumFractionDigits: 0 });

/** Podświetla adres w kontekście. */
const PL = new Intl.PluralRules('pl-PL');
/** Polska odmiana liczebnika: 1 wystąpienie, 2 wystąpienia, 5 wystąpień. */
export function plural(n: number, one: string, few: string, many: string) {
  const r = PL.select(n);
  return `${n.toLocaleString('pl-PL')} ${r === 'one' ? one : r === 'few' ? few : many}`;
}

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

/* ---------- Motyw (system / jasny / ciemny) ---------- */
export type ThemePref = 'system' | 'light' | 'dark';

function readPref(): ThemePref {
  try {
    const v = localStorage.getItem('olcys-theme');
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

/** Zwraca faktycznie użyty motyw ('light' | 'dark') i preferencję z możliwością zmiany. */
export function useTheme() {
  const [pref, setPref] = useState<ThemePref>(readPref);
  const [sysDark, setSysDark] = useState(() => typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const on = () => setSysDark(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  useEffect(() => {
    const root = document.documentElement;
    if (pref === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', pref);
    try {
      if (pref === 'system') localStorage.removeItem('olcys-theme');
      else localStorage.setItem('olcys-theme', pref);
    } catch {
      /* brak dostępu do magazynu – motyw działa w obrębie sesji */
    }
  }, [pref]);
  const resolved: 'light' | 'dark' = pref === 'system' ? (sysDark ? 'dark' : 'light') : pref;
  return { pref, setPref, resolved };
}

/** Przycisk kopiowania do schowka z potwierdzeniem. */
export function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn sm ghost icon-only"
      style={{ marginLeft: 'auto' }}
      aria-label={done ? 'Skopiowano' : label}
      title={done ? 'Skopiowano' : label}
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        });
      }}
    >
      {done ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
    </button>
  );
}
