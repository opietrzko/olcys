// Renderuje gotowe filmy do ../. Użycie: node render.mjs [Teaser ScenariuszA ScenariuszB]
import { execFileSync } from 'node:child_process';

const OUT = { Teaser: 'kryptotrop-teaser.mp4', ScenariuszA: 'kryptotrop-scenariusz-a.mp4', ScenariuszB: 'kryptotrop-scenariusz-b.mp4' };
const ids = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(OUT);
for (const id of ids) {
  console.log(`> ${id}`);
  execFileSync('npx', ['remotion', 'render', 'src/index.ts', id, `out/${OUT[id]}`, '--codec=h264', '--crf=18', '--x264-preset=slow', '--concurrency=50%'], { stdio: 'inherit', shell: true });
}
