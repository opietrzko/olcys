/**
 * Safety limits of lead-following: a run must finish in bounded time and must not crawl
 * navigation, documentation or sign-in pages as if they were leads to the subject.
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Identifier } from '@olcys/core';
import { createEngine, extractIdentifiers, githubAccountUrl, isPivotableUrl, loadConfig, runAnalysis, type CollectedDocument, type SourceConnector } from '../src';

/** Offline config: replay from an empty recording, so any real request fails loudly instead of going to the network. */
const offline = (env: Record<string, string> = {}) => loadConfig({ OLCYS_REPLAY_DIR: mkdtempSync(join(tmpdir(), 'olcys-guard-')), OLCYS_LIVE_RATES: 'false', ...env });

function profile(nick: string, links: Identifier[]): CollectedDocument {
  return {
    family: 'example',
    sourceKind: 'OWN_PROFILE',
    url: `https://profiles.example.org/${nick}`,
    title: `Profil ${nick}`,
    fetchedAt: '2026-11-21T12:00:00.000Z',
    contentType: 'text/plain',
    owner: { handle: nick },
    segments: [{ id: 'bio', author: { handle: nick }, text: `Profil ${nick}` }],
    links,
    meta: { ownedByQuery: true },
    raw: `Profil ${nick} ${JSON.stringify(links)}`,
  };
}

function stub(collect: (q: Identifier) => Promise<CollectedDocument[]>): SourceConnector {
  return { id: 'stub', title: 'stub', compliance: 'test', accepts: ['nick', 'url'], isLive: () => false, enabled: () => true, collect };
}

async function run(connector: SourceConnector, env?: Record<string, string>, maxDepth = 6) {
  const config = offline(env);
  const engine = createEngine(config);
  const deps = { config, labels: engine.labels, labelDatasets: [], rates: engine.rates, connectors: [connector], history: [] };
  return (await runAnalysis({ identifiers: [{ type: 'nick', value: 'subject' }], options: { maxDepth } }, deps)).result;
}

describe('limity pivotowania', () => {
  it('z jednego dokumentu przyjmuje ograniczoną liczbę tropów – najpierw identyfikatory osoby, potem strony', async () => {
    const urls = Array.from({ length: 30 }, (_, i) => ({ type: 'url' as const, value: `https://site${i}.example.org/` }));
    const result = await run(
      stub(async (q) => (q.value === 'subject' ? [profile('subject', [...urls, { type: 'telegram', value: 'subject_tg' }])] : [])),
      { OLCYS_MAX_PIVOTS_PER_DOC: '5' },
      1,
    );
    const pivots = result.identities.filter((i) => i.depth === 1);
    expect(pivots).toHaveLength(5);
    expect(pivots[0]).toMatchObject({ type: 'telegram', value: 'subject_tg' });
    expect(result.trace.some((t) => t.message.includes('31 tropów w jednym dokumencie'))).toBe(true);
  });

  it('kończy zbieranie po przekroczeniu budżetu czasu i przechodzi do oceny dowodów', async () => {
    let calls = 0;
    // Every profile links to two new accounts: without a budget this would run until the identity cap.
    const endless = stub(async (q) => {
      calls++;
      await new Promise((r) => setTimeout(r, 15));
      return [profile(q.value, [{ type: 'nick', value: `${q.value}a` }, { type: 'nick', value: `${q.value}b` }])];
    });
    const started = Date.now();
    const result = await run(endless, { OLCYS_PIVOT_BUDGET_MS: '60' });
    expect(Date.now() - started).toBeLessThan(2000);
    expect(calls).toBeLessThan(10);
    expect(result.trace.some((t) => t.message.includes('Przekroczono budżet czasu'))).toBe(true);
    expect(result.trace.some((t) => t.message.includes('Zakończono na limicie bezpieczeństwa'))).toBe(true);
  });
});

describe('linki jako tropy', () => {
  it('rozpoznaje profil GitHub, ale nie strony serwisu ani repozytoria', () => {
    expect(githubAccountUrl('https://github.com/kordas-dev')).toBe('kordas-dev');
    expect(githubAccountUrl('https://github.com/kordas-dev/')).toBe('kordas-dev');
    expect(githubAccountUrl('https://github.com/features')).toBe('');
    expect(githubAccountUrl('https://github.com/features/copilot')).toBe('');
    expect(githubAccountUrl('https://github.com/websockets/wscat')).toBe('');
    expect(githubAccountUrl('https://docs.github.com/en')).toBeNull();
    expect(githubAccountUrl('https://kordas-dev.github.io')).toBeNull();
  });

  it('odrzuca logowanie, rejestrację, „udostępnij”, czaty AI i adresy-śmieci', () => {
    for (const bad of [
      'https://`',
      'https://auth.alchemy.com/signup',
      'https://dashboard.alchemy.com/signup?utm_source=docs',
      'https://claude.ai/new?q=Read',
      'https://chat.openai.com/?q=Read',
      'https://en.wikipedia.org/wiki/Exponential_backoff',
      'https://twitter.com/intent/tweet?text=x',
      'https://www.facebook.com/sharer/sharer.php?u=x',
    ])
      expect(isPivotableUrl(bad), bad).toBe(false);
    for (const good of ['https://kordas-dev.github.io', 'https://t.me/kordas_sprzedaz', 'https://example.org/o-mnie']) expect(isPivotableUrl(good), good).toBe(true);
  });

  it('extractIdentifiers nie zamienia ścieżek GitHuba ani linków do dokumentacji w nicki', () => {
    const ids = extractIdentifiers(
      'Repo: https://github.com/websockets/wscat, https://github.com/features/copilot, https://docs.github.com/en, kod `https://`, autor: https://github.com/blazejrzepdev',
    );
    expect(ids.filter((i) => i.type === 'nick').map((i) => i.value)).toEqual(['blazejrzepdev']);
    expect(ids.filter((i) => i.type === 'url').map((i) => i.value)).toEqual(['https://docs.github.com/en']);
  });
});
