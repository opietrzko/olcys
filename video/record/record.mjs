// Usage: node record/record.mjs <scene...>   scenes: landing, scenA, scenB, stills
import { APP, session } from './lib.mjs';

async function waitDone(page) {
  // widok przebiegu jest gotowy, gdy pojawią się zakładki wyników
  await page.getByRole('tab', { name: /Adresy/ }).waitFor({ timeout: 240_000 });
  await page.waitForTimeout(1500);
}

async function newAnalysis(s, { name, type, value }) {
  const { page } = s;
  const nameInput = page.getByPlaceholder('np. Czynności sprawdzające 2026/123');
  await s.scrollToEl(page.getByRole('heading', { name: 'Nowa analiza' }), 40, 1600);
  await s.wait(500);
  s.mark('form');
  await s.click(nameInput, { dx: 0.25 });
  await s.type(name, 45);
  await s.wait(300);
  const sel = page.getByLabel('Rodzaj identyfikatora 1');
  await s.hover(sel, 600);
  await s.wait(250);
  await sel.selectOption(type);
  await s.wait(500);
  await s.click(page.getByLabel('Wartość identyfikatora 1'), { dx: 0.2 });
  await s.type(value, 60);
  await s.wait(600);
  s.mark('submit');
  await s.click(page.getByRole('button', { name: 'Uruchom analizę' }), { ms: 900, pause: 400 });
  s.mark('running');
}

