/**
 * Archiwum Internetu (Wayback Machine CDX API) – historyczne wersje profili/stron.
 * Umożliwia wykrycie podmiany adresu portfela publikowanego w różnych okresach (kryterium opcjonalne).
 */
import * as cheerio from 'cheerio';
import type { EvidenceDocument } from '@olcys/core';
import type { CollectedDocument } from '../evidence';
import { isMock, type ConnectorContext, type HistoryConnector } from './types';

const tsToIso = (ts: string) => `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}T${ts.slice(8, 10)}:${ts.slice(10, 12)}:${ts.slice(12, 14)}Z`;

export const waybackConnector: HistoryConnector = {
  id: 'wayback',
  title: 'Archiwum Internetu (Wayback CDX)',
  compliance: 'Publiczne API CDX archive.org; pobierane wyłącznie zarchiwizowane wersje publicznych stron.',
  isLive: (c) => !isMock(c.urls.wayback, c),
  async history(doc: EvidenceDocument, ctx: ConnectorContext): Promise<CollectedDocument[]> {
    const base = ctx.config.urls.wayback;
    const cdx = await ctx.fetch(`${base}/cdx/search/cdx?url=${encodeURIComponent(doc.url)}&output=json&limit=10&filter=statuscode:200`);
    if (cdx.status !== 200 || !cdx.body.trim().startsWith('[')) return [];
    const rows = JSON.parse(cdx.body) as string[][];
    const out: CollectedDocument[] = [];
    for (const row of rows.slice(1)) {
      const [, ts, original] = row;
      const snapshotUrl = `${base}/web/${ts}id_/${original}`;
      const r = await ctx.fetch(snapshotUrl);
      if (r.status !== 200) continue;
      const $ = cheerio.load(r.body);
      $('script,style').remove();
      const text = $('body').text().replace(/\s+/g, ' ').trim();
      out.push({
        family: doc.family,
        sourceKind: doc.sourceKind,
        url: doc.url,
        title: `[archiwum ${ts.slice(0, 8)}] ${doc.title}`,
        fetchedAt: r.fetchedAt,
        archivedAt: tsToIso(ts),
        contentType: r.contentType,
        owner: doc.owner,
        segments: [{ id: `snapshot-${ts}`, author: doc.owner, text }],
        links: [],
        meta: { snapshotUrl, cdx: cdx.url, ownedByQuery: doc.meta.ownedByQuery ?? false, parentEvidenceId: doc.id },
        raw: r.body,
      });
    }
    return out;
  },
};
