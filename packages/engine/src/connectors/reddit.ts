/**
 * Reddit – public listings of a user's own posts and comments, no user login.
 * Posts are community discussion (DISCUSSION); giveaway/airdrop wording drops them to MASS_COMMENT,
 * and repeated posts on Reddit stay one source family, so they never earn the synergy bonus on their own.
 *
 * Access: with REDDIT_CLIENT_ID / REDDIT_CLIENT_SECRET (a registered Reddit app, read-only, app-only OAuth)
 * requests go to oauth.reddit.com as Reddit's Data API terms require. Without them the anonymous .json
 * listings are used, which Reddit often refuses (403/429) – reported as a connector error, never bypassed.
 */
import type { Identifier } from '@olcys/core';
import { extractIdentifiers, type CollectedDocument } from '../evidence';
import type { ConnectorContext, SourceConnector } from './types';

interface RedditThing {
  kind: string;
  data: {
    id: string;
    author?: string;
    title?: string;
    selftext?: string;
    body?: string;
    permalink?: string;
    created_utc?: number;
  };
}
interface RedditListing {
  data?: { children?: RedditThing[] };
}

const LIMIT = 50;

async function appToken(ctx: ConnectorContext): Promise<string | undefined> {
  const { clientId, clientSecret } = ctx.config.reddit;
  if (!clientId || !clientSecret || ctx.config.recording?.mode === 'replay') return undefined;
  const res = await ctx.fetch(`${ctx.config.urls.reddit}/api/v1/access_token`, {
    method: 'POST',
    body: 'grant_type=client_credentials',
    headers: { authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`, 'content-type': 'application/x-www-form-urlencoded' },
  });
  if (res.status !== 200) {
    ctx.warn(`Reddit OAuth: HTTP ${res.status} – sprawdź REDDIT_CLIENT_ID / REDDIT_CLIENT_SECRET`);
    return undefined;
  }
  return (JSON.parse(res.body) as { access_token?: string }).access_token;
}

export const redditConnector: SourceConnector = {
  id: 'reddit',
  title: 'Reddit (posty i komentarze użytkownika)',
  compliance:
    'Publiczne posty i komentarze z profilu użytkownika, bez logowania na cudze konto. Z kluczem zarejestrowanej aplikacji (REDDIT_CLIENT_ID/SECRET) – oficjalne API OAuth tylko do odczytu, zgodnie z Reddit Data API Terms; bez klucza – anonimowe listingi .json, których odmowa jest raportowana i nie jest obchodzona.',
  accepts: ['nick'],
  isLive: () => true,
  enabled: (config) => config.reddit.enabled,
  async collect(q: Identifier, ctx: ConnectorContext): Promise<CollectedDocument[]> {
    const nick = q.value.trim().replace(/^@/, '').replace(/^u\//i, '');
    if (!/^[A-Za-z0-9_-]{3,20}$/.test(nick)) return [];
    const site = ctx.config.urls.reddit;
    const oauth = Boolean(ctx.config.reddit.clientId && ctx.config.reddit.clientSecret);
    const token = oauth ? await appToken(ctx) : undefined;
    if (oauth && !token && ctx.config.recording?.mode !== 'replay') return [];
    const api = oauth ? ctx.config.urls.redditOauth : site;
    const headers: Record<string, string> = { accept: 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) };
    const docs: CollectedDocument[] = [];
    for (const [path, label] of [
      ['submitted', 'posty'],
      ['comments', 'komentarze'],
    ] as const) {
      const url = `${api}/user/${encodeURIComponent(nick)}/${path}${oauth ? '' : '.json'}?limit=${LIMIT}&raw_json=1`;
      const res = await ctx.fetch(url, { headers });
      if (res.status === 404) return docs;
      if (res.status !== 200) {
        const hint = res.status === 403 || res.status === 429 ? (oauth ? ' – limit API' : ' – Reddit odmawia zapytań anonimowych; ustaw REDDIT_CLIENT_ID/SECRET') : '';
        ctx.warn(`Reddit ${nick} (${label}): HTTP ${res.status}${hint}`);
        continue;
      }
      const listing = JSON.parse(res.body) as RedditListing;
      const items = (listing.data?.children ?? []).filter((c) => c.data?.author);
      if (!items.length) continue;
      const segments = items.map((c) => {
        const d = c.data;
        return {
          id: `${path}-${d.id}`,
          author: { handle: d.author! },
          text: [d.title, d.selftext ?? d.body].filter(Boolean).join('\n'),
          publishedAt: d.created_utc ? new Date(d.created_utc * 1000).toISOString() : undefined,
          anchor: d.permalink ? `${site}${d.permalink}` : undefined,
        };
      });
      docs.push({
        family: 'reddit',
        sourceKind: 'FORUM',
        url: `${site}/user/${encodeURIComponent(nick)}/${path}`,
        title: `Reddit u/${nick} – ${label}`,
        fetchedAt: res.fetchedAt,
        contentType: res.contentType,
        owner: { handle: nick },
        segments,
        links: extractIdentifiers(segments.map((s) => s.text).join('\n')),
        meta: { api: res.url, ownedByQuery: true, items: segments.length, access: oauth ? 'oauth' : 'anonymous' },
        raw: res.body,
      });
    }
    return docs;
  },
};
