/**
 * ENS (Ethereum Name Service) – nazwa .eth → adres oraz rekordy tekstowe (twitter, github, e-mail, url).
 * Najmocniejsze, kryptograficznie potwierdzone połączenie Web3 ↔ Web2. Odczyt przez JSON-RPC (eth_call),
 * bez zewnętrznych indeksatorów. Aktywny tylko, gdy ustawiono ETH_RPC_URL i host jest na allowliście.
 */
import { keccakHex, toChecksumAddress, type Identifier } from '@olcys/core';
import type { CollectedDocument } from '../evidence';
import type { ConnectorContext, SourceConnector } from './types';

const ENS_REGISTRY = '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e';
const SEL = { resolver: '0178b8bf', addr: '3b3b57de', text: '59d1d43c' };
const TEXT_KEYS = ['com.twitter', 'com.github', 'email', 'url', 'org.telegram', 'description'];

const hexToBytes = (hex: string) => Uint8Array.from(Buffer.from(hex.replace(/^0x/, ''), 'hex'));

export function namehash(name: string): string {
  let node = '00'.repeat(32);
  if (!name) return '0x' + node;
  for (const label of name.toLowerCase().split('.').reverse()) {
    const labelHash = keccakHex(new TextEncoder().encode(label));
    node = keccakHex(hexToBytes(node + labelHash));
  }
  return '0x' + node;
}

function encodeTextCall(node: string, key: string): string {
  const keyHex = Buffer.from(key, 'utf8').toString('hex');
  const len = key.length.toString(16).padStart(64, '0');
  const padded = keyHex.padEnd(Math.ceil(keyHex.length / 64) * 64 || 64, '0');
  return '0x' + SEL.text + node.slice(2) + (64).toString(16).padStart(64, '0') + len + padded;
}

function decodeString(hex: string): string {
  const h = hex.replace(/^0x/, '');
  if (h.length < 128) return '';
  const offset = parseInt(h.slice(0, 64), 16) * 2;
  const len = parseInt(h.slice(offset, offset + 64), 16);
  return Buffer.from(h.slice(offset + 64, offset + 64 + len * 2), 'hex').toString('utf8');
}

export const ensConnector: SourceConnector = {
  id: 'ens',
  title: 'ENS – nazwy .eth i rekordy tekstowe',
  compliance: 'Odczyt publicznych danych z blockchaina Ethereum przez JSON-RPC (tylko odczyt).',
  accepts: ['nick'],
  isLive: () => true,
  enabled: (c) => Boolean(c.chain.ethRpcUrl),
  async collect(q: Identifier, ctx: ConnectorContext): Promise<CollectedDocument[]> {
    const name = q.value.toLowerCase().endsWith('.eth') ? q.value.toLowerCase() : `${q.value.toLowerCase()}.eth`;
    const rpc = ctx.config.chain.ethRpcUrl!;
    const call = async (to: string, data: string) => {
      const r = await ctx.fetch(rpc, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to, data }, 'latest'] }),
      });
      return (JSON.parse(r.body).result as string) ?? '0x';
    };
    const node = namehash(name);
    const resolverRaw = await call(ENS_REGISTRY, '0x' + SEL.resolver + node.slice(2));
    const resolver = '0x' + resolverRaw.slice(-40);
    if (/^0x0{40}$/.test(resolver)) return [];
    const addrRaw = await call(resolver, '0x' + SEL.addr + node.slice(2));
    const address = /^0x0*$/.test(addrRaw) ? undefined : toChecksumAddress('0x' + addrRaw.slice(-40));
    const texts: Record<string, string> = {};
    for (const key of TEXT_KEYS) {
      const v = decodeString(await call(resolver, encodeTextCall(node, key)));
      if (v) texts[key] = v;
    }
    const links: Identifier[] = [];
    if (texts['com.twitter']) links.push({ type: 'nick', value: texts['com.twitter'].replace(/^@/, '') });
    if (texts['com.github']) links.push({ type: 'nick', value: texts['com.github'] });
    if (texts.email) links.push({ type: 'email', value: texts.email });
    if (texts.url) links.push({ type: 'url', value: texts.url });
    if (texts['org.telegram']) links.push({ type: 'telegram', value: texts['org.telegram'].replace(/^@/, '') });
    const text = [`ENS ${name}`, address && `Mój adres: ${address}`, ...Object.entries(texts).map(([k, v]) => `${k}: ${v}`)].filter(Boolean).join('\n');
    const raw = JSON.stringify({ name, node, resolver, address, texts });
    return [
      {
        family: 'ens',
        sourceKind: 'OWN_PROFILE',
        url: `ens://${name}`,
        title: `ENS ${name}`,
        fetchedAt: new Date().toISOString(),
        contentType: 'application/json',
        owner: { handle: q.value },
        segments: [{ id: 'records', author: { handle: q.value }, text }],
        links,
        meta: { rpc: new URL(rpc).host, ownedByQuery: true },
        raw,
      },
    ];
  },
};
