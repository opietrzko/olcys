/**
 * Tagi kontrahentów z eksploratora trafiają do właściwej kategorii: on/off-ramp i karty krypto -> OFFRAMP
 * (mimo tagów "hot wallet"/"deposit"), platformy P2P -> P2P_SERVICE, giełdy zostają CEX.
 */
import { describe, expect, it } from 'vitest';
import { EXCLUDED_CATEGORIES } from '@olcys/core';
import { labelFromInfo } from '../src/pipeline';

const A = '0x0000000000000000000000000000000000000001';
const cat = (tags: string[]) => labelFromInfo('ETH', A, { tags, source: 'test' })?.category;

describe('kategorie z tagów eksploratora', () => {
  it('bramki krypto-fiat i karty krypto to OFFRAMP, nie giełda', () => {
    expect(cat(['MoonPay: Hot Wallet'])).toBe('OFFRAMP');
    expect(cat(['Transak: Deposit Address'])).toBe('OFFRAMP');
    expect(cat(['Wirex 4'])).toBe('OFFRAMP');
    expect(cat(['Ramp Network Binance Deposit 1'])).toBe('OFFRAMP');
  });

  it('platformy P2P to P2P_SERVICE', () => {
    expect(cat(['Paxful: Escrow'])).toBe('P2P_SERVICE');
    expect(cat(['Hodl Hodl'])).toBe('P2P_SERVICE');
  });

  it('giełdy zostają CEX', () => {
    expect(cat(['Binance 14'])).toBe('CEX');
    expect(cat(['Zonda: Hot Wallet'])).toBe('CEX');
  });

  it('bramki i usługi P2P nie są przypisywane osobie (0%)', () => {
    expect(EXCLUDED_CATEGORIES.has('OFFRAMP')).toBe(true);
    expect(EXCLUDED_CATEGORIES.has('P2P_SERVICE')).toBe(true);
  });
});
