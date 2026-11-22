/**
 * Wyszukiwanie odwrotne: adres krypto -> publiczne pliki na GitHubie (code search API, wymaga GITHUB_TOKEN).
 *
 * Tylko pliki, które właściciel konta publikuje o sobie (README profilu, FUNDING.yml), wiążą adres z osobą
 * i są dalej śledzone. Inne pliki zostają jako dowód kontekstowy, a właściciel repo jest co najwyżej tropem
 * tymczasowym. Adres w wielu plikach to adres szeroko publikowany (usługa, kontrakt, przykład z dokumentacji),
 * więc zwykłe repozytoria nie są wtedy tropami.
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

/** Liczba wyników z API wyszukiwania (jedno zapytanie) i faktycznie pobranych plików. */
const PER_PAGE = 20;
const MAX_FILES = 5;
/** Powyżej tylu plików w publicznym kodzie adres uznajemy za szeroko publikowany, a nie prywatny portfel. */
export const WIDELY_PUBLISHED_FILES = 10;

/** Plik, który właściciel konta publikuje o sobie: README profilu albo plik GitHub Sponsors. */
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
    // Najpierw pliki publikowane przez właściciela, tylko one mogą powiązać adres z osobą.
    const ranked = [...items].sort((a, b) => Number(!isOwnerFile(a)) - Number(!isOwnerFile(b))).slice(0, MAX_FILES);
    const docs: CollectedDocument[] = [];
    for (const hit of ranked) {
      const login = hit.repository.owner.login;
      // Ten sam kształt URL co w konektorze GitHub, więc identyczny plik to jeden dowód.
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
      // Zwykły plik w repo: właściciel mógł tylko skopiować adres (dokumentacja, dane testowe, konfiguracja).
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
