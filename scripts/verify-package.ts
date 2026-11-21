/**
 * Weryfikacja pakietu dowodowego KryptoTrop (eksport JSON): skróty SHA-256 kopii dowodów, skrót pakietu, podpis Ed25519.
 *   npm run verify:package -- kryptotrop-run_xxx.json
 * Znacznik czasu RFC 3161 zapisywany jest obok jako <plik>.tsr – pełna weryfikacja certyfikatu TSA:
 *   openssl ts -reply -in <plik>.tsr -text
 *   openssl ts -verify -digest <packageSha256> -in <plik>.tsr -CAfile <certyfikaty TSA>
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { verifyPackage } from '@olcys/engine';

const file = process.argv[2];
if (!file) {
  console.error('Podaj plik pakietu: npm run verify:package -- kryptotrop-run_xxx.json');
  process.exit(2);
}
const pkg = JSON.parse(readFileSync(file, 'utf8'));
const { ok, checks } = verifyPackage(pkg);
for (const c of checks) console.log(`${c.ok ? '✔' : '✘'} ${c.name}: ${c.detail}`);
const tsr = pkg.integrity?.timestamp?.tokenBase64;
if (tsr) {
  writeFileSync(`${file}.tsr`, Buffer.from(tsr, 'base64'));
  console.log(`Znacznik czasu zapisany: ${file}.tsr (openssl ts -verify -digest ${pkg.integrity.packageSha256} -in ${file}.tsr -CAfile …)`);
}
console.log(ok ? 'Pakiet NIENARUSZONY' : 'Pakiet NARUSZONY lub niekompletny');
process.exit(ok ? 0 : 1);
