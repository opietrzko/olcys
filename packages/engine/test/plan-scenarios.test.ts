/**
 * Plan kont testowych zespołu (GitHub + dev.to + Reddit, persona "blazej_rzep_dev99") od początku do końca,
 * w pełni offline: każda odpowiedź źródła pochodzi z nagrania (OLCYS_REPLAY_DIR).
 */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { validateAddress, type AnalysisResult } from '@olcys/core';
import { createEngine, loadConfig, recordingKey } from '../src';
import { confirmVariant, nickVariants } from '../src/connectors/nick';

const NICK = 'blazej_rzep_dev99';
const GH = 'blazej-rzep-dev99'; // GitHub forbids "_" in logins
const MAIN = '0x396343362be2A4dA1cE0C1C210945346fb82Aa49';
const NOISE = validateAddress('0x' + 'ab'.repeat(20)).canonical!; // synthetic, owned by nobody
const BINANCE = '0x28C6c06298d514Db089934071355E5743bf21d60';
const USDT = '0xdAC17F958D2ee523a2206206994597C13D831ec7';
const RAW = 'https://raw.githubusercontent.com';
const RPC = 'https://ethereum-rpc.publicnode.com';
const SEARCH = `https://api.github.com/search/code?q=${encodeURIComponent(`"${MAIN}"`)}&per_page=20`;

function recorder(dir: string) {
  return (url: string, status: number, body: unknown, init?: { method?: string; body?: string }) => {
    const text = typeof body === 'string' ? body : JSON.stringify(body);
    const response = { url, status, contentType: typeof body === 'string' ? 'text/plain; charset=utf-8' : 'application/json', body: text, fetchedAt: '2026-11-21T12:00:00.000Z' };
    writeFileSync(join(dir, `${recordingKey(url, init)}.json`), JSON.stringify({ request: { method: init?.method ?? 'GET', url }, response }));
  };
}

