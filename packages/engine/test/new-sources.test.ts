/**
 * Testy offline źródeł z engine 0.4: OFAC SDN, transfery Solana, parsery Bitcointalk / Nostr / Bluesky
 * i ceny historyczne. Dane wejściowe są syntetyczne.
 */
import { describe, expect, it } from 'vitest';
import { resolveAsset, synthetic } from '@olcys/core';
import { daysBetween, fetchBinanceDaily } from '../src/rates';
import { parseSdn } from '../src/labelSources';
import { parseSolanaTransfers } from '../src/providers';
import { bitcointalkPostText, parseBitcointalkProfile } from '../src/connectors/bitcointalk';
import { blueskyHandles } from '../src/connectors/bluesky';
import { decodeCfEmail, isNip05Candidate, parseNjump } from '../src/connectors/nostr';
import { DEFAULT_LIVE_SOURCES, loadConfig } from '../src/config';
import type { SafeFetch } from '../src/http';

const ETH = synthetic.eth('ofac-test');
const BTC = synthetic.btcBech32('ofac-test');
const TRX = synthetic.tron('ofac-test');

describe('OFAC SDN', () => {
  const xml = `<?xml version="1.0"?><sdnList><publshInformation><Publish_Date>11/20/2026</Publish_Date></publshInformation>
  <sdnEntry><uid>1</uid><lastName>TEST ENTITY &amp; CO</lastName><sdnType>Entity</sdnType><programList><program>CYBER2</program></programList>
    <idList>
      <id><uid>10</uid><idType>Digital Currency Address - ETH</idType><idNumber>${ETH.toLowerCase()}</idNumber></id>
      <id><uid>11</uid><idType>Digital Currency Address - XBT</idType><idNumber>${BTC}</idNumber></id>
      <id><uid>12</uid><idType>Digital Currency Address - USDT</idType><idNumber>${TRX}</idNumber></id>
      <id><uid>13</uid><idType>Digital Currency Address - XMR</idType><idNumber>4xyz</idNumber></id>
      <id><uid>14</uid><idType>Digital Currency Address - XBT</idType><idNumber>1NotAValidAddressxxxxxxxxxxxxxxxx</idNumber></id>
      <id><uid>15</uid><idType>Passport</idType><idNumber>X123</idNumber></id>
    </idList></sdnEntry>
  <sdnEntry><uid>2</uid><firstName>Jan</firstName><lastName>NOCRYPTO</lastName><sdnType>Individual</sdnType></sdnEntry>
  </sdnList>`;
  it('wyciąga poprawne adresy obsługiwanych sieci jako SANCTIONED', () => {
    const { labels, publishDate, skipped } = parseSdn(xml);
    expect(publishDate).toBe('11/20/2026');
    expect(labels.map((l) => [l.chain, l.address])).toEqual([
      ['ETH', ETH],
      ['BTC', BTC],
      ['TRON', TRX],
    ]);
    expect(labels[0]).toMatchObject({ category: 'SANCTIONED', entity: 'OFAC SDN: TEST ENTITY & CO', source: 'OFAC SDN uid 1 (ETH)' });
    expect(labels[0].note).toContain('CYBER2');
    expect(skipped).toEqual({ XMR: 1, XBT: 1 });
  });
});

describe('Solana – transfery z transakcji jsonParsed', () => {
  const ME = 'So1anaSubject111111111111111111111111111111';
  const CP = 'So1anaCounterparty11111111111111111111111111';
  const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
  const tx = {
    blockTime: 1_790_000_000,
    meta: {
      err: null,
      preTokenBalances: [
        { accountIndex: 2, mint: USDC, owner: CP, uiTokenAmount: { decimals: 6 } },
        { accountIndex: 3, mint: USDC, owner: ME, uiTokenAmount: { decimals: 6 } },
      ],
      postTokenBalances: [],
      innerInstructions: [{ instructions: [{ program: 'spl-token', parsed: { type: 'transfer', info: { source: 'TokAccCp', destination: 'TokAccMe', amount: '2500000', authority: CP } } }] }],
    },
    transaction: {
      message: {
        accountKeys: [{ pubkey: ME }, { pubkey: CP }, { pubkey: 'TokAccCp' }, { pubkey: 'TokAccMe' }],
        instructions: [
          { program: 'system', parsed: { type: 'transfer', info: { source: ME, destination: CP, lamports: 1_500_000_000 } } },
          { program: 'system', parsed: { type: 'transfer', info: { source: CP, destination: 'Someone', lamports: 1 } } },
        ],
      },
    },
  };
  it('przelew SOL i wpłata USDC na konto tokenowe właściciela', () => {
    const t = parseSolanaTransfers(ME, 'sig1', tx);
    expect(t).toHaveLength(2);
    expect(t[0]).toMatchObject({ chain: 'SOL', asset: 'SOL', amount: 1.5, from: ME, to: CP });
    expect(t[1]).toMatchObject({ asset: 'USDC', amount: 2.5, from: CP, to: ME, tokenContract: USDC });
    expect(resolveAsset(t[1])).toMatchObject({ verified: true, stablecoin: true, priceKey: 'USDC' });
  });
  it('nieudana transakcja nie daje transferów', () => {
    expect(parseSolanaTransfers(ME, 'sig2', { ...tx, meta: { ...tx.meta, err: { InstructionError: [0, 'x'] } } })).toEqual([]);
  });
});

