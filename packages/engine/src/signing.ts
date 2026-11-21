/**
 * Integralność pakietu dowodowego:
 *  1. manifest SHA-256 – skrót każdej surowej kopii dowodu, wyniku analizy i całego pakietu,
 *  2. podpis Ed25519 skrótu pakietu kluczem instancji KryptoTrop (klucz generowany przy pierwszym użyciu,
 *     w produkcji – klucz KAS z HSM / pliku wskazanego w OLCYS_SIGNING_KEY_FILE),
 *  3. znacznik czasu RFC 3161 skrótu pakietu z zewnętrznego urzędu znacznika czasu (TSA) – dowód, że pakiet istniał
 *     w danej chwili. Do TSA trafia wyłącznie skrót SHA-256 (bez danych analizy).
 *
 * Weryfikacja: `npm run verify:package -- plik.json` (manifest, podpis) oraz `openssl ts -verify` (znacznik czasu).
 */
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, randomBytes, sign, verify, type KeyObject } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export const sha256 = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');

export interface PackageIntegrity {
  version: 1;
  algorithm: 'sha256';
  /** SHA-256 z JSON.stringify({ run, result, evidence }) – w tej kolejności pól. */
  packageSha256: string;
  resultSha256: string;
  evidence: { id: string; url: string; sha256: string; matchesRecorded: boolean }[];
  signature: { algorithm: 'Ed25519'; keyId: string; publicKeyPem: string; value: string; signedAt: string };
  timestamp: TimestampResult | null;
}

export interface TimestampResult {
  tsa: string;
  status: 'granted' | 'rejected' | 'error';
  /** Czas z tokenu TSA (GeneralizedTime). */
  genTime?: string;
  /** Odpowiedź TSA (TimeStampResp, DER) w base64 – do weryfikacji `openssl ts -verify`. */
  tokenBase64?: string;
  error?: string;
}

/** Klucz podpisu instancji: wczytany z pliku PEM albo wygenerowany i zapisany przy pierwszym użyciu. */
export function loadSigningKey(file: string): { privateKey: KeyObject; publicKeyPem: string; keyId: string } {
  let privateKey: KeyObject;
  if (existsSync(file)) privateKey = createPrivateKey(readFileSync(file, 'utf8'));
  else {
    privateKey = generateKeyPairSync('ed25519').privateKey;
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, privateKey.export({ type: 'pkcs8', format: 'pem' }) as string, { mode: 0o600 });
  }
  const publicKeyPem = createPublicKey(privateKey).export({ type: 'spki', format: 'pem' }) as string;
  return { privateKey, publicKeyPem, keyId: sha256(publicKeyPem).slice(0, 16) };
}

/* ---------- RFC 3161: minimalny koder DER żądania i odczyt odpowiedzi ---------- */

function der(tag: number, content: Buffer): Buffer {
  const len = content.length;
  const head = len < 0x80 ? Buffer.from([tag, len]) : len < 0x100 ? Buffer.from([tag, 0x81, len]) : Buffer.from([tag, 0x82, len >> 8, len & 0xff]);
  return Buffer.concat([head, content]);
}
const SEQ = (...items: Buffer[]) => der(0x30, Buffer.concat(items));
const SHA256_OID = Buffer.from('0609608648016503040201', 'hex'); // 2.16.840.1.101.3.4.2.1

/** TimeStampReq (RFC 3161 §2.4.1): wersja 1, skrót SHA-256, losowy nonce, certReq = TRUE. */
export function buildTimestampRequest(digestHex: string, nonce: Buffer = randomBytes(8)): Buffer {
  const n = nonce[0] & 0x80 ? Buffer.concat([Buffer.from([0]), nonce]) : nonce;
  return SEQ(der(0x02, Buffer.from([1])), SEQ(SEQ(SHA256_OID, Buffer.from([0x05, 0x00])), der(0x04, Buffer.from(digestHex, 'hex'))), der(0x02, n), Buffer.from([0x01, 0x01, 0xff]));
}

/** Status PKIStatusInfo (0/1 = granted) i czas GeneralizedTime z TSTInfo. */
export function readTimestampResponse(resp: Buffer): { granted: boolean; status: number; genTime?: string } {
  // TimeStampResp ::= SEQUENCE { status PKIStatusInfo (SEQUENCE { INTEGER … }), timeStampToken … }
  const lenAt = (i: number): [number, number] => {
    const b = resp[i];
    if (b < 0x80) return [b, 1];
    const k = b & 0x7f;
    let v = 0;
    for (let j = 1; j <= k; j++) v = (v << 8) | resp[i + j];
    return [v, k + 1];
  };
  let i = 0;
  if (resp[i] !== 0x30) return { granted: false, status: -1 };
  i += 1 + lenAt(i + 1)[1];
  if (resp[i] !== 0x30) return { granted: false, status: -1 };
  i += 1 + lenAt(i + 1)[1];
  if (resp[i] !== 0x02) return { granted: false, status: -1 };
  const status = resp[i + 2];
  const ascii = resp.toString('latin1');
  const m = ascii.match(/\x18[\x0f-\x13](\d{14}(?:\.\d{1,6})?Z)/);
  const t = m?.[1];
  const genTime = t ? `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}T${t.slice(8, 10)}:${t.slice(10, 12)}:${t.slice(12)}` : undefined;
  return { granted: status === 0 || status === 1, status, genTime };
}

