/**
 * Forum branżowe – wyszukiwarka postów + pełne wątki (wszyscy autorzy – potrzebne do reguły „wiele tożsamości”).
 * W trybie demo: syntetyczne forum. Dla realnych forów dodaj adapter z selektorami danego serwisu.
 */
import * as cheerio from 'cheerio';
import type { Identifier } from '@olcys/core';
import { familyOf } from '../config';
import type { CollectedDocument } from '../evidence';
import type { ConnectorContext, SourceConnector } from './types';

export const forumConnector: SourceConnector = {
  id: 'forum',
  title: 'Forum branżowe (posty i wątki)',
  compliance: 'Publiczne wątki dostępne bez logowania; wyszukiwarka serwisu.',
  accepts: ['nick', 'name', 'address'],
  isLive: () => false,
  enabled: (c) => Boolean(c.urls.forum),
  async collect(q: Identifier, ctx: ConnectorContext): Promise<CollectedDocument[]> {
    const base = ctx.config.urls.forum!;
    const res = await ctx.fetch(`${base}/search?q=${encodeURIComponent(q.value)}`);
    if (res.status !== 200) return [];
    const $ = cheerio.load(res.body);
    const threadIds = [...new Set($('.result').map((_, el) => $(el).attr('data-thread')).get())];
    const docs: CollectedDocument[] = [];
    for (const id of threadIds) {
      const url = `${base}/t/${id}`;
      const r = await ctx.fetch(url);
      if (r.status !== 200) continue;
      const t = cheerio.load(r.body);
      const title = t('.thread-title').text().trim();
      const segments = t('article.post')
        .map((_, el) => ({
          id: t(el).attr('id') ?? 'post',
          author: { handle: t(el).attr('data-author'), displayName: t(el).attr('data-display') },
          text: t(el).find('.body').text().trim(),
          publishedAt: t(el).attr('data-date'),
          anchor: `${url}#${t(el).attr('id')}`,
        }))
        .get();
      docs.push({
        family: familyOf(url, ctx.config),
        sourceKind: 'FORUM',
        url,
        title,
        fetchedAt: r.fetchedAt,
        contentType: r.contentType,
        segments,
        links: [],
        meta: { board: t('.board').text().trim(), searchUrl: res.url },
        raw: r.body,
      });
    }
    return docs;
  },
};
