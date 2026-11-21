/**
 * Gravatar – publiczny profil powiązany z adresem e-mail (hash SHA-256), zawiera m.in. sekcję portfeli krypto
 * i zweryfikowane konta. Pozwala przejść: e-mail → adresy krypto → profile społecznościowe.
 */
import { createHash } from 'node:crypto';
import type { Identifier } from '@olcys/core';
import { extractIdentifiers, type CollectedDocument } from '../evidence';
import { type ConnectorContext, type SourceConnector } from './types';

interface GravatarProfile {
  hash: string;
  display_name?: string;
  profile_url?: string;
  description?: string;
  location?: string;
  verified_accounts?: { service_label: string; url: string }[];
  payments?: { crypto_wallets?: { label: string; address: string }[] };
}

export const gravatarConnector: SourceConnector = {
  id: 'gravatar',
  title: 'Gravatar (profil e-mail, portfele krypto)',
  compliance: 'Publiczne API profili Gravatar; e-mail przekazywany wyłącznie jako hash SHA-256.',
  accepts: ['email'],
  isLive: () => true,
  enabled: () => true,
  async collect(q: Identifier, ctx: ConnectorContext): Promise<CollectedDocument[]> {
    const hash = createHash('sha256').update(q.value.trim().toLowerCase()).digest('hex');
    const res = await ctx.fetch(`${ctx.config.urls.gravatarApi}/profiles/${hash}`, { headers: { accept: 'application/json' } });
    if (res.status !== 200) return [];
    const p = JSON.parse(res.body) as GravatarProfile;
    const wallets = p.payments?.crypto_wallets ?? [];
    const accounts = p.verified_accounts ?? [];
    const text = [
      p.display_name,
      p.description,
      p.location,
      ...wallets.map((w) => `Mój portfel ${w.label}: ${w.address}`),
      ...accounts.map((a) => `Zweryfikowane konto ${a.service_label}: ${a.url}`),
    ]
      .filter(Boolean)
      .join('\n');
    const owner = { displayName: p.display_name };
    return [
      {
        family: 'gravatar',
        sourceKind: 'OWN_PROFILE',
        url: p.profile_url ?? res.url,
        title: `Profil Gravatar (${p.display_name ?? hash.slice(0, 10)})`,
        fetchedAt: res.fetchedAt,
        contentType: res.contentType,
        owner,
        segments: [{ id: 'profile', author: owner, text }],
        links: [...accounts.flatMap((a) => extractIdentifiers(a.url)), ...(p.display_name ? [{ type: 'name' as const, value: p.display_name }] : [])],
        meta: { api: res.url, emailSha256: hash, ownedByQuery: true },
        raw: res.body,
      },
    ];
  },
};
