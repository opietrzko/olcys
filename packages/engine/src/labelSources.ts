/**
 * Parsery otwartych źródeł etykiet adresów (używane przez scripts/update-labels.ts).
 * OFAC SDN: pola „Digital Currency Address - <kod>” w sdn.xml (U.S. Treasury, domena publiczna).
 */
import { validateAddress, validateSolana, type AddressLabel, type Chain } from '@olcys/core';

const decode = (s: string) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").trim();
const tag = (xml: string, name: string) => {
  const m = xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
  return m ? decode(m[1]) : undefined;
};

/** Kod waluty OFAC → oczekiwana sieć KryptoTrop (dla tokenów: wg formatu adresu). */
const OFAC_CHAINS: Record<string, Chain[]> = {
  XBT: ['BTC'],
  ETH: ['ETH'],
  ARB: ['ETH'],
  BSC: ['ETH'],
  BNB: ['ETH'],
  ETC: ['ETH'],
  // USDT na Omni Layer używa adresów Bitcoina
  USDT: ['ETH', 'TRON', 'BTC'],
  USDC: ['ETH', 'TRON'],
  TRX: ['TRON'],
  LTC: ['LTC'],
  SOL: ['SOL'],
};

export function parseSdn(xml: string): { labels: AddressLabel[]; publishDate: string; skipped: Record<string, number> } {
  const publishDate = tag(xml, 'Publish_Date') ?? '?';
  const labels: AddressLabel[] = [];
  const skipped: Record<string, number> = {};
  const seen = new Set<string>();
  for (const entry of xml.split('<sdnEntry>').slice(1)) {
    if (!entry.includes('Digital Currency Address')) continue;
    const uid = tag(entry, 'uid');
    const name = [tag(entry, 'firstName'), tag(entry, 'lastName')].filter(Boolean).join(' ');
    const type = tag(entry, 'sdnType');
    const programs = [...entry.matchAll(/<program>([^<]+)<\/program>/g)].map((m) => decode(m[1]));
    for (const id of entry.matchAll(/<id>([\s\S]*?)<\/id>/g)) {
      const idType = tag(id[1], 'idType') ?? '';
      const m = idType.match(/^Digital Currency Address - (\w+)/);
      if (!m) continue;
      const coin = m[1];
      const value = tag(id[1], 'idNumber') ?? '';
      // Solana nie ma sumy kontrolnej – validateAddress jej nie zgaduje, więc walidacja formatu wprost dla kodu SOL
      const v = coin === 'SOL' ? validateSolana(value) : validateAddress(value);
      const expected = OFAC_CHAINS[coin];
      if (!expected || !v.valid || !v.chain || !expected.includes(v.chain)) {
        skipped[coin] = (skipped[coin] ?? 0) + 1;
        continue;
      }
      const key = `${v.chain}:${v.chain === 'ETH' ? v.canonical!.toLowerCase() : v.canonical}`;
      if (seen.has(key)) continue;
      seen.add(key);
      labels.push({
        chain: v.chain,
        address: v.canonical!,
        entity: `OFAC SDN: ${name}`,
        category: 'SANCTIONED',
        source: `OFAC SDN uid ${uid} (${coin})`,
        note: [type, programs.length ? `programy: ${programs.join(', ')}` : ''].filter(Boolean).join('; '),
      });
    }
  }
  return { labels, publishDate, skipped };
}

