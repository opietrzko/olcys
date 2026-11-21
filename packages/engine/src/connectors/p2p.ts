/**
 * Portal ogłoszeń P2P – oferty kupna/sprzedaży krypto (KROK 2: 60–79%).
 */
import * as cheerio from 'cheerio';
import type { Identifier } from '@olcys/core';
import { familyOf } from '../config';
import type { CollectedDocument } from '../evidence';
import type { ConnectorContext, SourceConnector } from './types';

export const p2pConnector: SourceConnector = {
  id: 'p2p',
  title: 'Portal ogłoszeń P2P',
  compliance: 'Publiczne ogłoszenia dostępne bez logowania; wyszukiwarka serwisu.',
  accepts: ['nick', 'telegram', 'phone', 'address'],
  isLive: () => false,
  enabled: (c) => Boolean(c.urls.p2p),
  async collect(q: Identifier, ctx: ConnectorContext): Promise<CollectedDocument[]> {
    const base = ctx.config.urls.p2p!;
    const res = await ctx.fetch(`${base}/search?q=${encodeURIComponent(q.value)}`);
    if (res.status !== 200) return [];
    const $ = cheerio.load(res.body);
    return $('.listing')
      .map((_, el) => {
        const id = $(el).attr('id') ?? 'listing';
        const seller = $(el).attr('data-seller');
        const tg = $(el).attr('data-telegram');
        const url = `${base}/oferta/${id.replace(/^l-/, '')}`;
        const doc: CollectedDocument = {
          family: familyOf(url, ctx.config),
          sourceKind: 'P2P_LISTING',
          url,
          title: $(el).find('h2').text().trim(),
          fetchedAt: res.fetchedAt,
          contentType: res.contentType,
          owner: { handle: seller },
          segments: [{ id, author: { handle: seller }, text: `${$(el).find('h2').text()}\n${$(el).find('.desc').text()}\n${$(el).find('.contact').text()}`, publishedAt: $(el).attr('data-date') }],
          links: [...(seller ? [{ type: 'nick' as const, value: seller }] : []), ...(tg ? [{ type: 'telegram' as const, value: tg }] : [])],
          meta: { searchUrl: res.url },
          raw: $.html(el),
        };
        return doc;
      })
      .get();
  },
};
