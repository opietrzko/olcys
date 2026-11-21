/**
 * Reverse lookup: crypto address → public GitHub files that contain it (GitHub code search API).
 * Code search requires an authenticated request, so the connector is enabled only with GITHUB_TOKEN.
 * Each hit becomes evidence for the queried address, and the repository owner is pivoted as a nickname,
 * so the regular GitHub connector then collects that account's profile.
 */
import type { Identifier } from '@olcys/core';
import { validateAddress } from '@olcys/core';
import { extractIdentifiers, type CollectedDocument } from '../evidence';
import type { ConnectorContext, SourceConnector } from './types';

interface CodeHit {
  path: string;
  html_url: string;
  repository: { name: string; full_name: string; owner: { login: string } };
}

const MAX_HITS = 5;

export const githubCodeConnector: SourceConnector = {
  id: 'github-code',
  title: 'GitHub – wyszukiwanie adresu w publicznym kodzie',
  compliance: 'Publiczne API wyszukiwania kodu GitHub (token tylko do odczytu danych publicznych), w limitach API.',
  accepts: ['address'],
  maxIdentityDepth: 0,
  isLive: () => true,
  enabled: (config) => Boolean(config.githubToken),
  async collect(q: Identifier, ctx: ConnectorContext): Promise<CollectedDocument[]> {
    const v = validateAddress(q.value);
    if (!v.valid) return [];
    const address = v.canonical!;
    const { githubApi, githubRaw } = ctx.config.urls;
    const auth = { authorization: `Bearer ${ctx.config.githubToken}`, accept: 'application/vnd.github+json' };
    const res = await ctx.fetch(`${githubApi}/search/code?q=${encodeURIComponent(`"${address}"`)}&per_page=${MAX_HITS}`, { headers: auth });
    if (res.status !== 200) {
      ctx.warn(`GitHub code search: HTTP ${res.status}${res.status === 403 || res.status === 429 ? ' – limit wyszukiwania (10 zapytań/min)' : ''}`);
      return [];
    }
    const items = ((JSON.parse(res.body) as { items?: CodeHit[] }).items ?? []).slice(0, MAX_HITS);
    if (!items.length) ctx.log(`${address}: brak wystąpień w publicznym kodzie (indeks GitHub może nie obejmować jeszcze nowych plików)`);
    const docs: CollectedDocument[] = [];
    for (const hit of items) {
      const login = hit.repository.owner.login;
      // Same URL shape as the GitHub connector, so an identical file is stored as one piece of evidence.
      const url = `${githubRaw}/${encodeURIComponent(login)}/${encodeURIComponent(hit.repository.name)}/HEAD/${hit.path}`;
      const r = await ctx.fetch(url);
      if (r.status !== 200) continue;
      if (!r.body.toLowerCase().includes(address.toLowerCase())) continue;
      const owner = { handle: login };
      const isProfileReadme = hit.repository.name.toLowerCase() === login.toLowerCase() && /^readme\.md$/i.test(hit.path);
      docs.push({
        family: 'github',
        sourceKind: 'OWN_PROFILE',
        url,
        title: `${isProfileReadme ? 'Profilowe README' : hit.repository.full_name + '/' + hit.path} @${login}`,
        fetchedAt: r.fetchedAt,
        contentType: r.contentType,
        owner,
        segments: [{ id: hit.path, author: owner, text: r.body, anchor: hit.html_url }],
        links: [{ type: 'nick', value: login }, ...extractIdentifiers(r.body)],
        meta: { api: res.url, repo: hit.repository.full_name, file: hit.path, ownedByQuery: true, foundByAddress: address },
        raw: r.body,
      });
    }
    return docs;
  },
};
