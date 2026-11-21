/**
 * KryptoTrop API – zarządzanie analizami, przebiegami (także cyklicznymi), dowodami, raportami i dziennikiem audytu.
 */
import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { BANDS, SCORING_RULES, RULES_VERSION, ACTIVITY_THRESHOLDS, diffRuns, type AnalysisResult } from '@olcys/core';
import { createEngine, loadSigningKey, renderReportHtml, renderReportPdf, sealPackage, type PackageIntegrity, ENGINE_VERSION, REPO_ROOT } from '@olcys/engine';
import { createStore, type AnalysisRow, type RunRow, type RunSummary } from './store';
import { Auth, COOKIE, readCookie, requiredRoles, type Session } from './auth';

const engine = createEngine();
const store = createStore();
const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' } });
await app.register(cors, { origin: process.env.CORS_ORIGIN ?? true });

const newId = (p: string) => `${p}_${randomUUID().replace(/-/g, '').slice(0, 12)}`;

/* ---------- Logowanie i role (opcjonalne – włączone, gdy istnieje plik użytkowników) ---------- */
const auth = new Auth(process.env.OLCYS_USERS_FILE ?? join(REPO_ROOT, 'data', 'users.json'));
const sessions = new WeakMap<object, Session>();
/** Autor operacji w dzienniku audytu: zalogowany użytkownik; bez logowania – nagłówek x-olcys-user (miejsce na SSO KAS). */
const actorOf = (req: { headers: Record<string, unknown>; raw: object }) => sessions.get(req.raw)?.login ?? (auth.enabled ? 'nieznany' : String(req.headers['x-olcys-user'] ?? 'analityk'));

app.addHook('onRequest', async (req, reply) => {
  const path = req.url.split('?')[0];
  if (!path.startsWith('/api/') || path === '/api/health' || path.startsWith('/api/auth/') || !auth.enabled) return;
  const s = auth.verify(readCookie(req.headers.cookie, COOKIE));
  if (!s) return reply.code(401).send({ error: 'unauthorized', message: 'Wymagane logowanie' });
  const need = requiredRoles(req.method, path);
  if (need && !need.includes(s.role)) return reply.code(403).send({ error: 'forbidden', message: `Brak uprawnień: rola „${s.role}”` });
  sessions.set(req.raw, s);
});

app.get('/api/auth/me', async (req) => {
  const s = auth.enabled ? auth.verify(readCookie(req.headers.cookie, COOKIE)) : null;
  return { enabled: auth.enabled, user: s ? { login: s.login, role: s.role, name: s.name ?? null } : null };
});

/** Ochrona przed zgadywaniem haseł: po 5 nieudanych próbach z adresu IP – blokada na 5 minut. */
const failures = new Map<string, { n: number; until: number }>();
app.post('/api/auth/login', async (req, reply) => {
  const body = z.object({ login: z.string().min(1).max(100), password: z.string().min(1).max(500) }).safeParse(req.body);
  if (!body.success) return reply.code(400).send({ error: 'bad request' });
  const f = failures.get(req.ip);
  if (f && f.until > Date.now()) return reply.code(429).send({ error: 'too many attempts', message: 'Zbyt wiele nieudanych prób – spróbuj za kilka minut' });
  const s = auth.login(body.data.login, body.data.password);
  if (!s) {
    const n = (f?.n ?? 0) + 1;
    failures.set(req.ip, { n: n >= 5 ? 0 : n, until: n >= 5 ? Date.now() + 5 * 60_000 : 0 });
    await store.audit({ actor: body.data.login.slice(0, 100), action: 'auth.login.failed', target: req.ip, details: {} });
    return reply.code(401).send({ error: 'invalid credentials', message: 'Nieprawidłowy login lub hasło' });
  }
  failures.delete(req.ip);
  await store.audit({ actor: s.login, action: 'auth.login', target: req.ip, details: { role: s.role } });
  const secure = req.protocol === 'https' ? '; Secure' : '';
  return reply
    .header('set-cookie', `${COOKIE}=${encodeURIComponent(auth.issue(s))}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.floor((s.exp - Date.now()) / 1000)}${secure}`)
    .send({ user: { login: s.login, role: s.role, name: s.name ?? null } });
});

