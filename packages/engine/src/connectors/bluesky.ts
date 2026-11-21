/**
 * Bluesky (AT Protocol) – publiczny profil i posty użytkownika przez publiczny AppView (public.api.bsky.app), bez logowania.
 * Nick bez kropki → `<nick>.bsky.social`; nick z kropką (np. `jan.example.pl`) → handle w domenie, którą właściciel
 * potwierdził wpisem DNS / plikiem .well-known (to silna przesłanka, że domena i konto należą do tej samej osoby).
 */
import type { Identifier } from '@olcys/core';
import { extractIdentifiers, type CollectedDocument } from '../evidence';
import { collectQrEvidence, pickQrCandidates } from '../qr';
import type { ConnectorContext, SourceConnector } from './types';

interface BskyProfile {
  did: string;
  handle: string;
  displayName?: string;
  description?: string;
  createdAt?: string;
}
interface BskyFacet {
  features?: { $type?: string; uri?: string }[];
}
interface BskyFeedItem {
  post: { uri: string; author: { did: string; handle: string }; record: { text?: string; createdAt?: string; facets?: BskyFacet[] }; indexedAt?: string; embed?: { images?: { fullsize?: string; alt?: string }[] } };
  reason?: unknown;
}

const MAX_POSTS = 50;

/** Kandydaci na handle: nick w domenie (z kropką) albo `<nick>.bsky.social`. */
export function blueskyHandles(nick: string): string[] {
  const n = nick.trim().replace(/^@/, '').toLowerCase();
  if (!/^[a-z0-9][a-z0-9.-]{0,252}$/.test(n)) return [];
  return n.includes('.') ? [n] : [`${n}.bsky.social`];
}

export const blueskyConnector: SourceConnector = {
  id: 'bluesky',
  title: 'Bluesky (profil i posty)',
  compliance: 'Publiczne API AppView Bluesky (public.api.bsky.app) – dane, które użytkownik opublikował jako publiczne; bez logowania i bez klucza.',
  accepts: ['nick'],
  isLive: () => true,
  enabled: () => true,
  async collect(q: Identifier, ctx: ConnectorContext): Promise<CollectedDocument[]> {
    const api = ctx.config.urls.blueskyApi;
    for (const handle of blueskyHandles(q.value)) {
      const res = await ctx.fetch(`${api}/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(handle)}`, { headers: { accept: 'application/json' } });
      if (res.status === 400 || res.status === 404) continue;
      if (res.status !== 200) {
        ctx.warn(`Bluesky ${handle}: HTTP ${res.status}`);
        return [];
      }
      const p = JSON.parse(res.body) as BskyProfile;
      const feed = await ctx.fetch(`${api}/xrpc/app.bsky.feed.getAuthorFeed?actor=${encodeURIComponent(p.did)}&limit=${MAX_POSTS}&filter=posts_with_replies`, { headers: { accept: 'application/json' } });
      const items = feed.status === 200 ? ((JSON.parse(feed.body).feed ?? []) as BskyFeedItem[]) : [];
      if (feed.status !== 200) ctx.warn(`Bluesky ${handle}: posty niedostępne (HTTP ${feed.status})`);
      // handle `jan.bsky.social` odpowiada nickowi „jan” – do przypisania autora używamy nicku z wejścia
      const ownerHandle = p.handle.endsWith('.bsky.social') ? p.handle.slice(0, -'.bsky.social'.length) : p.handle;
      const owner = { handle: ownerHandle, displayName: p.displayName };
      const url = `https://bsky.app/profile/${p.handle}`;
      const segments: CollectedDocument['segments'] = [{ id: 'profile', author: owner, text: [p.displayName, p.description].filter(Boolean).join('\n') }];
      const texts = [segments[0].text];
      const images: { src: string; alt?: string }[] = [];
      for (const it of items) {
        // reposty to treści innych osób – pomijamy
        if (it.reason || it.post.author.did !== p.did) continue;
        const links = (it.post.record.facets ?? []).flatMap((f) => (f.features ?? []).map((x) => x.uri).filter((u): u is string => Boolean(u)));
        const text = [it.post.record.text ?? '', ...links].join('\n');
        const rkey = it.post.uri.split('/').pop();
        segments.push({ id: `post-${rkey}`, author: owner, text, publishedAt: it.post.record.createdAt ?? it.post.indexedAt, anchor: `${url}/post/${rkey}` });
        for (const im of it.post.embed?.images ?? []) if (im.fullsize) images.push({ src: im.fullsize, alt: `${im.alt ?? ''} ${text.slice(0, 80)}` });
        texts.push(text);
      }
      ctx.log(`${q.value}: konto Bluesky @${p.handle} (${p.did}), ${segments.length - 1} postów`);
      const doc: CollectedDocument = {
          family: 'bsky.app',
          sourceKind: 'OWN_PROFILE',
          url,
          title: `Profil Bluesky @${p.handle}`,
          fetchedAt: res.fetchedAt,
          contentType: res.contentType,
          owner,
          segments,
          links: extractIdentifiers(texts.join('\n')).filter((l) => !(l.type === 'url' && l.value.startsWith(url))),
          meta: { api: res.url, did: p.did, handle: p.handle, ownedByQuery: true, domainHandle: !p.handle.endsWith('.bsky.social') },
          raw: JSON.stringify({ profile: JSON.parse(res.body), feed: items }),
      };
      // CDN obrazów Bluesky serwuje JPEG – sprawdzamy tylko obrazy z podpowiedzią (QR / portfel) w opisie lub treści posta
      const qr = await collectQrEvidence(pickQrCandidates(images, url).filter((u) => images.some((i) => i.src === u && /qr|btc|bitcoin|eth|usdt|wallet|portfel|adres|address|donat|tip/i.test(i.alt ?? ''))), doc, ctx);
      return [doc, ...qr];
    }
    return [];
  },
};