const getCode = (address: string) => ({ method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getCode', params: [address, 'latest'] }) });

const README = `Cześć, jestem Błażej Rzepecki. Tworzę skrypty w Pythonie i boty. Wsparcie projektów (ETH/ERC-20): ${MAIN}. Kontakt: blazej.rzepecki.dev99@gmail.com.`;

function recordPersona(dir: string) {
  const rec = recorder(dir);
  // GitHub: nick z planu nie istnieje (podkreślenie), istnieje wariant z myślnikiem.
  rec(`https://api.github.com/users/${NICK}`, 404, { message: 'Not Found' });
  rec(`https://api.github.com/users/${GH}`, 200, {
    login: GH,
    name: 'Błażej Rzepecki',
    bio: `Błażej Rzepecki | Dev | TG: @${NICK} | Konto testowe HackNation 2026`,
    html_url: `https://github.com/${GH}`,
  });
  rec(`${RAW}/${GH}/${GH}/HEAD/README.md`, 200, README);
  for (const p of [`${GH}/.github/HEAD/profile/README.md`, `${GH}/.github/HEAD/FUNDING.yml`, `${GH}/${GH}/HEAD/.github/FUNDING.yml`]) rec(`${RAW}/${p}`, 404, '404: Not Found');
  // dev.to: one sale post.
  rec(`https://dev.to/api/articles?username=${NICK}&per_page=10`, 200, [{ id: 101, title: 'Sprzedam sprzęt / wymiana P2P', url: `https://dev.to/${NICK}/sprzedam-101`, user: { username: NICK } }]);
  rec(`https://dev.to/api/articles/101`, 200, {
    id: 101,
    title: 'Sprzedam sprzęt / wymiana P2P',
    url: `https://dev.to/${NICK}/sprzedam-101`,
    published_at: '2026-11-21T10:00:00Z',
    user: { username: NICK, name: 'Błażej Rzepecki' },
    body_markdown: `Rozliczenie bezpośrednie w ETH lub USDT na mój portfel: ${MAIN}. Pisać na TG @${NICK}.`,
  });
  // Reddit: cztery posty na profilu użytkownika.
  const post = (id: string, title: string, selftext: string) => ({ kind: 't3', data: { id, author: NICK, title, selftext, permalink: `/user/${NICK}/comments/${id}/`, created_utc: 1795300000 } });
  rec(`https://www.reddit.com/user/${NICK}/submitted.json?limit=50&raw_json=1`, 200, {
    data: {
      children: [
        post('p1', 'Pytanie o kontrakt USDT', `Sprawdzał ktoś ten kontrakt USDT? ${USDT} – nie wiem czy dobrze to wysyłam.`),
        post('p2', 'Wypłata z Binance', `Wypłacałem wczoraj środki z Binance z tego adresu ${BINANCE} i strasznie długo idzie przelew.`),
        post('p3', 'Konkurs krypto giveaway', `Biorę udział w giveawayu! Mój adres do nagrody: ${NOISE}`),
        post('p4', 'Promocja airdrop', `Wrzucam portfel do promocji i airdropa: ${NOISE}`),
      ],
    },
  });
  rec(`https://www.reddit.com/user/${NICK}/comments.json?limit=50&raw_json=1`, 200, { data: { children: [] } });
  // Blockchain: prywatne portfele nie mają kodu (konta EOA).
  for (const a of [MAIN, NOISE]) rec(RPC, 200, { jsonrpc: '2.0', id: 1, result: '0x' }, getCode(a));
}

const finding = (r: AnalysisResult, address: string) => r.findings.find((f) => f.address.toLowerCase() === address.toLowerCase());

describe('warianty nicku', () => {
  it('GitHub nie dopuszcza „_” – próbuje wariantu z myślnikiem', () => {
    expect(nickVariants('blazej_rzep_dev99', 'github')).toEqual(['blazej_rzep_dev99', 'blazej-rzep-dev99']);
    expect(nickVariants('blazej-rzep-dev99', 'devto')).toContain('blazej_rzep_dev99');
  });
  it('konto wariantowe bez wzmianki o oryginalnym nicku = powiązanie słabe', () => {
    expect(confirmVariant('jan_kowal', 'jan-kowal', ['Jan, programista']).weak).toBe(true);
    expect(confirmVariant('jan_kowal', 'jan-kowal', ['TG: @jan_kowal']).weak).toBe(false);
    expect(confirmVariant('jan_kowal', 'jan_kowal', []).isVariant).toBe(false);
  });
});

describe('plan kont testowych (GitHub + dev.to + Reddit), odtworzony offline', () => {
  const dir = mkdtempSync(join(tmpdir(), 'olcys-plan-'));
  recordPersona(dir);
  const engine = createEngine(loadConfig({ OLCYS_REPLAY_DIR: dir, OLCYS_LIVE_RATES: 'false' }));
  let result: AnalysisResult;
  const run = async () => (result ??= (await engine.run({ identifiers: [{ type: 'nick', value: NICK }], options: { maxDepth: 1, useHistory: false } })).result);
  afterAll(() => undefined);

  it('S1: adres z GitHuba + ogłoszenie na dev.to = bardzo wysoka pewność z synergią', async () => {
    const r = await run();
    const f = finding(r, MAIN)!;
    expect(f).toBeDefined();
    expect(f.attribution.gated).toBe(false);
    expect(f.attribution.score).toBeGreaterThanOrEqual(80);
    const ids = f.attribution.rules.map((x) => x.ruleId);
    expect(ids).toContain('BASE_OFFICIAL_PROFILE');
    expect(ids).toContain('SYNERGY');
    expect(new Set(f.occurrences.map((o) => o.family))).toEqual(new Set(['github', 'dev.to']));
    const dev = f.occurrences.find((o) => o.family === 'dev.to')!;
    expect(dev.context.category).toBe('SALE_OR_SETTLEMENT'); // 60-79% on its own: 70 + 5 (mój portfel)
    expect(dev.identityLink?.strength).toBe('DIRECT');
  });

  it('odrzuca pułapki z Reddita: kontrakt USDT i giełdę Binance (0%)', async () => {
    const r = await run();
    for (const a of [USDT, BINANCE]) {
      const f = finding(r, a)!;
      expect(f, a).toBeDefined();
      expect(f.attribution.gated).toBe(true);
      expect(f.attribution.score).toBe(0);
    }
  });

  it('S2: giveaway/airdrop na Reddicie = szum 10–39%, bez synergii w jednym serwisie', async () => {
    const r = await run();
    const f = finding(r, NOISE)!;
    expect(f).toBeDefined();
    expect(f.occurrences).toHaveLength(2);
    expect(f.occurrences.every((o) => o.context.category === 'MASS_COMMENT')).toBe(true);
    expect(f.attribution.score).toBeGreaterThanOrEqual(10);
    expect(f.attribution.score).toBeLessThanOrEqual(39);
    expect(f.attribution.rules.map((x) => x.ruleId)).not.toContain('SYNERGY');
  });

  it('pivot: z profilu GitHub odkrywa Telegram i e-mail; wszystko odtworzone bez sieci', async () => {
    const r = await run();
    const ids = r.identities.map((i) => `${i.type}:${i.value}`);
    expect(ids).toContain(`telegram:${NICK}`);
    expect(ids).toContain('email:blazej.rzepecki.dev99@gmail.com');
    expect(r.egress.length).toBeGreaterThan(0);
    expect(r.egress.every((e) => e.replay)).toBe(true);
    expect(r.trace.some((t) => t.message.includes('login wariantowy'))).toBe(true);
  });
});

describe('S3: wyszukiwanie po samym adresie (GitHub code search, wymaga tokena)', () => {
  it('znajduje profilowe README i przez pivot dociera do konta właściciela', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'olcys-addr-'));
    recordPersona(dir);
    const rec = recorder(dir);
    rec(SEARCH, 200, {
      total_count: 1,
      items: [{ path: 'README.md', html_url: `https://github.com/${GH}/${GH}/blob/main/README.md`, repository: { name: GH, full_name: `${GH}/${GH}`, owner: { login: GH } } }],
    });
    rec(`https://dev.to/api/articles?username=${GH}&per_page=10`, 404, { error: 'not found' });
    const engine = createEngine(loadConfig({ OLCYS_REPLAY_DIR: dir, OLCYS_LIVE_RATES: 'false', GITHUB_TOKEN: 'test-token' }));
    const { result } = await engine.run({ identifiers: [{ type: 'address', value: MAIN }], options: { maxDepth: 1, useHistory: false } });
    const f = finding(result, MAIN)!;
    expect(f.occurrences.some((o) => o.family === 'github')).toBe(true);
    expect(f.attribution.score).toBeGreaterThanOrEqual(80);
    expect(result.identities.some((i) => i.type === 'nick' && i.value === GH && i.strength === 'PIVOT')).toBe(true);
  });

  it('adres szeroko publikowany: idzie tylko za profilowym README, nie za plikami z cudzych repozytoriów', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'olcys-addr-wide-'));
    recordPersona(dir);
    const rec = recorder(dir);
    const docHit = { path: 'docs/tutorial.md', html_url: 'https://github.com/ethereum/docs-site/blob/main/docs/tutorial.md', repository: { name: 'docs-site', full_name: 'ethereum/docs-site', owner: { login: 'ethereum' } } };
    const profileHit = { path: 'README.md', html_url: `https://github.com/${GH}/${GH}/blob/main/README.md`, repository: { name: GH, full_name: `${GH}/${GH}`, owner: { login: GH } } };
    // README profilu jest ostatnim z wielu trafień, a i tak musi zostać wybrane pierwsze.
    rec(SEARCH, 200, { total_count: 1824, items: [docHit, docHit, docHit, docHit, docHit, profileHit] });
    rec(
      `${RAW}/ethereum/docs-site/HEAD/docs/tutorial.md`,
      200,
      `Przykład: subskrypcja ${MAIN}. Zobacz https://www.alchemy.com/docs/websockets, https://github.com/features/copilot, https://claude.ai/new?q=read i https://dashboard.example.org/signup`,
    );
    rec(`https://dev.to/api/articles?username=${GH}&per_page=10`, 404, { error: 'not found' });
    const engine = createEngine(loadConfig({ OLCYS_REPLAY_DIR: dir, OLCYS_LIVE_RATES: 'false', GITHUB_TOKEN: 'test-token' }));
    const { result } = await engine.run({ identifiers: [{ type: 'address', value: MAIN }], options: { maxDepth: 2, useHistory: false } });
    const ids = result.identities.map((i) => `${i.type}:${i.value}`);
    expect(ids).toContain(`nick:${GH}`);
    expect(ids).not.toContain('nick:ethereum');
    expect(ids).not.toContain('nick:features');
    expect(ids.filter((i) => i.startsWith('url:'))).toEqual([]);
    expect(result.trace.some((t) => t.message.includes('1824 plikach'))).toBe(true);
    // Plik dokumentacji zostaje jako dowód kontekstowy, ale nie jest profilem podmiotu.
    const doc = result.evidence.find((e) => e.url.includes('docs-site'))!;
    expect(doc.sourceKind).toBe('UNKNOWN');
  });
});