app.post('/api/auth/logout', async (req, reply) => {
  const s = auth.verify(readCookie(req.headers.cookie, COOKIE));
  if (s) await store.audit({ actor: s.login, action: 'auth.logout', target: req.ip, details: {} });
  return reply.header('set-cookie', `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`).send({ ok: true });
});

const IdentifierSchema = z.object({ type: z.enum(['name', 'nick', 'email', 'phone', 'telegram', 'url', 'address']), value: z.string().min(1).max(300) });
const CreateSchema = z.object({
  name: z.string().min(1).max(200),
  identifiers: z.array(IdentifierSchema).min(1).max(20),
  options: z.object({ maxDepth: z.number().int().min(0).max(8).optional(), disabledConnectors: z.array(z.string()).optional(), useHistory: z.boolean().optional() }).default({}),
  scheduleMinutes: z.number().int().min(5).max(60 * 24 * 30).nullable().optional(),
});

function summarize(r: AnalysisResult): RunSummary {
  return {
    addresses: r.findings.length,
    attributed: r.findings.filter((f) => !f.attribution.gated && f.attribution.score >= 60).length,
    rejected: r.findings.filter((f) => f.attribution.gated || f.attribution.score === 0).length,
    maxScore: Math.max(0, ...r.findings.map((f) => f.attribution.score)),
    indicators: r.findings.reduce((s, f) => s + (f.activity?.indicators.filter((i) => i.type !== 'HIGH_VOLUME').length ?? 0), 0),
    evidence: r.evidence.length,
  };
}

async function startRun(a: AnalysisRow, trigger: RunRow['trigger'], actor: string): Promise<RunRow> {
  const run: RunRow = { id: newId('run'), analysisId: a.id, status: 'running', trigger, startedAt: new Date().toISOString(), finishedAt: null, error: null, summary: null };
  await store.createRun(run);
  await store.audit({ actor, action: 'run.start', target: run.id, details: { analysisId: a.id, trigger } });
  void (async () => {
    try {
      const { result, raw } = await engine.run({ identifiers: a.identifiers, options: a.options });
      await store.saveEvidence(result.evidence.map((e) => ({ runId: run.id, id: e.id, url: e.url, sha256: e.sha256, fetchedAt: e.fetchedAt, contentType: e.contentType, raw: raw[e.id] ?? '' })));
      await store.updateRun(run.id, { status: 'done', finishedAt: new Date().toISOString(), summary: summarize(result), result });
    } catch (e) {
      app.log.error(e);
      await store.updateRun(run.id, { status: 'failed', finishedAt: new Date().toISOString(), error: (e as Error).message });
    }
  })();
  return run;
}

/* ---------- Metadane / metodyka ---------- */
app.get('/api/health', async () => ({ ok: true, store: store.kind }));
app.get('/api/meta', async () => ({
  engineVersion: ENGINE_VERSION,
  rulesVersion: RULES_VERSION,
  store: store.kind,
  sources: {
    chainProvider: `${engine.config.chain.evmApiUrl} · ${engine.config.chain.esploraUrl} · ${engine.config.chain.tronGridUrl}`,
    egressAllowlist: engine.config.egressAllowlist,
    webFetch: engine.config.webFetch,
    connectors: engine.connectors(),
    githubToken: Boolean(engine.config.githubToken),
    searxng: engine.config.urls.searxng ?? null,
    liveRates: engine.config.chain.liveRates,
  },
  llm: engine.config.llm ? { model: engine.config.llm.model, baseUrl: engine.config.llm.baseUrl } : null,
  labelDatasets: engine.datasets,
  labelsCount: engine.labels.size,
  scoring: { rules: SCORING_RULES, bands: BANDS },
  activityThresholds: ACTIVITY_THRESHOLDS,
  signing: { keyId: loadSigningKey(engine.config.signing.keyFile).keyId, algorithm: 'Ed25519', tsa: engine.config.signing.tsaUrl ?? null },
}));

/* ---------- Analizy ---------- */
app.get('/api/analyses', async () => store.listAnalyses());

