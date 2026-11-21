/** Zabezpieczenia trybu LIVE – testy bez dostępu do sieci. */
import { describe, expect, it } from 'vitest';
import type { EvidenceDocument, SubjectIdentity } from '@olcys/core';
import { createSafeFetch, EgressDeniedError, isPrivateIp, linkFor, loadConfig } from '../src';
import { EXPLORER_HOSTS, isExplorerHost, kindForHost } from '../src/connectors/search';

const live = loadConfig({});

describe('kontrola ruchu wychodzącego (live)', () => {
  it('rozpoznaje adresy prywatne i wewnętrzne', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '192.168.0.10', '172.20.1.1', '169.254.169.254', '::1', 'fd00::1', '::ffff:10.0.0.1']) expect(isPrivateIp(ip)).toBe(true);
    for (const ip of ['8.8.8.8', '151.101.1.69', '2606:4700::1111']) expect(isPrivateIp(ip)).toBe(false);
  });
  it('blokuje pobranie strony z sieci wewnętrznej (SSRF), zanim padnie żądanie', async () => {
    const f = createSafeFetch(live);
    await expect(f('http://169.254.169.254/latest/meta-data', { kind: 'page' })).rejects.toBeInstanceOf(EgressDeniedError);
    await expect(f('http://localhost:5432/', { kind: 'page' })).rejects.toBeInstanceOf(EgressDeniedError);
    await expect(f('http://intranet.internal/', { kind: 'page' })).rejects.toBeInstanceOf(EgressDeniedError);
  });
  it('zapytania API tylko do zatwierdzonych hostów', async () => {
    const f = createSafeFetch(live);
    await expect(f('https://api.example-unapproved.com/q?nick=x')).rejects.toBeInstanceOf(EgressDeniedError);
    expect(live.egressAllowlist).toContain('api.github.com');
  });
  it('odrzuca protokoły inne niż http(s)', async () => {
    await expect(createSafeFetch(live)('file:///etc/passwd', { kind: 'page' })).rejects.toBeInstanceOf(EgressDeniedError);
  });
});

describe('wzajemne potwierdzenie w otwartych przestrzeniach nazw', () => {
  const ids: SubjectIdentity[] = [{ type: 'nick', value: 'janek', strength: 'DIRECT', via: 'wejście', depth: 0 }];
  const doc = (meta: Record<string, unknown>): EvidenceDocument => ({
    id: 'ev1', connector: 'ens', family: 'ens', sourceKind: 'OWN_PROFILE', url: 'ens://janek.eth', title: 'ENS janek.eth', fetchedAt: '', contentType: '', sha256: '', sizeBytes: 0,
    owner: { handle: 'janek' }, segments: [{ id: 's', text: 'x' }], links: [], query: { type: 'nick', value: 'janek' }, meta: { ownedByQuery: true, ...meta },
  });
  it('nazwa ENS zgodna z nickiem bez potwierdzenia → WEAK', () => {
    expect(linkFor(doc({}).segments[0], doc({ weakOwnership: true }), ids)?.strength).toBe('WEAK');
  });
  it('po potwierdzeniu → siła identyfikatora', () => {
    expect(linkFor(doc({}).segments[0], doc({ weakOwnership: false }), ids)?.strength).toBe('DIRECT');
  });
});

describe('imię i nazwisko', () => {
  const ids: SubjectIdentity[] = [{ type: 'name', value: 'Błażej Rzepecki', strength: 'DIRECT', via: 'wejście', depth: 0 }];
  const page: EvidenceDocument = {
    id: 'ev2', connector: 'search', family: 'example.org', sourceKind: 'UNKNOWN', url: 'https://example.org', title: 't', fetchedAt: '', contentType: '', sha256: '', sizeBytes: 0,
    segments: [{ id: 's', text: 'Blazej Rzepecki – portfel 0x0000000000000000000000000000000000000001' }], links: [], query: { type: 'name', value: 'Błażej Rzepecki' }, meta: {},
  };
  it('imię i nazwisko obok adresu (także bez polskich znaków) → powiązanie słabe', () => {
    expect(linkFor(page.segments[0], page, ids)?.strength).toBe('WEAK');
  });
  it('konto znalezione po imieniu i nazwisku bez potwierdzenia → WEAK z powodem', () => {
    const gh: EvidenceDocument = { ...page, connector: 'github', meta: { ownedByQuery: true, weakOwnership: true, weakReason: 'konto GitHub @x znalezione wyłącznie po imieniu i nazwisku' } };
    const l = linkFor(gh.segments[0], gh, ids);
    expect(l?.strength).toBe('WEAK');
    expect(l?.via).toContain('wyłącznie po imieniu i nazwisku');
  });
});

describe('tropy tymczasowe („macki”)', () => {
  it('identyfikator z gałęzi niepotwierdzonego konta daje powiązanie słabe', () => {
    const ids: SubjectIdentity[] = [
      { type: 'name', value: 'Jan Kowalski', strength: 'DIRECT', via: 'wejście', depth: 0 },
      { type: 'nick', value: 'jk_dev', strength: 'WEAK', via: 'z konta niepotwierdzonego', depth: 1, tentative: 'ev_root' },
    ];
    const doc: EvidenceDocument = {
      id: 'ev3', connector: 'devto', family: 'dev.to', sourceKind: 'OWN_PROFILE', url: 'https://dev.to/jk_dev', title: 'dev.to', fetchedAt: '', contentType: '', sha256: '', sizeBytes: 0,
      owner: { handle: 'jk_dev' }, segments: [{ id: 's', text: 'x' }], links: [], query: { type: 'nick', value: 'jk_dev' }, meta: { ownedByQuery: true },
    };
    expect(linkFor(doc.segments[0], doc, ids)?.strength).toBe('WEAK');
    ids[1].strength = 'PIVOT'; // po potwierdzeniu konta-źródła gałąź awansuje
    expect(linkFor(doc.segments[0], doc, ids)?.strength).toBe('PIVOT');
  });
});

describe('wyszukiwarka', () => {
  it('pomija eksploratory blockchain i klasyfikuje domeny', () => {
    expect(EXPLORER_HOSTS.test('etherscan.io')).toBe(true);
    expect(EXPLORER_HOSTS.test('www.blockchain.com')).toBe(true);
    expect(EXPLORER_HOSTS.test('bitcointalk.org')).toBe(false);
    for (const h of ['cronoscan.com', 'explorer.fuse.io', 'eth.blockscout.com', 'tronscan.org']) expect(isExplorerHost(h)).toBe(true);
    for (const h of ['bitcointalk.org', 'github.com', 'scanner-news.pl']) expect(isExplorerHost(h)).toBe(false);
    expect(kindForHost('bitcointalk.org')).toBe('FORUM');
    expect(kindForHost('www.olx.pl')).toBe('P2P_LISTING');
  });
});
