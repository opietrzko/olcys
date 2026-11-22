/**
 * Keybase - publiczne profile z KRYPTOGRAFICZNIE PODPISANYMI dowodami: adresy kryptowalut oraz konta
 * (GitHub, Twitter, Reddit, strony WWW). Podpisany adres = najsilniejsza możliwa przesłanka własności.
 */
import type { Identifier } from '@olcys/core';
import type { CollectedDocument } from '../evidence';
import { type ConnectorContext, type SourceConnector } from './types';

interface KbUser {
  basics?: { username: string; username_cased?: string };
  profile?: { full_name?: string; bio?: string; location?: string } | null;
  cryptocurrency_addresses?: Record<string, { address: string; sig_id?: string }[]>;
  proofs_summary?: { all?: { proof_type: string; nametag: string; service_url?: string; human_url?: string; state?: number }[] };
}

export const keybaseConnector: SourceConnector = {
  id: 'keybase',
  title: 'Keybase (podpisane adresy krypto i dowody kont)',
  compliance: 'Publiczne API profili Keybase (bez logowania); dane opublikowane i podpisane przez właściciela konta.',
  accepts: ['nick'],
  isLive: () => true,
  enabled: () => true,
  async collect(q: Identifier, ctx: ConnectorContext): Promise<CollectedDocument[]> {
    const url = `${ctx.config.urls.keybaseApi}/user/lookup.json?usernames=${encodeURIComponent(q.value)}&fields=basics,profile,proofs_summary,cryptocurrency_addresses`;
    const res = await ctx.fetch(url, { headers: { accept: 'application/json' } });
    if (res.status !== 200) {
      if (res.status !== 404) ctx.warn(`Keybase ${q.value}: HTTP ${res.status}`);
      return [];
    }
    const u = (JSON.parse(res.body).them ?? [])[0] as KbUser | null;
    if (!u?.basics) return [];
    const handle = u.basics.username;
    const owner = { handle, displayName: u.profile?.full_name ?? undefined };
    const wallets = Object.entries(u.cryptocurrency_addresses ?? {}).flatMap(([coin, arr]) => arr.map((a) => `Mój podpisany adres ${coin} (Keybase sig ${a.sig_id?.slice(0, 12) ?? '?'}): ${a.address}`));
    const proofs = (u.proofs_summary?.all ?? []).filter((p) => p.state === undefined || p.state === 1);
    const links: Identifier[] = [];
    for (const p of proofs) {
      if (['github', 'twitter', 'reddit', 'hackernews'].includes(p.proof_type)) links.push({ type: 'nick', value: p.nametag });
      else if ((p.proof_type === 'generic_web_site' || p.proof_type === 'dns') && p.service_url) links.push({ type: 'url', value: p.service_url.startsWith('http') ? p.service_url : `https://${p.nametag}` });
    }
    if (u.profile?.full_name) links.push({ type: 'name', value: u.profile.full_name });
    const text = [u.profile?.full_name, u.profile?.bio, u.profile?.location, ...wallets, ...proofs.map((p) => `Dowód ${p.proof_type}: ${p.nametag}`)].filter(Boolean).join('\n');
    return [
      {
        family: 'keybase',
        sourceKind: 'OWN_PROFILE',
        url: `https://keybase.io/${handle}`,
        title: `Profil Keybase @${handle}`,
        fetchedAt: res.fetchedAt,
        contentType: res.contentType,
        owner,
        segments: [{ id: 'profile', author: owner, text }],
        links,
        // Konto Keybase o tej samej nazwie nie musi należeć do tej samej osoby - wiarygodne tylko z dowodem konta o tym nicku.
        meta: { api: res.url, ownedByQuery: true, signedWallets: wallets.length, weakOwnership: !proofs.some((p) => p.nametag.toLowerCase() === q.value.toLowerCase()) },
        raw: res.body,
      },
    ];
  },
};
