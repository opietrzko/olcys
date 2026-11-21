/**
 * GitHub – publiczne REST API (bez logowania): profil użytkownika, profilowe README, FUNDING.yml.
 * Adres na własnym profilu = najsilniejsza przesłanka (KROK 2: 80–100%).
 *
 * GitHub logins cannot contain "_", so a nickname such as "jan_kowal" is also tried as "jan-kowal".
 * A variant account counts as the subject's only when its own content mentions the original nickname.
 */
import type { Identifier } from '@olcys/core';
import { collectQrEvidence, imagesInMarkdown, pickQrCandidates } from '../qr';
import { extractIdentifiers, type CollectedDocument } from '../evidence';
import { confirmVariant, nickVariants } from './nick';
import { type ConnectorContext, type SourceConnector } from './types';

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
  compliance: 'Publiczne REST API GitHub (opcjonalnie token tylko do odczytu danych publicznych), w limitach API; przy wyczerpaniu limitu – jawne ostrzeżenie i pliki raw.',
  accepts: ['nick', 'name'],
  isLive: () => true,
  enabled: () => true,
  async collect(q: Identifier, ctx: ConnectorContext): Promise<CollectedDocument[]> {
    if (q.type === 'name') return collectByName(q, ctx);
    const { githubApi, githubRaw } = ctx.config.urls;
    const auth: Record<string, string> = ctx.config.githubToken ? { authorization: `Bearer ${ctx.config.githubToken}` } : {};
    const candidates = nickVariants(q.value, 'github');

    // Find the first login that exists; on rate limit fall back to raw files for every candidate.
    let u: GhUser | undefined;
    let profileRes: Awaited<ReturnType<typeof ctx.fetch>> | undefined;
    let rateLimited = false;
    for (const login of candidates) {
      const res = await ctx.fetch(`${githubApi}/users/${encodeURIComponent(login)}`, { headers: { accept: 'application/vnd.github+json', ...auth } });
      if (res.status === 404) continue;
      if (res.status === 200) {
        u = JSON.parse(res.body) as GhUser;
        profileRes = res;
        break;
      }
      rateLimited = true;
      const reason = res.status === 403 || res.status === 429 ? 'wyczerpany limit zapytań API (ustaw GITHUB_TOKEN)' : `HTTP ${res.status}`;
      ctx.warn(`GitHub API ${login}: ${reason} – pobieram tylko README/FUNDING.yml`);
      break;
    }
    if (!u && !rateLimited) return [];

    const docs: CollectedDocument[] = [];
    const family = 'github';
    const logins = u ? [u.login] : candidates;
    if (u && profileRes) {
      const owner = { handle: u.login, displayName: u.name ?? undefined };
      const profileText = [u.name, u.bio, u.blog, u.email, u.twitter_username && `twitter: @${u.twitter_username}`].filter(Boolean).join('\n');
      const links: Identifier[] = [];
      if (u.blog) links.push({ type: 'url', value: u.blog.startsWith('http') ? u.blog : `https://${u.blog}` });
      if (u.email) links.push({ type: 'email', value: u.email });
      if (u.twitter_username) links.push({ type: 'nick', value: u.twitter_username });
      if (u.name) links.push({ type: 'name', value: u.name });
      // Konta społecznościowe podpięte przez właściciela profilu – kolejne tropy („macki”)
      const social = await ctx.fetch(`${githubApi}/users/${encodeURIComponent(u.login)}/social_accounts`, { headers: { accept: 'application/vnd.github+json', ...auth } }).catch(() => null);
      const socialLines: string[] = [];
      if (social?.status === 200) {
        for (const a of JSON.parse(social.body) as { provider: string; url: string }[]) {
          socialLines.push(`${a.provider}: ${a.url}`);
          const handle = a.url.match(/^https?:\/\/(?:www\.)?(?:twitter\.com|x\.com|reddit\.com\/u(?:ser)?|dev\.to|t\.me|keybase\.io)\/@?([A-Za-z0-9_.-]{2,40})\/?$/i)?.[1];
          if (/t\.me\//i.test(a.url) && handle) links.push({ type: 'telegram', value: handle });
          else if (handle) links.push({ type: 'nick', value: handle });
          else if (!/linkedin\.com|facebook\.com|instagram\.com/i.test(a.url)) links.push({ type: 'url', value: a.url }); // serwisy wymagające logowania pomijamy
        }
      }
      docs.push({
        family,
        sourceKind: 'OWN_PROFILE',
        url: u.html_url,
        title: `Profil GitHub @${u.login}`,
        fetchedAt: profileRes.fetchedAt,
        contentType: profileRes.contentType,
        owner,
        segments: [{ id: 'profile', author: owner, text: [profileText, ...socialLines].join('\n') }],
        links: [...links, ...extractIdentifiers(profileText).filter((l) => !links.some((x) => x.type === l.type && x.value === l.value))],
        meta: { api: profileRes.url, created_at: u.created_at, ownedByQuery: true },
        raw: profileRes.body,
      });
    }

    for (const login of logins) {
      const owner = { handle: login, displayName: u?.name ?? undefined };
      for (const [repo, file, title] of [
        [login, 'README.md', 'Profilowe README'],
        ['.github', 'profile/README.md', 'Profilowe README organizacji'],
        ['.github', 'FUNDING.yml', 'FUNDING.yml (sponsorowanie)'],
        [login, '.github/FUNDING.yml', 'FUNDING.yml (sponsorowanie)'],
      ] as const) {
        const url = `${githubRaw}/${encodeURIComponent(login)}/${encodeURIComponent(repo)}/HEAD/${file}`;
        const r = await ctx.fetch(url);
        if (r.status !== 200) continue;
        const doc: CollectedDocument = {
          family,
          sourceKind: 'OWN_PROFILE',
          url,
          title: `${title} @${login}`,
          fetchedAt: r.fetchedAt,
          contentType: r.contentType,
          owner,
          segments: [{ id: file, author: owner, text: r.body }],
          links: extractIdentifiers(r.body),
          meta: { repo, file, ownedByQuery: true },
          raw: r.body,
        };
        docs.push(doc);
        // kody QR w obrazach README (ścieżki względne – względem repozytorium)
        if (file.endsWith('.md')) docs.push(...(await collectQrEvidence(pickQrCandidates(imagesInMarkdown(r.body), url), doc, ctx)));
      }
    }

    // Variant logins: confirm against everything published under the login, per login.
    for (const login of new Set(docs.map((d) => d.owner!.handle!))) {
      const own = docs.filter((d) => d.owner!.handle === login);
      const c = confirmVariant(q.value, login, own.flatMap((d) => d.segments.map((s) => s.text)));
      if (!c.isVariant) continue;
      ctx.log(c.note!);
      for (const d of own) Object.assign(d.meta, { nickVariant: login, weakOwnership: c.weak, ...(c.weak ? { reciprocalNeedles: [login] } : {}) });
    }
    return docs;
  },
};