describe('Bitcointalk', () => {
  it('usuwa cytaty innych użytkowników z treści postu', () => {
    const t = bitcointalkPostText(`<div class="quoteheader"><a href="#">Quote from: other</a></div><div class="quote">Wpłaciłem na ${BTC}</div>Mój adres: bc1qown<br/>dalej <a href="https://example.org/x">link</a>`);
    expect(t).not.toContain(BTC);
    expect(t).toContain('Mój adres: bc1qown');
    expect(t).toContain('https://example.org/x');
  });
  it('czyta podpis i stronę WWW z profilu', () => {
    const html = `<table><tr><td><b>Name: </b></td><td>tester</td></tr><tr><td><b>Website: </b></td><td><a href="https://tester.example">x</a></td></tr>
      <tr><td><b>Signature:</b></td></tr><tr><td><div class="signature">BTC: ${BTC}</div></td></tr></table>`;
    const p = parseBitcointalkProfile(html);
    expect(p.signature).toBe(`BTC: ${BTC}`);
    expect(p.website).toBe('https://tester.example');
    expect(p.name).toBe('tester');
  });
});

describe('Nostr / Bluesky', () => {
  it('NIP-05 tylko dla domen własnych', () => {
    expect(isNip05Candidate('jan@example.pl')).toBe(true);
    expect(isNip05Candidate('jan@gmail.com')).toBe(false);
    expect(isNip05Candidate('jan@wp.pl')).toBe(false);
  });
  it('dekoduje adres e-mail ukryty przez Cloudflare', () => {
    // klucz 0x42, "a@b.c"
    const hex = '42' + [...'a@b.c'].map((c) => (c.charCodeAt(0) ^ 0x42).toString(16).padStart(2, '0')).join('');
    expect(decodeCfEmail(hex)).toBe('a@b.c');
  });
  it('czyta metadane profilu i notatki ze strony njump', () => {
    const ev = { pubkey: 'ab'.repeat(32), kind: 0, content: JSON.stringify({ name: 'tester', about: `BTC ${BTC}`, website: 'https://tester.example' }) };
    const html = `<div>Event JSON</div><div>${JSON.stringify(ev)}</div>
      <div itemscope itemtype="https://schema.org/Article"><a itemprop="url" href="/nevent1abc"><span itemprop="dateCreated" datetime="2026-07-21 17:29:00 GMT"></span></a><span itemprop="articleBody">Wpłaty: ${ETH}</span></div>`;
    const p = parseNjump(html);
    expect(p.pubkey).toBe('ab'.repeat(32));
    expect(p.metadata.about).toContain(BTC);
    expect(p.notes).toEqual([{ id: 'nevent1abc', text: `Wpłaty: ${ETH}`, date: '2026-07-21 17:29:00 GMT' }]);
  });
  it('handle Bluesky z nicku', () => {
    expect(blueskyHandles('Jan_K')).toEqual([]);
    expect(blueskyHandles('jan-k')).toEqual(['jan-k.bsky.social']);
    expect(blueskyHandles('@jan.example.pl')).toEqual(['jan.example.pl']);
  });
  it('nowe źródła są na liście zatwierdzonych hostów', () => {
    for (const h of ['public.api.bsky.app', 'api.ninjastic.space', 'bitcointalk.org', 'njump.me', 'api.mainnet-beta.solana.com', 'data-api.binance.vision']) expect(DEFAULT_LIVE_SOURCES).toContain(h);
    expect(loadConfig({}).egressAllowlist).toContain('njump.me');
  });
});

describe('Kursy historyczne starsze niż 365 dni', () => {
  it('daysBetween – przedział domknięty', () => {
    expect(daysBetween('2024-02-27', '2024-03-01')).toEqual(['2024-02-27', '2024-02-28', '2024-02-29', '2024-03-01']);
  });
  it('Binance: POL przed migracją z pary MATICUSDT, potem POLUSDT', async () => {
    const urls: string[] = [];
    const fetch: SafeFetch = async (url) => {
      urls.push(url);
      const sym = new URL(url).searchParams.get('symbol');
      const start = Number(new URL(url).searchParams.get('startTime'));
      return { url, status: 200, contentType: 'application/json', fetchedAt: '', body: JSON.stringify([[start, '0', '0', '0', sym === 'MATICUSDT' ? '0.5' : '0.4']]) };
    };
    const { series, errors } = await fetchBinanceDaily(fetch, 'POL', '2024-09-10', '2024-09-15');
    expect(errors).toEqual([]);
    expect(urls.map((u) => new URL(u).searchParams.get('symbol'))).toEqual(['MATICUSDT', 'POLUSDT']);
    expect(series).toEqual({ '2024-09-10': 0.5, '2024-09-13': 0.4 });
  });
});
