/**
 * Kody QR w obrazach – adresy portfeli publikowane jako grafika (np. „wesprzyj mnie: [QR]”) są niewidoczne dla
 * ekstrakcji z tekstu. Obrazy z dokumentów podmiotu (strona WWW, README, posty) są pobierane, dekodowane (PNG/JPEG,
 * czysty JavaScript: pngjs, jpeg-js, jsQR) i zapisywane jako osobny dowód: URL obrazu, SHA-256 kopii, odczytana treść.
 */
import { createHash } from 'node:crypto';
import jsQR from 'jsqr';
import jpeg from 'jpeg-js';
import { PNG } from 'pngjs';
import type { CollectedDocument } from './evidence';
import type { ConnectorContext } from './connectors/types';

/** Maks. liczba obrazów sprawdzanych w jednym dokumencie (koszt pobrania i dekodowania). */
export const MAX_QR_IMAGES = 6;
const MAX_PIXELS = 16_000_000;

/** Dekoduje kod QR z obrazu PNG lub JPEG; null = brak kodu lub nieobsługiwany format. */
export function decodeQr(bytes: Buffer): string | null {
  let img: { width: number; height: number; data: Uint8Array | Buffer } | undefined;
  try {
    if (bytes[0] === 0x89 && bytes[1] === 0x50) img = PNG.sync.read(bytes);
    else if (bytes[0] === 0xff && bytes[1] === 0xd8) img = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true, maxResolutionInMP: MAX_PIXELS / 1e6, maxMemoryUsageInMB: 256 });
  } catch {
    return null;
  }
  if (!img || img.width * img.height > MAX_PIXELS) return null;
  const data = new Uint8ClampedArray(img.data.buffer, img.data.byteOffset, img.data.byteLength);
  const code = jsQR(data, img.width, img.height, { inversionAttempts: 'attemptBoth' });
  return code?.data?.trim() || null;
}

const HINT = /qr|bitcoin|btc|eth|usdt|crypto|krypto|wallet|portfel|donat|wesprzyj|support|tip|address|adres/i;

/**
 * Obrazy warte sprawdzenia: najpierw te, których adres / opis sugeruje kod QR lub portfel, potem pozostałe
 * (bez ikon, awatarów i odznak). Adresy względne rozwiązywane względem strony.
 */
export function pickQrCandidates(images: { src: string; alt?: string }[], base: string, max = MAX_QR_IMAGES): string[] {
  const out: { url: string; hint: boolean }[] = [];
  for (const im of images) {
    let u: URL;
    try {
      u = new URL(im.src, base);
    } catch {
      continue;
    }
    if (!/^https?:$/.test(u.protocol) || /\.(svg|gif|ico|webp)(\?|$)/i.test(u.pathname)) continue;
    if (/(shields\.io|badge|avatar|gravatar|favicon|emoji|logo)/i.test(u.href) && !HINT.test(`${im.alt ?? ''}`)) continue;
    if (out.some((o) => o.url === u.href)) continue;
    out.push({ url: u.href, hint: HINT.test(`${u.pathname} ${im.alt ?? ''}`) });
  }
  // obrazy bez podpowiedzi (zdjęcia, ilustracje) – najwyżej 2, żeby nie wydłużać analizy
  const hinted = out.filter((o) => o.hint);
  const plain = out.filter((o) => !o.hint).slice(0, 2);
  return [...hinted, ...plain].slice(0, max).map((o) => o.url);
}

/** Obrazy z Markdown (`![alt](url)`) i HTML (`<img src>`) – np. README. */
export function imagesInMarkdown(md: string): { src: string; alt?: string }[] {
  const out: { src: string; alt?: string }[] = [];
  for (const m of md.matchAll(/!\[([^\]]*)\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)) out.push({ src: m[2], alt: m[1] });
  for (const m of md.matchAll(/<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)) out.push({ src: m[1], alt: m[0].match(/\balt=["']([^"']*)["']/i)?.[1] });
  return out;
}

/** Pobiera obrazy dokumentu i zwraca dowody z odczytanymi kodami QR (dziedziczą źródło i właściciela dokumentu). */
export async function collectQrEvidence(
  imageUrls: string[],
  parent: Pick<CollectedDocument, 'family' | 'sourceKind' | 'owner' | 'url' | 'title'> & { meta?: Record<string, unknown> },
  ctx: ConnectorContext,
): Promise<CollectedDocument[]> {
  const docs: CollectedDocument[] = [];
  for (const url of imageUrls) {
    try {
      const r = await ctx.fetch(url, { kind: 'page', binary: true, timeoutMs: 10_000 });
      if (r.status !== 200 || !r.body) continue;
      const bytes = Buffer.from(r.body, 'base64');
      const text = decodeQr(bytes);
      if (!text) continue;
      ctx.log(`Kod QR w obrazie ${url} (${parent.url}): ${text.slice(0, 120)}`);
      docs.push({
        family: parent.family,
        sourceKind: parent.sourceKind,
        url,
        title: `Kod QR na: ${parent.title}`,
        fetchedAt: r.fetchedAt,
        contentType: r.contentType,
        owner: parent.owner,
        segments: [{ id: 'qr', author: parent.owner, text: `Kod QR (obraz ${url}) opublikowany na ${parent.url}: ${text}`, anchor: parent.url }],
        links: [],
        // kod QR ma tego samego autora co dokument, w którym go opublikowano
        // kopia obrazu zapisana w base64 (SHA-256 dowodu liczony z tego zapisu); imageSha256 – skrót samych bajtów obrazu
        meta: { ...(parent.meta ?? {}), qrFrom: parent.url, qrText: text, encoding: 'base64', imageSha256: createHash('sha256').update(bytes).digest('hex') },
        raw: r.body,
      });
    } catch (e) {
      ctx.log(`Obraz ${url}: nie pobrano (${(e as Error).message})`);
    }
  }
  return docs;
}
