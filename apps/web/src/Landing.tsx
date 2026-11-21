import type { MouseEvent, ReactNode } from 'react';
import { ArrowRight, AtSign, Ban, FileText, Globe, Mail, Send, Server, ShieldCheck, UserRoundCheck } from 'lucide-react';
import type { Meta } from './api';
import { Score, plural } from './ui';
import { Wave } from './Wave';

/** Where the call to action leads: the analyst panel. */
const PANEL = '#/analizy';

/** A real run on the fictional test persona "Ksawery Kordas", started from the e-mail address alone. */
const TRAIL: { icon: typeof Mail; source: string; value: string; note: string }[] = [
  { icon: Mail, source: 'E-mail', value: 'ksawery.kordas.dev@proton.me', note: 'jedyne dane na wejściu' },
  { icon: UserRoundCheck, source: 'Gravatar', value: 'zweryfikowane konto GitHub', note: 'profil przypisany do e-maila' },
  { icon: AtSign, source: 'GitHub', value: 'kordas-dev', note: 'bio, strona WWW, README z portfelem' },
  { icon: Globe, source: 'Strona WWW', value: 'kordas-dev.github.io', note: 'portfel BTC i link do komunikatora' },
  { icon: Send, source: 'Telegram', value: '@kordas_sprzedaz', note: 'inny nick niż na GitHubie' },
];

const RESULTS: { chain: string; address: string; band: string; score: number; why: string }[] = [
  { chain: 'ETH', address: '0xd3e7…E61C', band: 'BARDZO_WYSOKIE', score: 100, why: 'profil autorski i drugie, niezależne źródło' },
  { chain: 'BTC', address: 'bc1qj2…mtqz', band: 'BARDZO_WYSOKIE', score: 85, why: 'własna strona osoby' },
  { chain: 'TRON', address: 'TPL5…bZoc', band: 'PRAWDOPODOBNE', score: 70, why: 'ogłoszenie sprzedaży z prośbą o płatność' },
  { chain: 'ETH', address: '0x5b20…0435', band: 'NISKIE', score: 10, why: '„Uważajcie, to scam” – adres cudzy' },
  { chain: 'ETH', address: '0x165C…5e14', band: 'WYKLUCZONE', score: 0, why: 'znana zbiórka, nie portfel osoby' },
];

const STEPS: { title: string; text: string; detail: string }[] = [
  {
    title: 'Podajesz jeden identyfikator',
    text: 'Nick, e-mail, telefon, Telegram, imię i nazwisko, adres strony albo adres portfela.',
    detail: 'Można podać kilka naraz i ustawić analizę cykliczną.',
  },
  {
    title: 'KryptoTrop idzie po śladach',
    text: 'Przeszukuje publiczne profile, strony i kanały. Każdy nowy identyfikator znaleziony u osoby staje się kolejnym tropem.',
    detail: 'GitHub, Gravatar, Keybase, Telegram, ENS, dev.to, strony WWW, archiwum.',
  },
  {
    title: 'Ocenia każdy adres regułami',
    text: 'Wykrywa adresy w tekście, sprawdza sumy kontrolne i liczy Wskaźnik Pewności. Giełdy, kontrakty, miksery i zbiórki dostają 0%.',
    detail: 'Etykiety adresów i kod kontraktu sprawdzane w blockchainie.',
  },
  {
    title: 'Pokazuje przepływy i dowody',
    text: 'Analizuje historię transakcji pod kątem wyjścia do walut tradycyjnych i składa raport z pełnym łańcuchem dowodowym.',
    detail: 'Fakty, obliczenia i wnioski osobno; każde źródło z sumą SHA-256.',
  },
];

const RULES: { label: string; delta: string }[] = [
  { label: 'Adres na autorskim profilu GitHub', delta: '+85' },
  { label: 'Autor znaleziony przez trop (pivot), nie na wejściu', delta: '−5' },
  { label: 'Deklaracja własności: „Wesprzyj moje projekty”', delta: '+5' },
  { label: 'Ten sam adres w drugim, niezależnym źródle (Telegram)', delta: '+15' },
];

const REJECTED: { what: string; why: string }[] = [
  { what: 'Portfel giełdy Binance', why: 'etykieta giełdy' },
  { what: 'Kontrakt tokena USDT', why: 'kod kontraktu w blockchainie' },
  { what: 'Adres zbiórki', why: 'znana zbiórka' },
];