export async function requestTimestamp(tsaUrl: string, digestHex: string, userAgent: string): Promise<TimestampResult> {
  try {
    const r = await fetch(tsaUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/timestamp-query', accept: 'application/timestamp-reply', 'user-agent': userAgent },
      body: new Uint8Array(buildTimestampRequest(digestHex)),
      signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok) return { tsa: tsaUrl, status: 'error', error: `HTTP ${r.status}` };
    const buf = Buffer.from(await r.arrayBuffer());
    const { granted, status, genTime } = readTimestampResponse(buf);
    return granted ? { tsa: tsaUrl, status: 'granted', genTime, tokenBase64: buf.toString('base64') } : { tsa: tsaUrl, status: 'rejected', error: `PKIStatus ${status}` };
  } catch (e) {
    return { tsa: tsaUrl, status: 'error', error: (e as Error).message };
  }
}

export interface PackageBody {
  run: unknown;
  result: unknown;
  evidence: { id: string; url: string; sha256: string; raw: string }[];
}

/** Pieczętuje pakiet: manifest, podpis Ed25519 i (opcjonalnie) znacznik czasu RFC 3161. */
export async function sealPackage(body: PackageBody, opts: { keyFile: string; tsaUrl?: string; userAgent: string }): Promise<PackageIntegrity> {
  const key = loadSigningKey(opts.keyFile);
  const packageSha256 = sha256(JSON.stringify({ run: body.run, result: body.result, evidence: body.evidence }));
  const signedAt = new Date().toISOString();
  return {
    version: 1,
    algorithm: 'sha256',
    packageSha256,
    resultSha256: sha256(JSON.stringify(body.result)),
    evidence: body.evidence.map((e) => {
      const s = sha256(Buffer.from(e.raw, 'utf8'));
      return { id: e.id, url: e.url, sha256: s, matchesRecorded: s === e.sha256 };
    }),
    signature: { algorithm: 'Ed25519', keyId: key.keyId, publicKeyPem: key.publicKeyPem, value: sign(null, Buffer.from(packageSha256), key.privateKey).toString('base64'), signedAt },
    timestamp: opts.tsaUrl ? await requestTimestamp(opts.tsaUrl, packageSha256, opts.userAgent) : null,
  };
}

/** Weryfikacja pakietu: skróty dowodów, skrót pakietu i podpis (znacznik czasu – openssl ts -verify). */
export function verifyPackage(file: PackageBody & { integrity?: PackageIntegrity }): { ok: boolean; checks: { name: string; ok: boolean; detail: string }[] } {
  const checks: { name: string; ok: boolean; detail: string }[] = [];
  const integ = file.integrity;
  if (!integ) return { ok: false, checks: [{ name: 'integrity', ok: false, detail: 'brak sekcji integrity w pakiecie' }] };
  const pkg = sha256(JSON.stringify({ run: file.run, result: file.result, evidence: file.evidence }));
  checks.push({ name: 'Skrót pakietu', ok: pkg === integ.packageSha256, detail: pkg });
  checks.push({ name: 'Skrót wyniku', ok: sha256(JSON.stringify(file.result)) === integ.resultSha256, detail: integ.resultSha256 });
  const bad = file.evidence.filter((e) => sha256(Buffer.from(e.raw, 'utf8')) !== e.sha256);
  checks.push({ name: 'Kopie dowodów (SHA-256)', ok: bad.length === 0, detail: bad.length ? `niezgodne: ${bad.map((b) => b.id).join(', ')}` : `${file.evidence.length} zgodnych` });
  let sigOk = false;
  try {
    sigOk = verify(null, Buffer.from(integ.packageSha256), createPublicKey(integ.signature.publicKeyPem), Buffer.from(integ.signature.value, 'base64'));
  } catch {
    sigOk = false;
  }
  checks.push({ name: 'Podpis Ed25519', ok: sigOk, detail: `klucz ${integ.signature.keyId}, ${integ.signature.signedAt}` });
  if (integ.timestamp) checks.push({ name: 'Znacznik czasu RFC 3161', ok: integ.timestamp.status === 'granted', detail: integ.timestamp.status === 'granted' ? `${integ.timestamp.tsa}, ${integ.timestamp.genTime ?? '?'} (pełna weryfikacja: openssl ts -verify)` : `${integ.timestamp.tsa}: ${integ.timestamp.error}` });
  return { ok: checks.every((c) => c.ok), checks };
}
