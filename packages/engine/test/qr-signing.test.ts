import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import QRCode from 'qrcode';
import { describe, expect, it } from 'vitest';
import { synthetic } from '@olcys/core';
import { decodeQr, imagesInMarkdown, pickQrCandidates } from '../src/qr';
import { buildTimestampRequest, readTimestampResponse, sealPackage, sha256, verifyPackage } from '../src/signing';

const BTC = synthetic.btcBech32('qr-test');

describe('Kody QR w obrazach', () => {
  it('dekoduje adres z obrazu PNG', async () => {
    const png = await QRCode.toBuffer(`bitcoin:${BTC}?amount=0.01`, { type: 'png', width: 240 });
    expect(decodeQr(png)).toBe(`bitcoin:${BTC}?amount=0.01`);
  });
  it('dane, które nie są obrazem → null', () => {
    expect(decodeQr(Buffer.from('<html>nie obraz</html>'))).toBeNull();
  });
  it('wybiera obrazy z podpowiedzią QR / portfel, pomija ikony i SVG', () => {
    const picked = pickQrCandidates(
      [
        { src: 'https://img.shields.io/badge/x.png' },
        { src: '/img/logo.png' },
        { src: 'icon.svg' },
        { src: 'photo1.jpg' },
        { src: 'photo2.jpg' },
        { src: 'photo3.jpg' },
        { src: 'assets/btc-qr.png', alt: 'Wesprzyj mnie' },
      ],
      'https://example.org/strona/',
    );
    expect(picked).toEqual(['https://example.org/strona/assets/btc-qr.png', 'https://example.org/strona/photo1.jpg', 'https://example.org/strona/photo2.jpg']);
  });
  it('obrazy z Markdown i HTML w README', () => {
    expect(imagesInMarkdown('![Portfel BTC](img/qr.png "QR")\n<img src="https://x.org/a.jpg" alt="donate">')).toEqual([
      { src: 'img/qr.png', alt: 'Portfel BTC' },
      { src: 'https://x.org/a.jpg', alt: 'donate' },
    ]);
  });
});

describe('Pieczęć pakietu dowodowego', () => {
  const body = () => ({
    run: { id: 'run_1', status: 'done' },
    result: { findings: [{ key: `BTC:${BTC}`, score: 85 }] },
    evidence: [{ id: 'ev_1', url: 'https://example.org', sha256: sha256('<html>dowód</html>'), raw: '<html>dowód</html>' }],
  });
  const keyFile = join(mkdtempSync(join(tmpdir(), 'olcys-key-')), 'k.pem');

  it('podpis Ed25519 i manifest weryfikują się, a każda zmiana jest wykrywana', async () => {
    const pkg = body();
    const integrity = await sealPackage(pkg, { keyFile, userAgent: 'test' });
    expect(integrity.timestamp).toBeNull();
    expect(integrity.evidence[0].matchesRecorded).toBe(true);
    expect(verifyPackage({ ...pkg, integrity }).ok).toBe(true);

    const tamperedResult = { ...pkg, result: { findings: [{ key: `BTC:${BTC}`, score: 99 }] }, integrity };
    expect(verifyPackage(tamperedResult).ok).toBe(false);

    const tamperedEvidence = { ...pkg, evidence: [{ ...pkg.evidence[0], raw: '<html>podmieniony</html>' }], integrity };
    const v = verifyPackage(tamperedEvidence);
    expect(v.ok).toBe(false);
    expect(v.checks.find((c) => c.name.startsWith('Kopie'))?.ok).toBe(false);

    const forged = { ...pkg, integrity: { ...integrity, signature: { ...integrity.signature, value: Buffer.alloc(64).toString('base64') } } };
    expect(verifyPackage(forged).checks.find((c) => c.name === 'Podpis Ed25519')?.ok).toBe(false);
  });

  it('ten sam plik klucza = ten sam identyfikator klucza', async () => {
    const a = await sealPackage(body(), { keyFile, userAgent: 'test' });
    const b = await sealPackage(body(), { keyFile, userAgent: 'test' });
    expect(a.signature.keyId).toBe(b.signature.keyId);
    expect(a.packageSha256).toBe(b.packageSha256);
  });

  it('żądanie RFC 3161 zawiera skrót SHA-256 pakietu', () => {
    const digest = sha256('pakiet');
    const req = buildTimestampRequest(digest, Buffer.from('0102030405060708', 'hex'));
    expect(req[0]).toBe(0x30);
    expect(req.toString('hex')).toContain(digest);
    expect(req.toString('hex')).toContain('0609608648016503040201'); // OID sha256
  });

  it('odczyt statusu i czasu z odpowiedzi TSA', () => {
    // TimeStampResp { status { INTEGER 0 }, … GeneralizedTime 20261121210515Z }
    const time = Buffer.concat([Buffer.from([0x18, 0x0f]), Buffer.from('20261121210515Z')]);
    const status = Buffer.from([0x30, 0x03, 0x02, 0x01, 0x00]);
    const token = Buffer.concat([Buffer.from([0x30, time.length]), time]);
    const resp = Buffer.concat([Buffer.from([0x30, status.length + token.length]), status, token]);
    expect(readTimestampResponse(resp)).toEqual({ granted: true, status: 0, genTime: '2026-11-21T21:05:15Z' });
  });
});
