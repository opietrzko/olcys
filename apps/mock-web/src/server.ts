/**
 * OŁCyŚ mock-web – syntetyczny „mini-internet” do powtarzalnych scenariuszy testowych.
 * Emuluje kształt publicznych API/stron (GitHub API, Gravatar v3, t.me/s, Wayback CDX),
 * dzięki czemu te same konektory działają na danych testowych i (po włączeniu) na realnych źródłach.
 * Wszystkie dane są FIKCYJNE.
 */
import { createServer, type IncomingMessage, type ServerResponse, type Server } from 'node:http';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { PERSONA, STATE } from './persona';
import { ARCHIVE, LISTINGS, tgChannels, THREADS, githubFunding, githubProfileHtml, githubReadme, githubUser, gravatarProfile, websiteHtml } from './sites';

const PORT = Number(process.env.PORT ?? 4100);
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function send(res: ServerResponse, status: number, body: string, type = 'text/html; charset=utf-8') {
  res.writeHead(status, { 'content-type': type, 'x-olcys-synthetic': 'true' });
  res.end(body);
}
const json = (res: ServerResponse, body: unknown, status = 200) => send(res, status, JSON.stringify(body, null, 2), 'application/json; charset=utf-8');
const page = (title: string, body: string) =>
  `<!doctype html><html lang="pl"><head><meta charset="utf-8"><title>${esc(title)}</title></head><body><p style="background:#fde68a;padding:4px">⚠️ Serwis syntetyczny OŁCyŚ – dane fikcyjne</p>${body}</body></html>`;

/** Dopasowanie po cyfrach numeru telefonu (wyszukiwanie „600123456” znajduje „600-123-456”). */
const phoneHit = (q: string, text: string) => {
  const d = q.replace(/\D/g, '');
  return d.length >= 9 && text.replace(/\D/g, '').includes(d.slice(-9));
};

const emailHash = (email: string) => createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
const PERSONA_EMAIL_HASH = emailHash(PERSONA.email);

function renderThread(t: (typeof THREADS)[number]) {
  return page(
    t.title,
    `<h1 class="thread-title" data-thread="${t.id}">${esc(t.title)}</h1><p class="board">${esc(t.board)}</p>` +
      t.posts
        .map((p) => `<article class="post" id="p-${p.id}" data-author="${esc(p.author)}" data-display="${esc(p.display)}" data-date="${p.date}"><div class="meta">${esc(p.display)} (@${esc(p.author)}) · ${p.date}</div><div class="body">${esc(p.text)}</div></article>`)
        .join('\n'),
  );
}