/**
 * In-page links must not change location.hash: the app routes on the hash (#/…), so '#lp-trop' would open an empty view.
 * Scroll to the section and move focus there instead.
 */
const jump = (id: string) => (e: MouseEvent<HTMLAnchorElement>) => {
  e.preventDefault();
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
  el.focus({ preventScroll: true });
};

export function Landing({ meta, themeToggle }: { meta: Meta | null; themeToggle: ReactNode }) {
  const sources = meta?.sources.connectors.filter((c) => c.enabled && c.kind === 'source').length;
  return (
    <div className="lp">
      <a className="skip" href="#lp-main" onClick={jump('lp-main')}>
        Przejdź do treści
      </a>
      <header className="lp-top">
        <a href="#/" className="brand" aria-label="KryptoTrop – strona główna">
          <img className="brand-logo" src="/logo.png" alt="KryptoTrop" width="1240" height="320" />
        </a>
        <nav className="lp-links" aria-label="Sekcje strony">
          <a href="#lp-trop" onClick={jump('lp-trop')}>
            Przykład
          </a>
          <a href="#lp-jak" onClick={jump('lp-jak')}>
            Jak to działa
          </a>
          <a href="#lp-wynik" onClick={jump('lp-wynik')}>
            Wskaźnik Pewności
          </a>
        </nav>
        <div className="lp-top-actions">
          {themeToggle}
          <a className="btn primary" href={PANEL}>
            Otwórz panel
          </a>
        </div>
      </header>

      <main id="lp-main" tabIndex={-1}>
        <section className="lp-hero" aria-labelledby="lp-title">
          <Wave energy={0.35} />
          <div className="lp-hero-copy">
            <h1 id="lp-title">
              Od śladów w sieci
              <br />
              do portfeli krypto.
            </h1>
            <p className="lp-lede">
              KryptoTrop przeszukuje publiczne źródła, łączy cyfrowe ślady osoby z adresami kryptowalut i wylicza Wskaźnik Pewności, który da się obronić regułami i dowodami. Dla analityków Krajowej Administracji
              Skarbowej.
            </p>
            <div className="lp-cta">
              <a className="btn primary lg" href={PANEL}>
                Rozpocznij analizę <ArrowRight size={16} aria-hidden="true" />
              </a>
            </div>
            <p className="lp-hint">
              Dane do testu, czyli fikcyjne osoby z prawdziwymi, publicznymi kontami, znajdziecie w README repozytorium w sekcji <b>„Dla jury”</b>.
            </p>
            <ul className="lp-facts">
              <li>
                <ShieldCheck size={15} aria-hidden="true" /> Wyłącznie publiczne źródła{sources ? ` (${sources})` : ''}
              </li>
              <li>
                <Server size={15} aria-hidden="true" /> Działa lokalnie, bez chmury publicznej
              </li>
              <li>
                <FileText size={15} aria-hidden="true" /> Raport PDF z łańcuchem dowodowym
              </li>
            </ul>
          </div>
        </section>

        <section id="lp-trop" className="lp-section" aria-labelledby="lp-trop-title">
          <div className="lp-head">
            <h2 id="lp-trop-title">Jeden e-mail, cały trop.</h2>
            <p>
              Analiza wystartowała od samego adresu e-mail. Resztę KryptoTrop znalazł sam, a nazwy kanału na Telegramie nie było ani na wejściu, ani na GitHubie.
            </p>
          </div>
          <ol className="trail" aria-label="Kolejne źródła odkryte w analizie">
            {TRAIL.map(({ icon: Icon, source, value, note }, i) => (
              <li key={source}>
                <span className="trail-node" aria-hidden="true">
                  <Icon size={16} />
                </span>
                <span className="trail-source">
                  <b>{i === 0 ? 'Wejście' : `Trop ${i}`}</b> {source}
                </span>
                <span className="trail-value">
                  {/* Allow a line break before "@" so an e-mail address never splits mid-word. */}
                  {value.split(/(?=@)/).map((part, j) => (
                    <span key={j}>
                      {j > 0 && <wbr />}
                      {part}
                    </span>
                  ))}
                </span>
                <span className="trail-note">{note}</span>
              </li>
            ))}
          </ol>
          <div className="lp-results panel">
            <table className="table">
              <caption className="sr-only">Adresy znalezione na tropie i ich Wskaźnik Pewności</caption>
              <thead>
                <tr>
                  <th>Adres</th>
                  <th>Wskaźnik Pewności</th>
                  <th>Dlaczego</th>
                </tr>
              </thead>
              <tbody>
                {RESULTS.map((r) => (
                  <tr key={r.address}>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <span className="chain">{r.chain}</span> <code>{r.address}</code>
                    </td>
                    <td>
                      <Score band={r.band} score={r.score} />
                    </td>
                    <td className="muted">{r.why}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="lp-footnote">Fikcyjna osoba testowa z prawdziwymi, publicznymi kontami (HackNation 2026). Wyniki z przebiegu na żywo.</p>
        </section>

        <section id="lp-jak" className="lp-section" aria-labelledby="lp-jak-title">
          <div className="lp-head">
            <h2 id="lp-jak-title">Jak to działa</h2>
            <p>Cztery etapy, za każdym razem w tej samej kolejności i z zapisem każdego kroku, żeby analizę dało się odtworzyć.</p>
          </div>
          <ol className="lp-steps">
            {STEPS.map((s, i) => (
              <li key={s.title}>
                <span className="lp-step-num" aria-hidden="true">
                  {i + 1}
                </span>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
                <p className="lp-step-detail">{s.detail}</p>
              </li>
            ))}
          </ol>
        </section>

        <section id="lp-wynik" className="lp-section lp-score" aria-labelledby="lp-wynik-title">
          <div className="lp-head">
            <h2 id="lp-wynik-title">Wynik, który da się obronić.</h2>
            <p>
              Wskaźnik Pewności to nie czarna skrzynka. Liczą go jawne, wersjonowane reguły, a przy każdym adresie widać, ile punktów dała która przesłanka i z jakiego źródła. Te same dane zawsze dają ten sam wynik.
            </p>
          </div>
          <div className="lp-score-grid">
            <div className="panel lp-ledger" aria-label="Przykład rozpisania wyniku">
              <div className="lp-ledger-head">
                <span className="chain">ETH</span> <code>0xd3e7…E61C</code>
              </div>
              <table className="rules">
                <tbody>
                  {RULES.map((r) => (
                    <tr key={r.label}>
                      <td>{r.label}</td>
                      <td className={`num ${r.delta.startsWith('−') ? 'neg' : ''}`} style={{ fontWeight: 600 }}>
                        {r.delta}
                      </td>
                    </tr>
                  ))}
                  <tr className="rule-total">
                    <td>Wskaźnik Pewności</td>
                    <td className="num">100%</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="panel lp-rejected">
              <h3>
                <Ban size={15} aria-hidden="true" /> Odrzucone, nawet gdy opublikowała je ta sama osoba
              </h3>
              <ul>
                {REJECTED.map((r) => (
                  <li key={r.what}>
                    <span>{r.what}</span>
                    <span className="muted small">{r.why}</span>
                    <Score band="WYKLUCZONE" score={0} label={false} />
                  </li>
                ))}
              </ul>
              <p className="muted small">Interakcja z giełdą zostaje odnotowana jako ślad wyjścia do fiat, ale adres nie jest przypisywany osobie.</p>
            </div>
          </div>
        </section>

        <section className="lp-close" aria-labelledby="lp-close-title">
          <h2 id="lp-close-title">Zacznij od jednego identyfikatora.</h2>
          <p>{plural(7, 'rodzaj', 'rodzaje', 'rodzajów')} danych na wejściu: nick, e-mail, telefon, Telegram, imię i nazwisko, adres strony albo adres portfela.</p>
          <a className="btn primary lg" href={PANEL}>
            Rozpocznij analizę <ArrowRight size={16} aria-hidden="true" />
          </a>
        </section>
      </main>

      <footer className="lp-foot">
        <span>KryptoTrop, HackNation 2026. Rozwiązanie zadania Ministerstwa Finansów / KAS „OŁCyŚ”.</span>
        <span>Wskaźnik Pewności nie przesądza o własności adresu i wymaga weryfikacji analityka.</span>
      </footer>
    </div>
  );
}
