import { describe, expect, it } from 'vitest';
import { extractPhones, normalizePhone } from '../src';

describe('numer telefonu', () => {
  it('normalizuje różne zapisy do E.164', () => {
    for (const v of ['600 123 456', '600-123-456', '+48 600 123 456', '0048600123456', '48600123456']) expect(normalizePhone(v)).toBe('+48600123456');
    expect(normalizePhone('12')).toBeNull();
  });
  it('wyciąga numer tylko przy słowie kluczowym (nie myli z kwotami)', () => {
    expect(extractPhones('Kontakt: tel. 600-123-456, BLIK')).toEqual(['+48600123456']);
    expect(extractPhones('Cena 600 123 456 zł')).toEqual([]);
  });
});
