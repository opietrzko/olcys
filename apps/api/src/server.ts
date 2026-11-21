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
import { createEngine, renderReportHtml, renderReportPdf, ENGINE_VERSION, REPO_ROOT } from '@olcys/engine';
import { createStore, type AnalysisRow, type RunRow, type RunSummary } from './store';

const engine = createEngine();
const store = createStore();
const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' } });
await app.register(cors, { origin: process.env.CORS_ORIGIN ?? true });

const newId = (p: string) => `${p}_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
const actorOf = (headers: Record<string, unknown>) => String(headers['x-olcys-user'] ?? 'analityk'); // miejsce na SSO/RBAC KAS

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
}));

/* ---------- Analizy ---------- */
app.get('/api/analyses', async () => store.listAnalyses());

app.post('/api/analyses', async (req, reply) => {
  const body = CreateSchema.safeParse(req.body);
  if (!body.success) return reply.code(400).send({ error: body.error.flatten() });
  const actor = actorOf(req.headers);
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
  await store.audit({ actor: actorOf(req.headers), action: 'analysis.schedule', target: req.params.id, details: { scheduleMinutes: m } });
  return { ok: true };
});

app.post<{ Params: { id: string } }>('/api/analyses/:id/runs', async (req, reply) => {
  const a = await store.getAnalysis(req.params.id);
  if (!a) return reply.code(404).send({ error: 'not found' });
  return reply.code(201).send(await startRun(a, 'manual', actorOf(req.headers)));
});

/* ---------- Przebiegi ---------- */
app.get<{ Params: { id: string } }>('/api/runs/:id', async (req, reply) => {
  const r = await store.getRun(req.params.id);
  if (!r) return reply.code(404).send({ error: 'not found' });
  await store.audit({ actor: actorOf(req.headers), action: 'run.view', target: r.id, details: {} });
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
  await store.audit({ actor: actorOf(req.headers), action: 'report.generate', target: r.id, details: {} });
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
  await store.audit({ actor: actorOf(req.headers), action: 'report.generate', target: r.id, details: { format: 'pdf' } });
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

/** Pakiet do odtworzenia analizy: wynik + surowe dowody + parametry. */
app.get<{ Params: { id: string } }>('/api/runs/:id/export.json', async (req, reply) => {
  const r = await store.getRun(req.params.id);
  if (!r?.result) return reply.code(404).send({ error: 'not found' });
  const evidence = await store.listEvidence(r.id);
  await store.audit({ actor: actorOf(req.headers), action: 'run.export', target: r.id, details: {} });
  return reply.header('content-disposition', `attachment; filename="kryptotrop-${r.id}.json"`).send({ run: { ...r, result: undefined }, result: r.result, evidence });
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
