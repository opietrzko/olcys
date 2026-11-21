/**
 * Wyszukiwarka meta SearXNG (self-hosted, AGPL) – automatyczne przeszukiwanie otwartego Internetu
 * po nicku, e-mailu, telefonie lub adresie krypto. Zapytania trafiają do własnej instancji (on-prem),
 * a nie bezpośrednio do zewnętrznych usług. Wyniki są pobierane jako strony publiczne (kontrola SSRF).
 */
import * as cheerio from 'cheerio';
import type { Identifier, SourceKind } from '@olcys/core';
import { familyOf } from '../config';
import type { CollectedDocument } from '../evidence';
import type { ConnectorContext, SourceConnector } from './types';

interface SearxResult {
  url: string;
  title?: string;
  content?: string;
  engine?: string;
  engines?: string[];
}

/** Eksploratory i agregatory blockchain – pokazują adres, ale nie są śladem Web2 (pomijane, by nie zaśmiecać dowodów). */
export const EXPLORER_HOSTS = /(^|\.)(etherscan\.io|bscscan\.com|polygonscan\.com|arbiscan\.io|blockscout\.com|blockchain\.com|blockchair\.com|blockcypher\.com|mempool\.space|blockstream\.info|tronscan\.org|oklink\.com|debank\.com|arkm\.com|arkhamintelligence\.com|beaconcha\.in|coinstats\.app|zapper\.xyz|zerion\.io|nansen\.ai|walletexplorer\.com|btc\.com|solscan\.io|ethplorer\.io|tokenview\.io|bitinfocharts\.com|3xpl\.com|chainabuse\.com|etherchain\.org)$/i;

/** Eksplorator rozpoznany po liście lub wzorcu nazwy (np. cronoscan.com, explorer.fuse.io, *.blockscout.com). */
export const isExplorerHost = (host: string) => EXPLORER_HOSTS.test(host) || /(^|\.)[a-z0-9-]*scan\.(io|com|org|xyz|co)$/i.test(host) || /^explorer\.|(^|\.)blockscout\.|(^|\.)explorer-/i.test(host);

/** Rodzaj źródła na podstawie domeny wyniku. */
export function kindForHost(host: string): SourceKind {
  const h = host.toLowerCase();
  if (/(^|\.)(olx|allegro|gratka|sprzedajemy|localbitcoins|hodlhodl|paxful|bisq)\./.test(h) || /p2p/.test(h)) return 'P2P_LISTING';
  if (/(^|\.)(t\.me|telegram\.me)$/.test(h)) return 'MESSENGER';
  if (/forum|bitcointalk|reddit|wykop|elektroda|4programmers|stackexchange|stackoverflow|discourse/.test(h)) return 'FORUM';
  return 'UNKNOWN';
}

/** Teksty stron z wyników – dzielone na akapity, by wystąpienia adresu i identyfikatora oceniać lokalnie. */
function pageSegments(html: string): { title: string; segments: { id: string; text: string }[] } {
  const $ = cheerio.load(html);
  $('script,style,noscript,svg,nav,footer,header').remove();
  const blocks = $('p, li, td, pre, code, blockquote, article, h1, h2, h3, div')
    .map((_, el) => $(el).clone().children('p,li,div,article,table,ul,ol').remove().end().text().replace(/\s+/g, ' ').trim())
    .get()
    .filter((t) => t.length >= 20);
  const uniq = [...new Set(blocks)].slice(0, 400);
  return { title: $('title').text().trim(), segments: uniq.map((text, i) => ({ id: `b${i}`, text })) };
}

export const searxngConnector: SourceConnector = {
  id: 'search',
  title: 'Wyszukiwarka (SearXNG self-hosted) + pobranie stron wyników',
  compliance: 'Własna instancja SearXNG; pobierane wyłącznie publiczne strony z wyników (bez logowania, z blokadą adresów wewnętrznych).',
  accepts: ['nick', 'email', 'phone', 'address', 'telegram'],
  maxIdentityDepth: 1,
  isLive: () => true,
  enabled: (c) => Boolean(c.urls.searxng),
  async collect(q: Identifier, ctx: ConnectorContext): Promise<CollectedDocument[]> {
    const query = `"${q.type === 'telegram' ? '@' : ''}${q.value}"`;
    const res = await ctx.fetch(`${ctx.config.urls.searxng}/search?q=${encodeURIComponent(query)}&format=json&safesearch=0`, { headers: { accept: 'application/json' } });
    if (res.status !== 200) {
      ctx.warn(`SearXNG: HTTP ${res.status} (czy format JSON jest włączony w settings.yml?)`);
      return [];
    }
    const results = ((JSON.parse(res.body).results ?? []) as SearxResult[]).filter((r) => /^https?:/.test(r.url) && !isExplorerHost(new URL(r.url).hostname)).slice(0, ctx.config.searchResults);
    ctx.log(`${query}: ${results.length} wyników`);
    const docs: CollectedDocument[] = [];
    for (const r of results) {
      try {
        const page = await ctx.fetch(r.url, { kind: 'page', timeoutMs: 10000 });
        if (page.status !== 200 || !/html|text|json/.test(page.contentType)) continue;
        const { title, segments } = /html/.test(page.contentType) ? pageSegments(page.body) : { title: r.title ?? r.url, segments: [{ id: 'body', text: page.body.slice(0, 200000) }] };
        const needle = q.value.toLowerCase();
        // zachowujemy tylko fragmenty istotne dla zapytania (identyfikator lub adres) – minimalizacja danych
        const relevant = segments.filter((s) => s.text.toLowerCase().includes(needle) || /0x[0-9a-fA-F]{40}|\b(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,62}\b|\bT[1-9A-HJ-NP-Za-km-z]{33}\b/.test(s.text));
        if (!relevant.length) continue;
        const host = new URL(page.url).host;
        docs.push({
          family: familyOf(page.url),
          sourceKind: kindForHost(host),
          url: page.url,
          title: title || r.title || page.url,
          fetchedAt: page.fetchedAt,
          contentType: page.contentType,
          segments: relevant.slice(0, 60),
          links: [],
          meta: { searchQuery: query, searchEngines: r.engines ?? (r.engine ? [r.engine] : []), snippet: r.content },
          raw: page.body,
        });
      } catch (e) {
        ctx.warn(`Wynik ${r.url}: ${(e as Error).message}`);
      }
    }
    return docs;
  },
};
