/**
 * Reverse lookup: crypto address → public GitHub files that contain it (GitHub code search API).
 * Code search requires an authenticated request, so the connector is enabled only with GITHUB_TOKEN.
 *
 * Only files that the account owner publishes about themselves (profile README, FUNDING.yml) tie the address
 * to the owner and are followed further. Any other file (documentation, test data, a config in somebody's project)
 * is kept as context evidence; its repository owner is at most a tentative lead, and nothing else is pivoted
 * from its content. When the address appears in many files it is a widely published address (a service,
 * a contract, a documentation example), so ordinary repositories are not leads at all.
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

/** Results requested from the search API (one request) and files actually downloaded. */
const PER_PAGE = 20;
const MAX_FILES = 5;
/** Above this many files in public code, the address is treated as widely published, not as somebody's private wallet. */
export const WIDELY_PUBLISHED_FILES = 10;

/** File the account owner publishes about themselves: profile README or GitHub Sponsors funding file. */
export function isOwnerFile(hit: Pick<CodeHit, 'path' | 'repository'>): 'profile' | 'funding' | null {
  const owner = hit.repository.owner.login.toLowerCase();
  const repo = hit.repository.name.toLowerCase();
  const path = hit.path.toLowerCase();
  if (repo === owner && path === 'readme.md') return 'profile';
  if (repo === '.github' && path === 'profile/readme.md') return 'profile';
  if (path === 'funding.yml' || path === '.github/funding.yml') return 'funding';
  return null;
}

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
    const res = await ctx.fetch(`${githubApi}/search/code?q=${encodeURIComponent(`"${address}"`)}&per_page=${PER_PAGE}`, { headers: auth });
    if (res.status !== 200) {
      ctx.warn(`GitHub code search: HTTP ${res.status}${res.status === 403 || res.status === 429 ? ' – limit wyszukiwania (10 zapytań/min)' : ''}`);
      return [];
    }
    const body = JSON.parse(res.body) as { total_count?: number; items?: CodeHit[] };
    const items = body.items ?? [];
    const total = body.total_count ?? items.length;
    if (!items.length) ctx.log(`${address}: brak wystąpień w publicznym kodzie (indeks GitHub może nie obejmować jeszcze nowych plików)`);
    const widely = total > WIDELY_PUBLISHED_FILES;
    if (widely)
      ctx.log(
        `${address}: adres występuje w ${total} plikach publicznego kodu – adres szeroko publikowany (usługa, kontrakt, przykład z dokumentacji); ` +
          'repozytoria inne niż profil właściciela nie są traktowane jako tropy podmiotu',
      );
    // Owner-published files first: they are the only ones that can tie the address to a person.
    const ranked = [...items].sort((a, b) => Number(!isOwnerFile(a)) - Number(!isOwnerFile(b))).slice(0, MAX_FILES);
    const docs: CollectedDocument[] = [];
    for (const hit of ranked) {
      const login = hit.repository.owner.login;
      // Same URL shape as the GitHub connector, so an identical file is stored as one piece of evidence.
      const url = `${githubRaw}/${encodeURIComponent(login)}/${encodeURIComponent(hit.repository.name)}/HEAD/${hit.path}`;
      const r = await ctx.fetch(url);
      if (r.status !== 200) continue;
      if (!r.body.toLowerCase().includes(address.toLowerCase())) continue;
      const owner = { handle: login };
      const ownerFile = isOwnerFile(hit);
      const meta = { api: res.url, repo: hit.repository.full_name, file: hit.path, foundByAddress: address, filesInPublicCode: total };
      if (ownerFile) {
        docs.push({
          family: 'github',
          sourceKind: 'OWN_PROFILE',
          url,
          title: `${ownerFile === 'profile' ? 'Profilowe README' : `FUNDING.yml (${hit.repository.full_name})`} @${login}`,
          fetchedAt: r.fetchedAt,
          contentType: r.contentType,
          owner,
          segments: [{ id: hit.path, author: owner, text: r.body, anchor: hit.html_url }],
          links: [{ type: 'nick', value: login }, ...extractIdentifiers(r.body)],
          meta: { ...meta, ownedByQuery: true },
          raw: r.body,
        });
        continue;
      }
      // An ordinary repository file: the owner may have only copied the address (docs, test data, configs).
      docs.push({
        family: 'github',
        sourceKind: 'UNKNOWN',
        url,
        title: `${hit.repository.full_name}/${hit.path} @${login}`,
        fetchedAt: r.fetchedAt,
        contentType: r.contentType,
        owner,
        segments: [{ id: hit.path, author: owner, text: r.body, anchor: hit.html_url }],
        links: widely ? [] : [{ type: 'nick', value: login }],
        meta: {
          ...meta,
          ownedByQuery: true,
          weakOwnership: true,
          weakReason: `adres w pliku repozytorium ${hit.repository.full_name} (nie profil ani FUNDING.yml) – właściciel repozytorium mógł go tylko skopiować`,
        },
        raw: r.body,
      });
    }
    return docs;
  },
};
