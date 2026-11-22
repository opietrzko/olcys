/**
 * Walidacja i kodowanie adresów kryptowalutowych (bez zależności sieciowych).
 * BTC/LTC: Base58Check + Bech32/Bech32m (BIP-173/350), ETH: EIP-55, TRON: Base58Check (prefiks 0x41).
 */
import { base58, bech32, bech32m } from '@scure/base';
import { sha256 } from '@noble/hashes/sha2';
import { keccak_256 } from '@noble/hashes/sha3';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils';
import type { Chain } from './types';

export interface ValidationResult {
  valid: boolean;
  chain?: Chain;
  canonical?: string;
  validation?: 'checksum' | 'format';
  kind?: string;
  notes: string[];
}

const invalid = (note?: string): ValidationResult => ({ valid: false, notes: note ? [note] : [] });

/* ---------- Base58Check ---------- */

function doubleSha(data: Uint8Array): Uint8Array {
  return sha256(sha256(data));
}

export function base58checkDecode(str: string): Uint8Array | null {
  let bytes: Uint8Array;
  try {
    bytes = base58.decode(str);
  } catch {
    return null;
  }
  if (bytes.length < 5) return null;
  const payload = bytes.slice(0, -4);
  const checksum = bytes.slice(-4);
  const expected = doubleSha(payload).slice(0, 4);
  for (let i = 0; i < 4; i++) if (checksum[i] !== expected[i]) return null;
  return payload;
}

export function base58checkEncode(payload: Uint8Array): string {
  const checksum = doubleSha(payload).slice(0, 4);
  const full = new Uint8Array(payload.length + 4);
  full.set(payload);
  full.set(checksum, payload.length);
  return base58.encode(full);
}

/* ---------- Segwit (Bech32 / Bech32m) ---------- */

function decodeSegwit(addr: string, hrp: string): { version: number; program: Uint8Array } | null {
  const lower = addr.toLowerCase();
  if (addr !== lower && addr !== addr.toUpperCase()) return null; // mieszana wielkość liter jest niedozwolona
  if (!lower.startsWith(hrp + '1')) return null;
  for (const codec of [bech32, bech32m]) {
    try {
      const { prefix, words } = codec.decode(lower as `${string}1${string}`, 90);
      if (prefix !== hrp || words.length < 1) continue;
      const version = words[0];
      if (version > 16) return null;
      // v0 => bech32, v1+ => bech32m (BIP-350)
      if (version === 0 && codec !== bech32) continue;
      if (version !== 0 && codec !== bech32m) continue;
      const program = Uint8Array.from(codec.fromWords(words.slice(1)));
      if (program.length < 2 || program.length > 40) return null;
      if (version === 0 && program.length !== 20 && program.length !== 32) return null;
      return { version, program };
    } catch {
      /* spróbuj kolejnego kodeka */
    }
  }
  return null;
}

export function encodeSegwit(hrp: string, version: number, program: Uint8Array): string {
  const codec = version === 0 ? bech32 : bech32m;
  return codec.encode(hrp, [version, ...codec.toWords(program)]);
}

/* ---------- EIP-55 ---------- */

export function toChecksumAddress(hex: string): string {
  const lower = hex.toLowerCase().replace(/^0x/, '');
  const hash = bytesToHex(keccak_256(utf8ToBytes(lower)));
  let out = '0x';
  for (let i = 0; i < lower.length; i++) {
    out += parseInt(hash[i], 16) >= 8 ? lower[i].toUpperCase() : lower[i];
  }
  return out;
}

export function keccakHex(data: Uint8Array): string {
  return bytesToHex(keccak_256(data));
}

/* ---------- Walidatory per sieć ---------- */

export function validateEvm(addr: string): ValidationResult {
  if (!/^0x[0-9a-fA-F]{40}$/.test(addr)) return invalid();
  const body = addr.slice(2);
  const checksummed = toChecksumAddress(addr);
  if (body === body.toLowerCase() || body === body.toUpperCase()) {
    return {
      valid: true,
      chain: 'ETH',
      canonical: checksummed,
      validation: 'format',
      kind: 'EVM',
      notes: ['Adres zapisany jednolitą wielkością liter – suma kontrolna EIP-55 nieweryfikowalna'],
    };
  }
  if (checksummed !== addr) return invalid('Błędna suma kontrolna EIP-55');
  return { valid: true, chain: 'ETH', canonical: checksummed, validation: 'checksum', kind: 'EVM', notes: [] };
}