app.post('/api/analyses', async (req, reply) => {
  const body = CreateSchema.safeParse(req.body);
  if (!body.success) return reply.code(400).send({ error: body.error.flatten() });
  const actor = actorOf(req);
  const minutes = body.data.scheduleMinutes ?? null;
  const a: AnalysisRow = {
    id: newId('an'),
    name: body.data.name,
    identifiers: body.data.identifiers,
    options: body.data.options,
    scheduleMinutes: minutes,
    nextRunAt: minutes ? new Date(Date.now() + minutes * 60_000).toISOString() : null,
    createdAt: new Date().toISOString(),
    createdBy: actor,
  };
  await store.createAnalysis(a);
  await store.audit({ actor, action: 'analysis.create', target: a.id, details: { name: a.name, identifiers: a.identifiers } });
  const run = await startRun(a, 'manual', actor);
  return reply.code(201).send({ analysis: a, run });
});

app.get<{ Params: { id: string } }>('/api/analyses/:id', async (req, reply) => {
  const a = await store.getAnalysis(req.params.id);
  if (!a) return reply.code(404).send({ error: 'not found' });
  return { analysis: a, runs: await store.listRuns(a.id) };
});

app.patch<{ Params: { id: string } }>('/api/analyses/:id', async (req, reply) => {
  const body = z.object({ scheduleMinutes: z.number().int().min(5).nullable() }).safeParse(req.body);
  if (!body.success) return reply.code(400).send({ error: body.error.flatten() });
  const m = body.data.scheduleMinutes;
  await store.updateSchedule(req.params.id, m, m ? new Date(Date.now() + m * 60_000).toISOString() : null);
  await store.audit({ actor: actorOf(req), action: 'analysis.schedule', target: req.params.id, details: { scheduleMinutes: m } });
  return { ok: true };
});

app.post<{ Params: { id: string } }>('/api/analyses/:id/runs', async (req, reply) => {
  const a = await store.getAnalysis(req.params.id);
  if (!a) return reply.code(404).send({ error: 'not found' });
  return reply.code(201).send(await startRun(a, 'manual', actorOf(req)));
});

/* ---------- Przebiegi ---------- */
app.get<{ Params: { id: string } }>('/api/runs/:id', async (req, reply) => {
  const r = await store.getRun(req.params.id);
  if (!r) return reply.code(404).send({ error: 'not found' });
  await store.audit({ actor: actorOf(req), action: 'run.view', target: r.id, details: {} });
  return r;
});

app.get<{ Params: { id: string }; Querystring: { base?: string } }>('/api/runs/:id/diff', async (req, reply) => {
  const head = await store.getRun(req.params.id);
  if (!head?.result) return reply.code(404).send({ error: 'not found' });
  let baseId = req.query.base;
  if (!baseId) {
    const runs = (await store.listRuns(head.analysisId)).filter((r) => r.status === 'done' && r.startedAt < head.startedAt);
    baseId = runs[0]?.id;
  }
  if (!baseId) return { diff: null, message: 'Brak wcześniejszego przebiegu do porównania' };
  const base = await store.getRun(baseId);
  if (!base?.result) return reply.code(404).send({ error: 'base not found' });
  return { diff: diffRuns(base.id, base.result, head.id, head.result) };
});

app.get<{ Params: { id: string } }>('/api/runs/:id/report.html', async (req, reply) => {
  const r = await store.getRun(req.params.id);
  if (!r?.result) return reply.code(404).send({ error: 'not found' });
  const a = await store.getAnalysis(r.analysisId);
  await store.audit({ actor: actorOf(req), action: 'report.generate', target: r.id, details: {} });
  return reply.type('text/html; charset=utf-8').send(renderReportHtml(r.result, { runId: r.id, analysisName: a?.name ?? r.analysisId }));
});

/**
 * Raport PDF generowany przy każdym żądaniu z wyniku przebiegu. `inline` – przeglądarka pokazuje go w swojej przeglądarce PDF
 * (z przyciskiem pobierania); nazwa pliku jest używana przy zapisie.
 */
app.get<{ Params: { id: string } }>('/api/runs/:id/report.pdf', async (req, reply) => {
  const r = await store.getRun(req.params.id);
  if (!r?.result) return reply.code(404).send({ error: 'not found' });
  const a = await store.getAnalysis(r.analysisId);
  const name = a?.name ?? r.analysisId;
  const pdf = await renderReportPdf(r.result, { runId: r.id, analysisName: name });
  await store.audit({ actor: actorOf(req), action: 'report.generate', target: r.id, details: { format: 'pdf' } });
  const slug = name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l').replace(/Ł/g, 'L').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'analiza';
  const file = `kryptotrop-raport-${slug}-${r.id}.pdf`;
  return reply
    .type('application/pdf')
    .header('content-disposition', `inline; filename="${file}"; filename*=UTF-8''${encodeURIComponent(file)}`)
    .header('cache-control', 'no-store')
    .send(pdf);
});

