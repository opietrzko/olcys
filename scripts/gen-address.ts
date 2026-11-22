/**
 * Generator poprawnych formalnie adresów bez kluczy prywatnych (do testów ekstrakcji i walidacji).
 * UWAGA: na kontach testowych publikujcie adresy z prawdziwych portfeli testowych - te adresy nie mają historii ani właściciela.
 * Użycie: npm run gen:address -- <seed> [eth|btc|btc-legacy|tron|ltc]
 */
import { synthetic } from '@olcys/core';

const [seed = 'test', kind = 'all'] = process.argv.slice(2);
const gens = { eth: synthetic.eth, btc: synthetic.btcBech32, 'btc-legacy': synthetic.btcLegacy, tron: synthetic.tron, ltc: synthetic.ltc };
for (const [k, g] of Object.entries(gens)) if (kind === 'all' || kind === k) console.log(`${k.padEnd(11)} ${g(seed)}`);
