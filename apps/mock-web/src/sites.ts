/**
 * Treść syntetycznych serwisów. Każdy serwis to osobna „rodzina źródeł” (niezależne źródło Web2).
 * Zawiera celowe pułapki: adresy giełd, kontraktów, zbiórek, giveaway, homonim, zaciemniony zapis, podmianę adresu w czasie.
 */
import { A, PERSONA, STATE, obfuscate } from './persona';

export interface Post {
  id: string;
  author: string;
  display: string;
  date: string;
  text: string;
}
export interface Thread {
  id: string;
  title: string;
  board: string;
  posts: Post[];
}

export const githubUser = (base: string) => ({
  login: PERSONA.nick,
  id: 9100001,
  name: PERSONA.name,
  company: null,
  blog: `${base}/${PERSONA.website}`,
  location: 'Bydgoszcz',
  email: null,
  bio: `Dev & DeFi trader. Wesprzyj open source: ETH ${STATE.version >= 2 ? A.ETH_NEW : A.ETH_MAIN}`,
  twitter_username: null,
  html_url: `${base}/github/${PERSONA.nick}`,
  created_at: '2021-04-02T09:12:00Z',
  updated_at: '2025-06-01T08:00:00Z',
});

export const githubReadme = () => `# Cześć, tu Janek 👋

Buduję boty tradingowe i drobne narzędzia DeFi.

- 💬 Kontakt / handel P2P: Telegram **@${PERSONA.telegram}**
- ☕ Tip jar (mój portfel): \`${A.ETH_MAIN}\`
- 🛠️ Moje boty korzystają z routera Uniswap V2: \`${A.UNISWAP_V2_ROUTER}\` (kontrakt, nie mój portfel!)
- 🖼️ Mój kontrakt kolekcji NFT: \`${A.ETH_NFT_CONTRACT}\`
`;

export const githubFunding = () => `# Funding
custom: ["bitcoin:${A.BTC_MAIN}", "https://buymeacoffee.example/krypto_janek"]
`;

export const githubProfileHtml = (base: string, version: 'current' | '2024') => `<!doctype html><html><head><title>${PERSONA.nick} · DevHub</title></head><body>
<div class="profile" data-handle="${PERSONA.nick}"><h1>${PERSONA.name}</h1><p class="bio">${
  version === '2024' ? `Dev. Donate ETH: ${A.ETH_OLD}` : `Dev &amp; DeFi trader. Wesprzyj open source: ETH ${A.ETH_MAIN}`
}</p><a rel="me" href="${base}/${PERSONA.website}">strona</a></div></body></html>`;

export const gravatarProfile = (base: string) => ({
  hash: '',
  display_name: PERSONA.name,
  profile_url: `${base}/gravatar/${PERSONA.nick}`,
  location: 'Bydgoszcz, PL',
  description: 'Programista, krypto od 2017.',
  verified_accounts: [
    { service_type: 'github', service_label: 'GitHub', url: `${base}/github/${PERSONA.nick}`, is_hidden: false },
  ],
  payments: {
    links: [],
    crypto_wallets: [
      { label: 'Ethereum', address: A.ETH_MAIN },
      { label: 'Bitcoin', address: A.BTC_MAIN },
    ],
  },
});

export const websiteHtml = (base: string, version: 'current' | '2024' | '2025') => {
  const eth = version === '2024' ? A.ETH_OLD : obfuscate(A.ETH_MAIN);
  return `<!doctype html><html><head><title>Jan Testowy – freelance developer</title></head><body>
<header><h1>Jan Testowy</h1><p>Freelance developer, Bydgoszcz</p></header>
<main>
<p>Tworzę aplikacje webowe i automatyzacje. Kontakt: <a href="mailto:${PERSONA.email}">${PERSONA.email}</a>,
GitHub: <a rel="me" href="${base}/github/${PERSONA.nick}">${PERSONA.nick}</a>.</p>
<h2>Wesprzyj mnie</h2>
<p>Mój portfel ETH: ${eth}</p>
${version === '2024' ? '' : `<p>Bitcoin: ${A.BTC_MAIN}</p>`}
</main><footer>© Jan Testowy</footer></body></html>`;
};

