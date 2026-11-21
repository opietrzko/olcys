/**
 * Aktualizacja zbiorów etykiet w data/labels/ z otwartych, publicznych źródeł.
 *
 *  1. OFAC SDN (U.S. Treasury, domena publiczna) – adresy kryptowalut osób i podmiotów objętych sankcjami
 *     (pola „Digital Currency Address - …” w sdn.xml) → data/labels/ofac-sdn.json, kategoria SANCTIONED.
 *  2. Polskie giełdy i kantory krypto – publiczne tagi adresów w eksploratorze Blockscout (Open Labels Initiative
 *     i etykiety eksploratora) → data/labels/pl-vasp-blockscout.json, kategoria CEX.
 *
 * Każdy adres przechodzi walidację sumy kontrolnej (@olcys/core). Adresy sieci, których KryptoTrop nie obsługuje
 * (np. XMR, ZEC, BCH), są pomijane i liczone w opisie zbioru.
 *
 *   npm run labels:update            – oba zbiory
 *   npm run labels:update -- ofac    – tylko OFAC
 *   npm run labels:update -- pl      – tylko polskie giełdy
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateAddress, type AddressLabel } from '@olcys/core';
import { parseSdn, REPO_ROOT } from '@olcys/engine';

const OUT = join(REPO_ROOT, 'data', 'labels');
const UA = 'KryptoTrop-OSINT/0.4 (aktualizacja etykiet z danych publicznych)';
const SDN_URL = process.env.OFAC_SDN_URL ?? 'https://www.treasury.gov/ofac/downloads/sdn.xml';
const BLOCKSCOUT = (process.env.BLOCKSCOUT_URL ?? 'https://eth.blockscout.com').replace(/\/$/, '');

/** Polskie giełdy, kantory i bramki krypto-fiat (nazwy do wyszukania w tagach eksploratora). */
const PL_VASPS = ['Zonda', 'BitBay', 'Kanga Exchange', 'Egera', 'Ari10', 'BitClude', 'Coinroom', 'Kriptomat', 'Bitcan', 'Cashify', 'Walutomat'];

interface Dataset {
  name: string;
  description: string;
  license: string;
  updatedAt: string;
  sourceUrl: string;
  labels: AddressLabel[];
}

async function updateOfac() {
  // OFAC_SDN_FILE – wcześniej pobrany sdn.xml (serwer OFAC bywa wolny: ~30 MB)
  let xml: string;
  if (process.env.OFAC_SDN_FILE) xml = readFileSync(process.env.OFAC_SDN_FILE, 'utf8');
  else {
    console.log(`OFAC SDN: pobieram ${SDN_URL} …`);
    const r = await fetch(SDN_URL, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(600_000) });
    if (!r.ok) throw new Error(`OFAC SDN: HTTP ${r.status}`);
    xml = await r.text();
  }
  const { labels, publishDate, skipped } = parseSdn(xml);
  const skippedText = Object.entries(skipped).map(([c, n]) => `${c} ${n}`).join(', ');
  const ds: Dataset = {
    name: 'ofac-sdn',
    description: `Adresy kryptowalut z listy sankcyjnej OFAC SDN (publikacja ${publishDate}). Kontakt z takim adresem to wskaźnik wysokiego ryzyka. Pominięto sieci nieobsługiwane lub adresy o niepoprawnej sumie kontrolnej: ${skippedText || 'brak'}.`,
    license: 'U.S. Treasury OFAC – dane publiczne (domena publiczna, 17 U.S.C. § 105)',
    updatedAt: new Date().toISOString(),
    sourceUrl: 'https://ofac.treasury.gov/specially-designated-nationals-and-blocked-persons-list-sdn-human-readable-lists',
    labels: labels.sort((a, b) => a.chain.localeCompare(b.chain) || a.address.localeCompare(b.address)),
  };
  writeFileSync(join(OUT, 'ofac-sdn.json'), JSON.stringify(ds, null, 2) + '\n');
  const by = labels.reduce<Record<string, number>>((s, l) => ((s[l.chain] = (s[l.chain] ?? 0) + 1), s), {});
  console.log(`OFAC SDN: zapisano ${labels.length} adresów (${Object.entries(by).map(([c, n]) => `${c} ${n}`).join(', ')}); pominięto: ${skippedText || 'brak'}`);
}

interface BsItem {
  type: string;
  address_hash?: string;
  is_smart_contract_address?: boolean;
  metadata?: { name?: string; tagType?: string; slug?: string } | null;
}

async function updatePl() {
  const labels = new Map<string, AddressLabel>();
  for (const q of PL_VASPS) {
    const r = await fetch(`${BLOCKSCOUT}/api/v2/search?q=${encodeURIComponent(q)}`, { headers: { 'user-agent': UA, accept: 'application/json' }, signal: AbortSignal.timeout(30_000) });
    if (!r.ok) {
      console.warn(`Blockscout „${q}”: HTTP ${r.status}`);
      continue;
    }
    const items = ((await r.json()) as { items?: BsItem[] }).items ?? [];
    let n = 0;
    for (const i of items) {
      const tagName = i.metadata?.name;
      if (i.type !== 'metadata_tag' || !i.address_hash || !tagName) continue;
      // tylko tagi z nazwą szukanego podmiotu; kontrakty (tokeny giełdy) i konta wdrażające to nie portfele giełdy
      if (!tagName.toLowerCase().includes(q.toLowerCase().split(' ')[0]) || i.is_smart_contract_address || /deployer|token/i.test(tagName)) continue;
      const v = validateAddress(i.address_hash);
      if (!v.valid || v.chain !== 'ETH') continue;
      const key = v.canonical!.toLowerCase();
      // nazwa (tagType=name) jest dokładniejsza niż sama przynależność do protokołu
      if (labels.has(key) && i.metadata?.tagType !== 'name') continue;
      labels.set(key, { chain: 'ETH', address: v.canonical!, entity: tagName, category: 'CEX', source: `Blockscout ${new URL(BLOCKSCOUT).host} – tag „${tagName}”`, note: 'polska giełda / kantor krypto' });
      n++;
    }
    console.log(`Blockscout „${q}”: ${n} tag(ów)`);
  }
  const ds: Dataset = {
    name: 'pl-vasp-blockscout',
    description: `Adresy polskich giełd i kantorów kryptowalut (${PL_VASPS.join(', ')}) według publicznych tagów eksploratora Blockscout (m.in. Open Labels Initiative). Wysyłka na taki adres to wskaźnik wyjścia do PLN.`,
    license: 'Publiczne tagi eksploratora Blockscout / Open Labels Initiative (CC0) – dane faktograficzne',
    updatedAt: new Date().toISOString(),
    sourceUrl: `${BLOCKSCOUT}/api/v2/search`,
    labels: [...labels.values()].sort((a, b) => a.entity.localeCompare(b.entity)),
  };
  writeFileSync(join(OUT, 'pl-vasp-blockscout.json'), JSON.stringify(ds, null, 2) + '\n');
  console.log(`Polskie giełdy: zapisano ${ds.labels.length} adresów`);
}

const only = process.argv[2];
if (import.meta.url === `file://${process.argv[1]}`) {
  if (!only || only === 'ofac') await updateOfac();
  if (!only || only === 'pl') await updatePl();
}
