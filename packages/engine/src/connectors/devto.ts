/**
 * DEV (dev.to) - publiczne artykuły użytkownika przez publiczne API, bez logowania.
 * Artykuł podmiotu to wpis w społeczności (DISCUSSION); słowa o sprzedaży lub rozliczeniu
 * ("sprzedam", "P2P", "rozliczenie") podnoszą go do SALE_OR_SETTLEMENT.
 */
import type { Identifier } from '@olcys/core';
import { extractIdentifiers, type CollectedDocument } from '../evidence';
import { confirmVariant, nickVariants } from './nick';
import type { ConnectorContext, SourceConnector } from './types';

interface DevArticle {
  id: number;
  title: string;
  description?: string;
  url: string;
  published_at?: string;
  tag_list?: string[] | string;
  user?: { username: string; name?: string };
}
interface DevArticleFull extends DevArticle {
  body_markdown?: string;
}

const MAX_ARTICLES = 10;

export const devtoConnector: SourceConnector = {
  id: 'devto',
  title: 'DEV / dev.to (artykuły użytkownika)',
  compliance: 'Publiczne, udokumentowane API Forem (dev.to/api), bez logowania i bez klucza, w limitach API.',
  accepts: ['nick'],
  isLive: () => true,
  enabled: () => true,
  async collect(q: Identifier, ctx: ConnectorContext): Promise<CollectedDocument[]> {
    const api = ctx.config.urls.devtoApi;
    let list: DevArticle[] = [];
    let login: string | undefined;
    for (const candidate of nickVariants(q.value, 'devto')) {
      const res = await ctx.fetch(`${api}/articles?username=${encodeURIComponent(candidate)}&per_page=${MAX_ARTICLES}`, { headers: { accept: 'application/json' } });
      if (res.status === 404) continue;
      if (res.status !== 200) {
        ctx.warn(`dev.to ${candidate}: HTTP ${res.status}`);
        return [];
      }
      const items = JSON.parse(res.body) as DevArticle[];
      if (!Array.isArray(items) || !items.length) continue;
      list = items;
      login = candidate;
      break;
    }
    if (!login) return [];

    const docs: CollectedDocument[] = [];
    for (const a of list.slice(0, MAX_ARTICLES)) {
      const r = await ctx.fetch(`${api}/articles/${a.id}`, { headers: { accept: 'application/json' } });
      if (r.status !== 200) {
        ctx.warn(`dev.to artykuł ${a.id}: HTTP ${r.status}`);
        continue;
      }
      const full = JSON.parse(r.body) as DevArticleFull;
      const handle = full.user?.username ?? login;
      const owner = { handle, displayName: full.user?.name };
      const text = [full.title, full.description, full.body_markdown].filter(Boolean).join('\n');
      docs.push({
        family: 'dev.to',
        sourceKind: 'FORUM',
        url: full.url ?? a.url,
        title: `dev.to @${handle}: ${full.title}`,
        fetchedAt: r.fetchedAt,
        contentType: r.contentType,
        owner,
        segments: [{ id: `article-${a.id}`, author: owner, text, publishedAt: full.published_at, anchor: full.url ?? a.url }],
        links: extractIdentifiers(text),
        meta: { api: r.url, articleId: a.id, ownedByQuery: true },
        raw: r.body,
      });
    }

    const c = confirmVariant(q.value, login, docs.flatMap((d) => d.segments.map((s) => s.text)));
    if (c.isVariant) {
      ctx.log(c.note!);
      for (const d of docs) Object.assign(d.meta, { nickVariant: login, weakOwnership: c.weak, ...(c.weak ? { reciprocalNeedles: [login] } : {}) });
    }
    return docs;
  },
};
