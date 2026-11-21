/**
 * Publiczny podgląd kanału Telegram (t.me/s/<kanał>) – dostępny bez logowania i bez API.
 * Selektory zgodne ze znacznikami strony podglądu t.me/s/.
 */
import * as cheerio from 'cheerio';
import type { Identifier } from '@olcys/core';
import { extractIdentifiers, type CollectedDocument } from '../evidence';
import { type ConnectorContext, type SourceConnector } from './types';

export const telegramConnector: SourceConnector = {
  id: 'telegram',
  title: 'Telegram – publiczny podgląd kanału',
  compliance: 'Wyłącznie publiczny podgląd kanału (t.me/s/), bez logowania i bez konta.',
  accepts: ['telegram'],
  isLive: () => true,
  enabled: () => true,
  async collect(q: Identifier, ctx: ConnectorContext): Promise<CollectedDocument[]> {
    const handle = q.value.replace(/^@/, '');
    const url = `${ctx.config.urls.telegram}/s/${encodeURIComponent(handle)}`;
    const res = await ctx.fetch(url);
    if (res.status !== 200) return [];
    const $ = cheerio.load(res.body);
    const segments = $('.tgme_widget_message')
      .map((_, el) => ({
        id: ($(el).attr('data-post') ?? 'msg').replace('/', '-'),
        author: { handle },
        text: $(el).find('.tgme_widget_message_text').text().trim(),
        publishedAt: $(el).find('time').attr('datetime'),
        anchor: `${url.replace('/s/', '/')}/${($(el).attr('data-post') ?? '').split('/')[1] ?? ''}`,
      }))
      .get()
      .filter((s) => s.text);
    if (!segments.length) return profileFallback(handle, ctx);
    return [
      {
        family: 'telegram',
        sourceKind: 'MESSENGER',
        url,
        title: `Kanał Telegram @${handle}: ${$('.tgme_channel_info_header_title').text().trim()}`,
        fetchedAt: res.fetchedAt,
        contentType: res.contentType,
        owner: { handle },
        segments,
        links: [],
        meta: { ownedByQuery: true },
        raw: res.body,
      },
    ];
  },
};

/**
 * Konto użytkownika (nie kanał): publiczna strona t.me/<nazwa> pokazuje nazwę i opis profilu (bio),
 * w którym bywa adres portfela lub kolejne identyfikatory.
 */
async function profileFallback(handle: string, ctx: ConnectorContext): Promise<CollectedDocument[]> {
  const url = `${ctx.config.urls.telegram}/${encodeURIComponent(handle)}`;
  const res = await ctx.fetch(url);
  if (res.status !== 200) return [];
  const $ = cheerio.load(res.body);
  const title = $('.tgme_page_title').text().trim();
  const bio = $('.tgme_page_description').text().trim();
  // strona domyślna Telegrama (konto nie istnieje) nie ma tytułu profilu
  if (!title && !bio) return [];
  const text = [title, bio].filter(Boolean).join('\n');
  const owner = { handle, displayName: title || undefined };
  return [
    {
      family: 'telegram',
      sourceKind: 'OWN_PROFILE',
      url,
      title: `Profil Telegram @${handle}${title ? `: ${title}` : ''}`,
      fetchedAt: res.fetchedAt,
      contentType: res.contentType,
      owner,
      segments: [{ id: 'profile', author: owner, text }],
      links: extractIdentifiers(bio),
      meta: { ownedByQuery: true, profile: true },
      raw: res.body,
    },
  ];
}
