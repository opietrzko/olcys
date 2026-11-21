/**
 * Ekstrakcja adresów kryptowalutowych z dowolnego tekstu.
 * 1) normalizacja (znaki niewidoczne), 2) dopasowanie kandydatów regexami,
 * 3) walidacja sumy kontrolnej, 4) próba odtworzenia adresów celowo zaciemnionych ("0x12 34 ...").
 */
import { validateAddress, validateSolana, type ValidationResult } from './chains';
import type { ExtractedAddress } from './types';

const ZERO_WIDTH = /[​-‍⁠﻿]/g;
const CONTEXT_RADIUS = 140;

const PATTERNS: { name: string; re: RegExp }[] = [
  { name: 'evm', re: /(?<![0-9A-Za-z])0x[0-9a-fA-F]{40}(?![0-9A-Za-z])/g },
  { name: 'segwit', re: /(?<![0-9A-Za-z])(?:bc1|BC1|ltc1|LTC1)[02-9ac-hj-np-zAC-HJ-NP-Z]{8,87}(?![0-9A-Za-z])/g },
  { name: 'base58', re: /(?<![0-9A-Za-z])[13LMT][1-9A-HJ-NP-Za-km-z]{25,34}(?![0-9A-Za-z])/g },
];

const SOL_PATTERN = /(?<![0-9A-Za-z])[1-9A-HJ-NP-Za-km-z]{32,44}(?![0-9A-Za-z])/g;
const SOL_KEYWORDS = /\b(sol|solana|phantom|solflare)\b/i;

/** Kandydaci na adresy zapisane z separatorami: "0x12ab 34cd …", "bc1q-xxxx-yyyy". */
const OBFUSCATED = /(?<![0-9A-Za-z])(?:0x|bc1|ltc1|T)[0-9A-Za-z]{2,}(?:[ \-_.·|][0-9A-Za-z]{2,}){1,15}/g;

function contextAround(text: string, start: number, end: number): string {
  const s = Math.max(0, start - CONTEXT_RADIUS);
  const e = Math.min(text.length, end + CONTEXT_RADIUS);
  return (s > 0 ? '…' : '') + text.slice(s, e).replace(/\s+/g, ' ').trim() + (e < text.length ? '…' : '');
}

function toExtracted(text: string, raw: string, start: number, end: number, v: ValidationResult, deobfuscated: boolean): ExtractedAddress {
  return {
    chain: v.chain!,
    address: v.canonical!,
    raw,
    start,
    end,
    context: contextAround(text, start, end),
    validation: v.validation!,
    deobfuscated,
    notes: [...v.notes, ...(deobfuscated ? ['Adres zapisany z separatorami (celowe zaciemnienie) – odtworzony automatycznie'] : []), ...(v.kind ? [`Typ: ${v.kind}`] : [])],
  };
}

export function normalizeText(text: string): string {
  return text.replace(ZERO_WIDTH, '');
}

export function extractAddresses(input: string): ExtractedAddress[] {
  const text = normalizeText(input);
  const found: ExtractedAddress[] = [];
  const taken: [number, number][] = [];
  const overlaps = (s: number, e: number) => taken.some(([a, b]) => s < b && e > a);

  for (const { re } of PATTERNS) {
    for (const m of text.matchAll(re)) {
      const start = m.index!;
      const end = start + m[0].length;
      if (overlaps(start, end)) continue;
      const v = validateAddress(m[0]);
      if (!v.valid) continue;
      found.push(toExtracted(text, m[0], start, end, v, false));
      taken.push([start, end]);
    }
  }

  // Zaciemnione zapisy – próbujemy najdłuższego prefiksu grup, który daje poprawny adres.
  for (const m of text.matchAll(OBFUSCATED)) {
    const start = m.index!;
    if (overlaps(start, start + m[0].length)) continue;
    const parts = m[0].split(/[ \-_.·|]/);
    for (let n = parts.length; n >= 2; n--) {
      const joined = parts.slice(0, n).join('');
      const v = validateAddress(joined);
      if (v.valid) {
        const rawLen = parts.slice(0, n).join(' ').length; // przybliżenie długości w tekście
        const end = start + Math.min(m[0].length, rawLen);
        found.push(toExtracted(text, text.slice(start, end), start, end, v, true));
        taken.push([start, end]);
        break;
      }
    }
  }

  // Solana – tylko gdy kontekst zawiera słowo kluczowe (brak sumy kontrolnej => wysokie ryzyko szumu).
  for (const m of text.matchAll(SOL_PATTERN)) {
    const start = m.index!;
    const end = start + m[0].length;
    if (overlaps(start, end)) continue;
    const ctx = text.slice(Math.max(0, start - 60), Math.min(text.length, end + 60));
    if (!SOL_KEYWORDS.test(ctx)) continue;
    const v = validateSolana(m[0]);
    if (!v.valid) continue;
    found.push(toExtracted(text, m[0], start, end, v, false));
    taken.push([start, end]);
  }

  return found.sort((a, b) => a.start - b.start);
}