export const THREADS: Thread[] = [
  {
    id: '101',
    title: 'Jaki portfel na BTC dla początkującego?',
    board: 'Portfele',
    posts: [
      { id: '1', author: 'newbie_ola', display: 'Ola', date: '2025-01-20T18:02:00Z', text: 'Hej, jaki portfel polecacie na start?' },
      { id: '2', author: PERSONA.nick, display: 'Janek', date: '2025-01-20T19:15:00Z', text: `Electrum, sprawdzony. Jakbyś chciała przetestować przelew, mój adres: ${A.BTC_MAIN}` },
      { id: '3', author: 'satoshi_fan', display: 'SF', date: '2025-01-21T07:40:00Z', text: 'Ledger + Sparrow i spokój.' },
    ],
  },
  {
    id: '102',
    title: 'Ile idzie wypłata z giełdy?',
    board: 'Giełdy',
    posts: [
      { id: '1', author: PERSONA.nick, display: 'Janek', date: '2025-06-10T12:00:00Z', text: `Wpłaciłem na Binance na adres ${A.BINANCE_14} wczoraj, dalej nie widzę środków. Normalne?` },
      { id: '2', author: 'mod_kasia', display: 'Kasia (mod)', date: '2025-06-10T12:30:00Z', text: 'Adres hot walleta giełdy, nie depozytu – napisz do supportu.' },
    ],
  },
  {
    id: '103',
    title: '🎁 GIVEAWAY 1000 USDT – zostaw adres ETH w komentarzu!',
    board: 'Promocje',
    posts: [
      { id: '1', author: 'crypto_gifts_pl', display: 'Crypto Gifts PL', date: '2025-04-01T10:00:00Z', text: `Wielki giveaway! Wyślij 0.1 ETH na ${A.ETH_GIVEAWAY_ORG} a odeślemy 0.2 ETH. Zostaw adres w komentarzu!` },
      { id: '2', author: 'anna_k', display: 'Anna', date: '2025-04-01T10:05:00Z', text: `Wysłałem na ${A.ETH_GIVEAWAY_ORG}, czekam :)` },
      { id: '3', author: 'piotr_eth', display: 'Piotr', date: '2025-04-01T10:07:00Z', text: `Uważajcie, to scam! ${A.ETH_GIVEAWAY_ORG} to adres oszusta.` },
      { id: '4', author: 'marek99', display: 'Marek', date: '2025-04-01T10:09:00Z', text: `Przelałem na ${A.ETH_GIVEAWAY_ORG}, też czekam` },
      { id: '5', author: PERSONA.nick, display: 'Janek', date: '2025-04-01T10:12:00Z', text: `Biorę udział, mój adres: ${A.ETH_GIVEAWAY_OWN}` },
      { id: '6', author: PERSONA.nick, display: 'Janek', date: '2025-04-01T10:20:00Z', text: `Wysłałem na ${A.ETH_GIVEAWAY_ORG} 0.1 ETH, zobaczymy czy odeślą` },
    ],
  },
  {
    id: '104',
    title: 'Zbiórka dla Ukrainy – kto wpłacał?',
    board: 'Off-topic',
    posts: [
      { id: '1', author: PERSONA.nick, display: 'Janek', date: '2024-03-01T09:00:00Z', text: `Wpłaciłem na oficjalną zbiórkę ${A.UKRAINE_ETH}, polecam.` },
    ],
  },
  {
    id: '105',
    title: 'Sprzedam rower szosowy',
    board: 'Ogłoszenia',
    posts: [
      { id: '1', author: 'jtestowy_krk', display: 'Jan Testowy', date: '2025-05-12T14:00:00Z', text: `Sprzedam rower, Kraków. Cena 2000 zł albo płatność w ETH na ${A.ETH_HOMONYM}.` },
    ],
  },
];

export interface Listing {
  id: string;
  seller: string;
  date: string;
  title: string;
  desc: string;
  telegram?: string;
}

export const LISTINGS: Listing[] = [
  {
    id: '5501',
    seller: PERSONA.nick,
    date: '2025-05-20T08:00:00Z',
    title: 'Sprzedam USDT (TRC20) za PLN – BLIK / przelew',
    desc: `Sprzedam USDT, kurs 4,05 PLN. Płatność BLIK lub przelew. Po zaksięgowaniu wysyłam z mojego portfela, rozliczenie zwrotne na ${A.TRON_P2P}. Szybko i bezpiecznie.`,
    telegram: PERSONA.telegram,
  },
  {
    id: '5502',
    seller: 'other_trader',
    date: '2025-05-21T08:00:00Z',
    title: 'Kupię BTC',
    desc: 'Kupię BTC za gotówkę, Warszawa.',
  },
];

export interface TgMessage {
  id: number;
  date: string;
  text: string;
}
export const tgChannels = (): Record<string, { title: string; messages: TgMessage[] }> =>
  STATE.version >= 2
    ? { [PERSONA.telegram]: { ...TG_CHANNELS[PERSONA.telegram], messages: [...TG_CHANNELS[PERSONA.telegram].messages, { id: 14, date: '2025-07-15T09:00:00Z', text: `UWAGA nowy adres ETH do rozliczeń: ${A.ETH_NEW} (stary nieaktualny)` }] } }
    : TG_CHANNELS;

export const TG_CHANNELS: Record<string, { title: string; messages: TgMessage[] }> = {
  [PERSONA.telegram]: {
    title: 'Janek P2P – USDT/PLN',
    messages: [
      { id: 11, date: '2025-05-22T09:00:00Z', text: `Nowy adres do rozliczeń USDT (TRC20): ${A.TRON_P2P}` },
      { id: 12, date: '2025-06-02T19:30:00Z', text: `Rozliczenie za dzisiejsze transakcje ETH – przelej na ${A.ETH_TG}` },
      { id: 13, date: '2025-06-05T10:00:00Z', text: 'Kurs na dziś 4,07. Piszcie priv.' },
    ],
  },
};

/** Archiwum (emulacja Wayback CDX): ścieżka zasobu → wersje. */
export const ARCHIVE: Record<string, { ts: string; render: (base: string) => string }[]> = {
  [`/${PERSONA.website}`]: [
    { ts: '20240210120000', render: (b) => websiteHtml(b, '2024') },
    { ts: '20250115120000', render: (b) => websiteHtml(b, '2025') },
  ],
  [`/github/${PERSONA.nick}`]: [{ ts: '20240301000000', render: (b) => githubProfileHtml(b, '2024') }],
};