describe('Reddit z kluczem zarejestrowanej aplikacji', () => {
  it('używa oficjalnego API OAuth (oauth.reddit.com), nie anonimowych listingów', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'olcys-reddit-'));
    const rec = recorder(dir);
    rec(`https://oauth.reddit.com/user/${NICK}/submitted?limit=50&raw_json=1`, 200, {
      data: { children: [{ kind: 't3', data: { id: 'p3', author: NICK, title: 'Konkurs krypto giveaway', selftext: `Mój adres do nagrody: ${NOISE}` } }] },
    });
    rec(`https://oauth.reddit.com/user/${NICK}/comments?limit=50&raw_json=1`, 200, { data: { children: [] } });
    const { redditConnector } = await import('../src/connectors/reddit');
    const { createSafeFetch } = await import('../src');
    const config = loadConfig({ OLCYS_REPLAY_DIR: dir, REDDIT_CLIENT_ID: 'id', REDDIT_CLIENT_SECRET: 'secret' });
    const docs = await redditConnector.collect({ type: 'nick', value: NICK }, { config, fetch: createSafeFetch(config), log: () => {}, warn: () => {} });
    expect(docs).toHaveLength(1);
    expect(docs[0].meta.access).toBe('oauth');
    expect(docs[0].segments[0].author?.handle).toBe(NICK);
  });
});

describe('tryb offline', () => {
  it('brak nagrania = jawny błąd, a nie ciche wyjście do sieci', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'olcys-empty-'));
    const { createSafeFetch } = await import('../src');
    const f = createSafeFetch(loadConfig({ OLCYS_REPLAY_DIR: dir }));
    await expect(f('https://api.github.com/users/x')).rejects.toThrow(/brak nagrania/);
  });
});