/** Surowa kopia dowodu – serwowana jako tekst (bez wykonywania skryptów ze źródła). */
app.get<{ Params: { id: string; ev: string } }>('/api/runs/:id/evidence/:ev', async (req, reply) => {
  const e = await store.getEvidence(req.params.id, req.params.ev);
  if (!e) return reply.code(404).send({ error: 'not found' });
  return reply
    .header('content-security-policy', "default-src 'none'; sandbox")
    .header('x-content-type-options', 'nosniff')
    .header('x-olcys-sha256', e.sha256)
    .header('x-olcys-source-url', encodeURI(e.url))
    .header('x-olcys-fetched-at', e.fetchedAt)
    .type('text/plain; charset=utf-8')
    .send(e.raw);
});

/**
 * Pakiet do odtworzenia analizy: wynik + surowe dowody + parametry, opieczętowany (manifest SHA-256, podpis Ed25519,
 * znacznik czasu RFC 3161). Pieczęć jest liczona raz na przebieg i ponownie wydawana przy kolejnych pobraniach.
 */
const seals = new Map<string, PackageIntegrity>();
app.get<{ Params: { id: string } }>('/api/runs/:id/export.json', async (req, reply) => {
  const r = await store.getRun(req.params.id);
  if (!r?.result) return reply.code(404).send({ error: 'not found' });
  const evidence = await store.listEvidence(r.id);
  const body = { run: { ...r, result: undefined }, result: r.result, evidence };
  // JSON.stringify pomija pole result: undefined – pieczęć liczona z dokładnie tej postaci, którą dostaje odbiorca
  const plain = JSON.parse(JSON.stringify(body)) as typeof body;
  let integrity = seals.get(r.id);
  if (!integrity) {
    integrity = await sealPackage(plain, { keyFile: engine.config.signing.keyFile, tsaUrl: engine.config.signing.tsaUrl, userAgent: engine.config.userAgent });
    if (integrity.timestamp?.status !== 'error') seals.set(r.id, integrity);
  }
  await store.audit({ actor: actorOf(req), action: 'run.export', target: r.id, details: { packageSha256: integrity.packageSha256, timestamp: integrity.timestamp?.genTime ?? integrity.timestamp?.status ?? null } });
  return reply.header('content-disposition', `attachment; filename="kryptotrop-${r.id}.json"`).send({ ...plain, integrity });
});

/** Klucz publiczny podpisu pakietów (do niezależnej weryfikacji). */
app.get('/api/signing-key', async (_req, reply) => {
  const k = loadSigningKey(engine.config.signing.keyFile);
  return reply.type('application/x-pem-file').header('x-olcys-key-id', k.keyId).send(k.publicKeyPem);
});

app.get('/api/audit', async () => store.listAudit(200));

/* ---------- Harmonogram analiz cyklicznych ---------- */
async function schedulerTick() {
  const now = new Date().toISOString();
  for (const a of await store.dueAnalyses(now)) {
    await store.updateSchedule(a.id, a.scheduleMinutes, new Date(Date.now() + a.scheduleMinutes! * 60_000).toISOString());
    app.log.info(`Harmonogram: uruchamiam ${a.id}`);
    await startRun(a, 'schedule', 'scheduler');
  }
}

/* ---------- Frontend (build produkcyjny) ---------- */
const webDist = join(REPO_ROOT, 'apps', 'web', 'dist');
if (existsSync(webDist)) {
  await app.register(fastifyStatic, { root: webDist });
  app.setNotFoundHandler((req, reply) => (req.url.startsWith('/api') ? reply.code(404).send({ error: 'not found' }) : reply.sendFile('index.html')));
}

await store.init();
setInterval(() => void schedulerTick().catch((e) => app.log.error(e)), Number(process.env.SCHEDULER_TICK_MS ?? 30_000));
await app.listen({ port: Number(process.env.PORT ?? 4000), host: process.env.HOST ?? '0.0.0.0' });
app.log.info(`KryptoTrop API – magazyn ${store.kind}`);