const scenes = {
  async landing() {
    const s = await session('landing');
    const { page } = s;
    await page.goto(APP);
    await s.wait(1200);
    await s.theme('light');
    await s.hideCursor();
    await s.scrollTo(0, 10);
    await s.wait(800);
    await s.start();
    s.mark('hero');
    await s.wait(3500);
    const h = await page.evaluate(() => document.documentElement.scrollHeight);
    s.mark('scroll');
    for (let y = 700; y < h; y += 700) {
      await s.scrollTo(y, 1500);
      await s.wait(1300);
    }
    s.mark('bottom');
    await s.wait(800);
    await s.scrollTo(0, 2000);
    await s.wait(600);
    s.mark('toDark');
    await s.theme('dark');
    s.mark('dark');
    await s.wait(2500);
    await s.scrollTo(700, 1500);
    await s.wait(1500);
    await s.scrollTo(0, 1500);
    s.mark('toLight');
    await s.theme('light');
    s.mark('light');
    await s.wait(1800);
    s.mark('cta');
    await s.click(page.getByRole('link', { name: /Rozpocznij analizę/ }).first(), { ms: 1000, pause: 400 });
    await s.wait(2500);
    s.mark('panel');
    await s.wait(2000);
    await s.stop();
  },

  async scenA() {
    const reuse = process.env.REUSE_A; // nagrywamy tylko część z wynikami istniejącego przebiegu
    const s = await session(reuse ? 'scenA_res' : 'scenA');
    const { page } = s;
    await page.goto(APP + (reuse ? `#/a/${reuse}` : '#/analizy'));
    await s.wait(1200);
    await s.theme('light');
    await s.hideCursor();
    await s.scrollTo(0, 10);
    await s.wait(500);
    await s.start();
    s.mark('dashboard');
    await s.wait(2000);
    if (!reuse) {
      await newAnalysis(s, { name: 'Czynności sprawdzające 2026/117', type: 'email', value: 'ksawery.kordas.dev@proton.me' });
      await waitDone(page);
    } else await waitDone(page);
    if (process.env.STRICT_CHAIN && (await page.getByText('przekroczony limit').count())) {
      await page.context().browser().close();
      throw new Error('NO_CHAIN');
    }
    s.mark('done');
    await s.scrollTo(0, 800);
    await s.wait(3500);
    s.mark('graph');
    await s.scrollToEl(page.getByRole('tablist'), 20, 1500);
    await s.wait(600);
    await s.click(page.getByRole('button', { name: 'Dopasuj do widoku' }), { ms: 800 });
    await s.wait(500);
    await s.click(page.getByRole('button', { name: 'Oddal' }), { ms: 500 });
    await s.wait(300);
    await s.click(page.getByRole('button', { name: 'Oddal' }), { ms: 200 });
    await s.wait(2000);
    // węzeł Telegram znaleziony przez pivot ze strony WWW
    const picker = page.locator('select').filter({ has: page.locator('option', { hasText: 'Wybierz węzeł' }) }).first();
    await s.hover(picker, 800);
    await s.wait(300);
    const tgValue = await picker.locator('option', { hasText: /Telegram/ }).first().getAttribute('value');
    await picker.selectOption(tgValue);
    s.mark('telegram');
    await s.moveTo(1250, 500, 900);
    await s.wait(5000);
    s.mark('addresses');
    await s.click(page.getByRole('tab', { name: /Adresy/ }));
    await s.wait(2500);
    s.mark('explain');
    const rows = page.locator('.addr-list button');
    await s.wait(2500);
    await s.click(rows.nth(1));
    s.mark('btc');
    await s.wait(3000);
    await s.click(rows.nth(0));
    s.mark('eth');
    await s.wait(3500);
    await s.scrollToEl(page.getByText('Wystąpienia przypisane').first(), 260, 2200);
    s.mark('evidence');
    await s.wait(4000);
    s.mark('toDark');
    await s.theme('dark');
    s.mark('dark');
    await s.wait(2500);
    await s.scrollToEl(page.getByRole('tablist'), 20, 1500);
    s.mark('graphDark');
    await s.click(page.getByRole('tab', { name: /Graf powiązań/ }));
    await s.wait(500);
    await page.getByRole('button', { name: 'Dopasuj do widoku' }).click();
    for (let i = 0; i < 2; i++) await page.getByRole('button', { name: 'Oddal' }).click();
    await s.wait(4000);
    s.mark('sources');
    await s.click(page.getByRole('tab', { name: /Źródła/ }));
    await s.wait(2500);
    await s.scrollTo(await page.evaluate(() => scrollY + 500), 1800);
    await s.wait(2500);
    await s.stop();
  },

  async scenB() {
    const reuse = process.env.REUSE_B; // nagrywamy tylko część z wynikami istniejącego przebiegu
    const s = await session(reuse ? 'scenB_res' : 'scenB');
    const { page } = s;
    await page.goto(APP + (reuse ? `#/a/${reuse}` : '#/analizy'));
    await s.wait(1200);
    await s.theme('dark');
    await s.hideCursor();
    await s.scrollTo(0, 10);
    await s.wait(500);
    await s.start();
    s.mark('dashboard');
    await s.wait(1800);
    if (!reuse) await newAnalysis(s, { name: 'Czynności sprawdzające 2026/118', type: 'nick', value: 'blazejrzepdev' });
    await waitDone(page);
    const chainOk = await page.evaluate(async () => {
      const id = location.hash.split('/')[2];
      const a = await (await fetch('/api/analyses/' + id)).json();
      const r = await (await fetch('/api/runs/' + a.runs[0].id)).json();
      return r.result.findings.some((f) => f.activity);
    });
    if (!chainOk) {
      await page.context().browser().close();
      throw new Error('NO_CHAIN');
    }
    s.mark('done');
    await s.scrollTo(0, 800);
    await s.wait(3000);
    s.mark('addresses');
    await s.click(page.getByRole('tab', { name: /Adresy/ }));
    await s.scrollToEl(page.getByRole('tablist'), 20, 1400);
    await s.wait(2000);
    const rows = page.locator('.addr-list button');
    await s.click(rows.nth(3));
    s.mark('trap');
    await s.wait(3500);
    await s.click(rows.nth(2));
    s.mark('usdt');
    await s.wait(3500);
    s.mark('explain');
    await s.click(rows.nth(0));
    await s.wait(4500);
    s.mark('activity');
    await s.scrollToEl(page.getByText('Aktywność w blockchainie').first(), 120, 2000);
    await s.wait(4000);
    await s.scrollTo(await page.evaluate(() => scrollY + 600), 2000);
    await s.wait(3000);
    s.mark('toLight');
    await s.theme('light');
    s.mark('light');
    await s.wait(2500);
    s.mark('statements');
    await s.scrollToEl(page.getByRole('tablist'), 20, 1500);
    await s.click(page.getByRole('tab', { name: /Fakty, obliczenia/ }));
    await s.wait(2500);
    await s.scrollTo(await page.evaluate(() => scrollY + 450), 1800);
    await s.wait(3000);
    s.mark('export');
    await s.scrollToEl(page.getByRole('tablist'), 20, 1400);
    await s.hover(page.getByRole('link', { name: /Raport PDF/ }), 900);
    await s.wait(1600);
    await s.hover(page.getByRole('link', { name: /Pakiet dowodowy/ }), 700);
    await s.wait(2200);
    await s.stop();
  },

  /** te same widoki w jasnym i ciemnym motywie do okrągłego przejścia motywu */
  async stills() {
    const s = await session('stills');
    const { page } = s;
    const list = await (await fetch('http://localhost:4000/api/analyses')).json();
    const byName = (n) => list.find((a) => a.name === n)?.id;
    const shots = [
      ['landing', '', async () => s.scrollTo(0, 10)],
      ['graphA', `#/a/${process.env.REUSE_A ?? byName('Czynności sprawdzające 2026/117')}`, async () => {
        await s.scrollToEl(page.getByRole('tablist'), 20, 10);
        await s.wait(400);
        await page.getByRole('button', { name: 'Dopasuj do widoku' }).click();
        for (let i = 0; i < 2; i++) await page.getByRole('button', { name: 'Oddal' }).click();
      }],
      ['addrB', `#/a/${process.env.REUSE_B ?? byName('Czynności sprawdzające 2026/118')}`, async () => {
        await page.getByRole('tab', { name: /Adresy/ }).click();
        await s.scrollToEl(page.getByRole('tablist'), 20, 10);
      }],
    ];
    const toggles = {};
    for (const [key, hash, prep] of shots) {
      await page.goto(APP + hash);
      await s.wait(1500);
      for (const th of ['light', 'dark']) {
        await page.getByRole('button', { name: th === 'light' ? 'Motyw jasny' : 'Motyw ciemny' }).first().click();
        await s.hideCursor();
        await prep();
        await s.wait(2500);
        await s.still(`${key}-${th}.png`);
      }
      const b = await page.getByRole('button', { name: 'Motyw ciemny' }).first().boundingBox();
      toggles[key] = [Math.round((b.x + b.width / 2) * 4 / 3), Math.round((b.y + b.height / 2) * 4 / 3)];
    }
    console.log('toggle centres (1920 px):', JSON.stringify(toggles));
    await page.context().browser().close();
  },
};

let first = true;
for (const name of process.argv.slice(2)) {
  if (!first && name !== 'stills' && !process.env.REUSE_A && !process.env.REUSE_B) await new Promise((r) => setTimeout(r, 120_000)); // let Blockscout rate limit cool down
  first = false;
  for (let attempt = 1; ; attempt++) {
    console.log(`> ${name} (attempt ${attempt})`);
    try {
      await scenes[name]();
      break;
    } catch (e) {
      if (e.message !== 'NO_CHAIN' || attempt >= 4) throw e;
      console.log('  blockchain data missing (rate limit) - retrying in 90 s');
      await new Promise((r) => setTimeout(r, 90_000));
    }
  }
}
