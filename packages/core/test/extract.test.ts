import { describe, expect, it } from 'vitest';
import { extractAddresses, validateAddress, synthetic } from '../src';

describe('ekstrakcja i walidacja adresów', () => {
  it('rozpoznaje adresy różnych sieci z sumą kontrolną', () => {
    const text = `ETH 0x28C6c06298d514Db089934071355E5743bf21d60, BTC bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq, legacy 34xp4vRoCGJym3xR7yCVPFHoCNxv4Twseo, TRON TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t`;
    const found = extractAddresses(text);
    expect(found.map((f) => f.chain)).toEqual(['ETH', 'BTC', 'BTC', 'TRON']);
    expect(found.every((f) => f.validation === 'checksum')).toBe(true);
  });

  it('odrzuca adres z błędną sumą kontrolną EIP-55 i hash transakcji', () => {
    expect(validateAddress('0x28c6C06298d514Db089934071355E5743bf21d60').valid).toBe(false);
    const txHash = '0x' + 'ab'.repeat(32);
    expect(extractAddresses(`tx ${txHash}`)).toHaveLength(0);
  });

  it('odrzuca losowy ciąg base58 bez poprawnej sumy kontrolnej', () => {
    expect(extractAddresses('1BoatSLRHtKNngkdXEeobR76b53LETtpyX')).toHaveLength(0);
  });

  it('odtwarza adres zapisany z separatorami (zaciemnienie)', () => {
    const a = synthetic.eth('test');
    const obf = a.match(/.{1,10}/g)!.join(' ');
    const [f] = extractAddresses(`Mój portfel: ${obf} dzięki`);
    expect(f.address).toBe(a);
    expect(f.deobfuscated).toBe(true);
  });

  it('usuwa znaki niewidoczne wstawione w adres', () => {
    const a = synthetic.btcBech32('zw');
    const [f] = extractAddresses(`BTC: ${a.slice(0, 10)}​${a.slice(10)}`);
    expect(f.address).toBe(a);
  });

  it('Solana tylko przy słowie kluczowym w kontekście', () => {
    const sol = '7EcDhSYGxXyscszYEp35KHN8vvw3svAuLKTzXwCFLtV';
    expect(extractAddresses(`random ${sol}`)).toHaveLength(0);
    expect(extractAddresses(`mój adres Solana: ${sol}`)[0]?.chain).toBe('SOL');
  });

  it('generator syntetycznych adresów daje poprawne adresy', () => {
    for (const a of [synthetic.eth('x'), synthetic.btcBech32('x'), synthetic.btcLegacy('x'), synthetic.tron('x'), synthetic.ltc('x')]) expect(validateAddress(a).valid).toBe(true);
  });
});