export function validateBitcoin(addr: string): ValidationResult {
  if (/^bc1/i.test(addr)) {
    const sw = decodeSegwit(addr, 'bc');
    if (!sw) return invalid();
    const kind = sw.version === 0 ? (sw.program.length === 20 ? 'P2WPKH' : 'P2WSH') : sw.version === 1 ? 'P2TR' : `SegWit v${sw.version}`;
    return { valid: true, chain: 'BTC', canonical: addr.toLowerCase(), validation: 'checksum', kind, notes: [] };
  }
  if (/^[13]/.test(addr)) {
    const payload = base58checkDecode(addr);
    if (!payload || payload.length !== 21) return invalid();
    if (payload[0] === 0x00) return { valid: true, chain: 'BTC', canonical: addr, validation: 'checksum', kind: 'P2PKH', notes: [] };
    if (payload[0] === 0x05) return { valid: true, chain: 'BTC', canonical: addr, validation: 'checksum', kind: 'P2SH', notes: [] };
  }
  return invalid();
}

export function validateLitecoin(addr: string): ValidationResult {
  if (/^ltc1/i.test(addr)) {
    const sw = decodeSegwit(addr, 'ltc');
    if (!sw) return invalid();
    return { valid: true, chain: 'LTC', canonical: addr.toLowerCase(), validation: 'checksum', kind: 'SegWit', notes: [] };
  }
  if (/^[LM]/.test(addr)) {
    const payload = base58checkDecode(addr);
    if (!payload || payload.length !== 21) return invalid();
    if (payload[0] === 0x30 || payload[0] === 0x32) {
      return { valid: true, chain: 'LTC', canonical: addr, validation: 'checksum', kind: payload[0] === 0x30 ? 'P2PKH' : 'P2SH', notes: [] };
    }
  }
  return invalid();
}

export function validateTron(addr: string): ValidationResult {
  if (!/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(addr)) return invalid();
  const payload = base58checkDecode(addr);
  if (!payload || payload.length !== 21 || payload[0] !== 0x41) return invalid();
  return { valid: true, chain: 'TRON', canonical: addr, validation: 'checksum', kind: 'TRON', notes: [] };
}

/** Solana nie ma sumy kontrolnej - walidacja formatu (32 bajty base58). Wymaga potwierdzenia kontekstem. */
export function validateSolana(addr: string): ValidationResult {
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr)) return invalid();
  try {
    if (base58.decode(addr).length !== 32) return invalid();
  } catch {
    return invalid();
  }
  return {
    valid: true,
    chain: 'SOL',
    canonical: addr,
    validation: 'format',
    kind: 'SOL',
    notes: ['Solana: brak sumy kontrolnej – rozpoznanie wymaga słowa kluczowego w kontekście'],
  };
}

/** Wykrywa sieć i waliduje dowolny adres. */
export function validateAddress(addr: string): ValidationResult {
  if (addr.startsWith('0x')) return validateEvm(addr);
  if (/^(bc1|[13])/i.test(addr)) {
    const r = validateBitcoin(addr);
    if (r.valid) return r;
  }
  if (/^(ltc1|[LM])/i.test(addr)) {
    const r = validateLitecoin(addr);
    if (r.valid) return r;
  }
  if (addr.startsWith('T')) {
    const r = validateTron(addr);
    if (r.valid) return r;
  }
  return invalid();
}

/** Klucz grupowania adresów (EVM case-insensitive). */
export function addressKey(chain: Chain, address: string): string {
  return chain === 'ETH' ? `ETH:${address.toLowerCase()}` : `${chain}:${address}`;
}

/* ---------- Generatory adresów syntetycznych (dane testowe) ---------- */

function seedBytes(seed: string, len: number): Uint8Array {
  return sha256(utf8ToBytes(seed)).slice(0, len);
}

export const synthetic = {
  eth: (seed: string) => toChecksumAddress('0x' + bytesToHex(keccak_256(utf8ToBytes(seed)).slice(12))),
  btcBech32: (seed: string) => encodeSegwit('bc', 0, seedBytes(seed, 20)),
  btcLegacy: (seed: string) => base58checkEncode(Uint8Array.from([0x00, ...seedBytes(seed, 20)])),
  tron: (seed: string) => base58checkEncode(Uint8Array.from([0x41, ...seedBytes(seed, 20)])),
  ltc: (seed: string) => encodeSegwit('ltc', 0, seedBytes(seed, 20)),
};
