/**
 * Uruchomienie analizy z linii poleceń (bez API/bazy) – szybki test scenariusza.
 * npm run demo:cli -- nick=krypto_janek email=jan.testowy@example.com [--html raport.html] [--json wynik.json]
 */
import { writeFileSync } from 'node:fs';
import { createEngine, renderReportHtml } from '@olcys/engine';
import type { Identifier, IdentifierType } from '@olcys/core';

const args = process.argv.slice(2);
const ids: Identifier[] = args.filter((a) => a.includes('=') && !a.startsWith('--')).map((a) => {
  const [type, ...rest] = a.split('=');
  return { type: type as IdentifierType, value: rest.join('=') };
});
if (!ids.length) ids.push({ type: 'nick', value: 'krypto_janek' });
const flag = (n: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };

const engine = createEngine();
const { result } = await engine.run({ identifiers: ids });
for (const f of result.findings) {
  console.log(`${String(f.attribution.score).padStart(3)}%  ${f.attribution.band.padEnd(15)} ${f.chain.padEnd(4)} ${f.address}  ${f.classification.category}${f.classification.entity ? ' – ' + f.classification.entity : ''}`);
  console.log(`      ${f.attribution.rules.map((r) => `${r.ruleId}(${r.delta >= 0 ? '+' : ''}${r.delta})`).join(' ')}`);
  for (const i of f.activity?.indicators ?? []) console.log(`      ⚑ ${i.type}: ${i.title}`);
}
console.log(`\nTożsamości: ${result.identities.map((i) => `${i.type}=${i.value}[${i.strength}]`).join(', ')}`);
console.log(`Dowody: ${result.evidence.length}, zmiany profili: ${result.profileChanges.length}, egress: ${result.egress.length} (zablokowane: ${result.egress.filter((e) => e.status === 'DENIED').length})`);
for (const c of result.connectorsUsed) if (c.errors.length) console.log(`  ! ${c.id}: ${c.errors.join(' | ')}`);
const html = flag('--html'); if (html) writeFileSync(html, renderReportHtml(result, { runId: 'cli', analysisName: ids.map((i) => i.value).join(', ') }));
const json = flag('--json'); if (json) writeFileSync(json, JSON.stringify(result, null, 2));