const normName = (s: string) => s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l').replace(/Ł/g, 'L').toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * Imię i nazwisko → konta GitHub z identycznym polem „Name” (wyszukiwarka użytkowników, kwalifikator fullname:).
 * Samo imię i nazwisko to najsłabszy identyfikator (homonimy): znalezione konta dostają powiązanie słabe,
 * dopóki inny ślad podmiotu nie wskaże tego loginu (wzajemne potwierdzenie), i nie są źródłem dalszego pivotu.
 */
async function collectByName(q: Identifier, ctx: ConnectorContext): Promise<CollectedDocument[]> {
  const auth: Record<string, string> = ctx.config.githubToken ? { authorization: `Bearer ${ctx.config.githubToken}` } : {};
  const res = await ctx.fetch(`${ctx.config.urls.githubApi}/search/users?q=${encodeURIComponent(`fullname:"${q.value}"`)}&per_page=5`, {
    headers: { accept: 'application/vnd.github+json', ...auth },
  });
  if (res.status !== 200) {
    ctx.warn(`GitHub – wyszukiwanie po imieniu i nazwisku: HTTP ${res.status}${res.status === 403 || res.status === 422 ? ' (limit API lub brak GITHUB_TOKEN)' : ''}`);
    return [];
  }
  const logins = ((JSON.parse(res.body).items ?? []) as { login: string }[]).map((i) => i.login).slice(0, 3);
  ctx.log(`„${q.value}”: ${logins.length} kont(a) do sprawdzenia (${logins.join(', ') || '—'})`);
  const target = normName(q.value);
  const out: CollectedDocument[] = [];
  for (const login of logins) {
    const docs = await githubConnector.collect({ type: 'nick', value: login }, ctx);
    // tylko konta z dokładnie tym imieniem i nazwiskiem w profilu (wyszukiwarka GitHub dopasowuje też częściowo)
    if (!docs.some((d) => d.owner?.displayName && normName(d.owner.displayName) === target)) continue;
    for (const d of docs) {
      // login konta jest kolejnym tropem: ten sam nick sprawdzamy na innych platformach (Keybase, dev.to, Reddit, ENS, wyszukiwarka)
      if (!d.links.some((l) => l.type === 'nick' && l.value.toLowerCase() === login.toLowerCase())) d.links.push({ type: 'nick', value: login });
      Object.assign(d.meta, { weakOwnership: true, reciprocalNeedles: [login], nameMatch: login, weakReason: `konto GitHub @${login} znalezione wyłącznie po imieniu i nazwisku (możliwy homonim)` });
    }
    out.push(...docs);
  }
  return out;
}