function handler(req: IncomingMessage, res: ServerResponse) {
  const base = `http://${req.headers.host ?? `localhost:${PORT}`}`;
  const url = new URL(req.url ?? '/', base);
  const p = url.pathname.replace(/\/+$/, '') || '/';
  let m: RegExpMatchArray | null;

  if (p === '/') {
    return send(res, 200, page('OŁCyŚ mock-web', `<h1>Mini-internet scenariusza testowego</h1><ul>
<li><a href="/github/${PERSONA.nick}">DevHub (emulacja GitHub)</a> – API: <code>/github/api/users/:login</code></li>
<li><a href="/${PERSONA.website}">Strona WWW</a></li>
<li><a href="/forum/search?q=${PERSONA.nick}">Forum</a></li>
<li><a href="/p2p/search?q=${PERSONA.nick}">Giełda ogłoszeń P2P</a></li>
<li><a href="/tg/s/${PERSONA.telegram}">Publiczny kanał komunikatora</a></li>
<li><a href="/archive/cdx/search/cdx?url=/${PERSONA.website}&output=json">Archiwum (emulacja Wayback CDX)</a></li>
<li>Gravatar v3: <code>/gravatar/v3/profiles/:sha256(email)</code></li></ul>`));
  }

  // --- Sterowanie scenariuszem (demo analiz cyklicznych): /__scenario?v=2
  if (p === '/__scenario') {
    const v = Number(url.searchParams.get('v'));
    if (v === 1 || v === 2) STATE.version = v;
    return json(res, { version: STATE.version });
  }

  // --- GitHub API emulation
  if ((m = p.match(/^\/github\/api\/users\/([^/]+)$/))) {
    return m[1].toLowerCase() === PERSONA.nick ? json(res, githubUser(base)) : json(res, { message: 'Not Found' }, 404);
  }
  if ((m = p.match(/^\/github\/raw\/([^/]+)\/([^/]+)\/HEAD\/(.+)$/))) {
    const [, owner, repo, file] = m;
    if (owner === PERSONA.nick && repo === PERSONA.nick && file === 'README.md') return send(res, 200, githubReadme(), 'text/plain; charset=utf-8');
    if (owner === PERSONA.nick && repo === '.github' && file === 'FUNDING.yml') return send(res, 200, githubFunding(), 'text/plain; charset=utf-8');
    return send(res, 404, '404: Not Found', 'text/plain');
  }
  if ((m = p.match(/^\/github\/([^/]+)$/))) {
    return m[1] === PERSONA.nick ? send(res, 200, githubProfileHtml(base, 'current')) : send(res, 404, 'Not found');
  }

  // --- Gravatar v3 emulation
  if ((m = p.match(/^\/gravatar\/v3\/profiles\/([0-9a-f]{64})$/))) {
    return m[1] === PERSONA_EMAIL_HASH ? json(res, { ...gravatarProfile(base), hash: m[1] }) : json(res, { error: 'Profile not found' }, 404);
  }

  if (p === `/gravatar/${PERSONA.nick}`) return send(res, 200, page(PERSONA.name, `<h1>${PERSONA.name}</h1><pre>${esc(JSON.stringify(gravatarProfile(base), null, 2))}</pre>`));

  // --- Strona osobista
  if (p === `/${PERSONA.website}`) return send(res, 200, websiteHtml(base, 'current'));

  // --- Forum
  if (p === '/forum/search') {
    const q = (url.searchParams.get('q') ?? '').toLowerCase().trim();
    const hits = q
      ? THREADS.flatMap((t) => t.posts.filter((po) => po.author.toLowerCase() === q || po.display.toLowerCase() === q || po.text.toLowerCase().includes(q) || phoneHit(q, po.text)).map((po) => ({ t, po })))
      : [];
    return send(
      res,
      200,
      page(
        `Szukaj: ${q}`,
        `<h1>Wyniki: ${esc(q)}</h1>` +
          hits.map(({ t, po }) => `<div class="result" data-thread="${t.id}" data-author="${esc(po.author)}"><a class="thread-link" href="/forum/t/${t.id}#p-${po.id}">${esc(t.title)}</a> — ${esc(po.display)}</div>`).join('\n'),
      ),
    );
  }
  if ((m = p.match(/^\/forum\/t\/(\d+)$/))) {
    const t = THREADS.find((x) => x.id === m![1]);
    return t ? send(res, 200, renderThread(t)) : send(res, 404, 'Not found');
  }

  // --- Ogłoszenia P2P
  if (p === '/p2p/search') {
    const q = (url.searchParams.get('q') ?? '').toLowerCase().trim();
    const hits = q ? LISTINGS.filter((l) => l.seller.toLowerCase() === q || l.telegram?.toLowerCase() === q || l.desc.toLowerCase().includes(q) || phoneHit(q, l.phone ?? '')) : [];
    return send(
      res,
      200,
      page(
        `P2P: ${q}`,
        hits
          .map((l) => `<div class="listing" id="l-${l.id}" data-seller="${esc(l.seller)}" data-date="${l.date}"${l.telegram ? ` data-telegram="${esc(l.telegram)}"` : ''}><h2>${esc(l.title)}</h2><p class="desc">${esc(l.desc)}</p>${l.telegram ? `<p>Kontakt: Telegram @${esc(l.telegram)}</p>` : ''}${l.phone ? `<p class="contact">Tel. ${esc(l.phone)}</p>` : ''}</div>`)
          .join('\n'),
      ),
    );
  }

  if ((m = p.match(/^\/p2p\/oferta\/(\d+)$/))) {
    const l = LISTINGS.find((x) => x.id === m![1]);
    return l ? send(res, 200, page(l.title, `<div class="listing" data-seller="${esc(l.seller)}"><h2>${esc(l.title)}</h2><p class="desc">${esc(l.desc)}</p><p>Sprzedający: @${esc(l.seller)} · ${l.date}</p></div>`)) : send(res, 404, 'Not found');
  }

  // --- Publiczny podgląd kanału (kształt jak t.me/s/<kanał>)
  if ((m = p.match(/^\/tg\/s\/([^/]+)$/))) {
    const ch = tgChannels()[m[1]];
    if (!ch) return send(res, 404, 'Not found');
    return send(
      res,
      200,
      page(
        ch.title,
        `<div class="tgme_channel_info_header_title"><span>${esc(ch.title)}</span></div><div class="tgme_channel_info_header_username">@${esc(m[1])}</div>` +
          ch.messages
            .map((msg) => `<div class="tgme_widget_message_wrap"><div class="tgme_widget_message" data-post="${esc(m![1])}/${msg.id}"><div class="tgme_widget_message_text">${esc(msg.text)}</div><span class="tgme_widget_message_date"><time datetime="${msg.date}">${msg.date}</time></span></div></div>`)
            .join('\n'),
      ),
    );
  }

  // --- Archiwum: CDX + snapshoty (kształt jak web.archive.org)
  if (p === '/archive/cdx/search/cdx') {
    const target = url.searchParams.get('url') ?? '';
    let path = target;
    try {
      path = new URL(target, base).pathname;
    } catch {
      /* ścieżka względna */
    }
    const versions = ARCHIVE[path.replace(/\/+$/, '')] ?? [];
    const rows = versions.map((v) => [path, v.ts, target, 'text/html', '200', createHash('sha1').update(v.render(base)).digest('hex'), String(v.render(base).length)]);
    return json(res, rows.length ? [['urlkey', 'timestamp', 'original', 'mimetype', 'statuscode', 'digest', 'length'], ...rows] : []);
  }
  if ((m = p.match(/^\/archive\/web\/(\d{14})(?:id_)?\/(.+)$/))) {
    const [, ts, original] = m;
    let path = original;
    try {
      path = new URL(original.replace(/^(https?):\/(?!\/)/, '$1://')).pathname;
    } catch {
      path = '/' + original.replace(/^\/+/, '');
    }
    const v = (ARCHIVE[path.replace(/\/+$/, '')] ?? []).find((x) => x.ts === ts);
    return v ? send(res, 200, v.render(base)) : send(res, 404, 'Not archived');
  }

  return send(res, 404, page('404', '<h1>404</h1>'));
}

export function createMockWebServer(): Server {
  return createServer(handler);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  createMockWebServer().listen(PORT, () => console.log(`[mock-web] syntetyczny mini-internet: http://localhost:${PORT}`));
}
