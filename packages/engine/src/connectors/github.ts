/**
 * GitHub – publiczne REST API (bez logowania): profil użytkownika, profilowe README, FUNDING.yml.
 * Adres na własnym profilu = najsilniejsza przesłanka (KROK 2: 80–100%).
 */
import type { Identifier } from '@olcys/core';
import { extractIdentifiers, type CollectedDocument } from '../evidence';
import { isMock, type ConnectorContext, type SourceConnector } from './types';

interface GhUser {
  login: string;
  name?: string | null;
  bio?: string | null;
  blog?: string | null;
  email?: string | null;
  twitter_username?: string | null;
  html_url: string;
  created_at?: string;
}

export const githubConnector: SourceConnector = {
  id: 'github',
  title: 'GitHub (profil, README, FUNDING.yml)',
  compliance: 'Publiczne REST API GitHub, bez uwierzytelniania, w limitach zapytań API.',
  accepts: ['nick'],
  isLive: (c) => !isMock(c.urls.githubApi, c),
  enabled: () => true,
  async collect(q: Identifier, ctx: ConnectorContext): Promise<CollectedDocument[]> {
    const { githubApi, githubRaw } = ctx.config.urls;
    const res = await ctx.fetch(`${githubApi}/users/${encodeURIComponent(q.value)}`, { headers: { accept: 'application/vnd.github+json' } });
    if (res.status !== 200) return [];
    const u = JSON.parse(res.body) as GhUser;
    const owner = { handle: u.login, displayName: u.name ?? undefined };
    const profileText = [u.name, u.bio, u.blog, u.email, u.twitter_username && `twitter: @${u.twitter_username}`].filter(Boolean).join('\n');
    const links: Identifier[] = [];
    if (u.blog) links.push({ type: 'url', value: u.blog.startsWith('http') ? u.blog : `https://${u.blog}` });
    if (u.email) links.push({ type: 'email', value: u.email });
    if (u.twitter_username) links.push({ type: 'nick', value: u.twitter_username });
    if (u.name) links.push({ type: 'name', value: u.name });
    const family = 'github';
    const docs: CollectedDocument[] = [
      {
        family,
        sourceKind: 'OWN_PROFILE',
        url: u.html_url,
        title: `Profil GitHub @${u.login}`,
        fetchedAt: res.fetchedAt,
        contentType: res.contentType,
        owner,
        segments: [{ id: 'profile', author: owner, text: profileText }],
        links,
        meta: { api: res.url, created_at: u.created_at, ownedByQuery: true },
        raw: res.body,
      },
    ];
    for (const [repo, file, title] of [
      [u.login, 'README.md', 'Profilowe README'],
      ['.github', 'FUNDING.yml', 'FUNDING.yml (sponsorowanie)'],
      [u.login, '.github/FUNDING.yml', 'FUNDING.yml (sponsorowanie)'],
    ] as const) {
      const url = `${githubRaw}/${u.login}/${repo}/HEAD/${file}`;
      const r = await ctx.fetch(url);
      if (r.status !== 200) continue;
      docs.push({
        family,
        sourceKind: 'OWN_PROFILE',
        url,
        title: `${title} @${u.login}`,
        fetchedAt: r.fetchedAt,
        contentType: r.contentType,
        owner,
        segments: [{ id: file, author: owner, text: r.body }],
        links: extractIdentifiers(r.body),
        meta: { repo, file, ownedByQuery: true },
        raw: r.body,
      });
    }
    return docs;
  },
};
