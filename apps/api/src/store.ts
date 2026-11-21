/**
 * Warstwa trwałości: PostgreSQL (produkcja) lub pamięć (szybki start bez bazy / testy).
 * Każdy przebieg zapisuje pełny wynik oraz surowe kopie dowodów z SHA-256 → odtwarzalność analizy.
 */
import pg from 'pg';
import type { AnalysisResult, Identifier } from '@olcys/core';

export interface AnalysisRow {
  id: string;
  name: string;
  identifiers: Identifier[];
  options: Record<string, unknown>;
  scheduleMinutes: number | null;
  nextRunAt: string | null;
  createdAt: string;
  createdBy: string;
}

export interface RunSummary {
  addresses: number;
  attributed: number;
  rejected: number;
  maxScore: number;
  indicators: number;
  evidence: number;
}

export interface RunRow {
  id: string;
  analysisId: string;
  status: 'queued' | 'running' | 'done' | 'failed';
  trigger: 'manual' | 'schedule';
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
  summary: RunSummary | null;
  result?: AnalysisResult | null;
}

export interface EvidenceRow {
  runId: string;
  id: string;
  url: string;
  sha256: string;
  fetchedAt: string;
  contentType: string;
  raw: string;
}

export interface AuditRow {
  at: string;
  actor: string;
  action: string;
  target: string;
  details: Record<string, unknown>;
}

export interface Store {
  kind: string;
  init(): Promise<void>;
  createAnalysis(a: AnalysisRow): Promise<void>;
  updateSchedule(id: string, minutes: number | null, nextRunAt: string | null): Promise<void>;
  listAnalyses(): Promise<(AnalysisRow & { lastRun: RunRow | null; runCount: number })[]>;
  getAnalysis(id: string): Promise<AnalysisRow | null>;
  dueAnalyses(now: string): Promise<AnalysisRow[]>;
  createRun(r: RunRow): Promise<void>;
  updateRun(id: string, patch: Partial<RunRow>): Promise<void>;
  listRuns(analysisId: string): Promise<RunRow[]>;
  getRun(id: string): Promise<RunRow | null>;
  saveEvidence(rows: EvidenceRow[]): Promise<void>;
  getEvidence(runId: string, id: string): Promise<EvidenceRow | null>;
  listEvidence(runId: string): Promise<EvidenceRow[]>;
  audit(a: Omit<AuditRow, 'at'>): Promise<void>;
  listAudit(limit: number): Promise<AuditRow[]>;
}

export class MemoryStore implements Store {
  kind = 'memory';
  private analyses = new Map<string, AnalysisRow>();
  private runs = new Map<string, RunRow>();
  private evidence = new Map<string, EvidenceRow>();
  private auditLog: AuditRow[] = [];
  async init() {}
  async createAnalysis(a: AnalysisRow) {
    this.analyses.set(a.id, a);
  }
  async updateSchedule(id: string, minutes: number | null, nextRunAt: string | null) {
    const a = this.analyses.get(id);
    if (a) Object.assign(a, { scheduleMinutes: minutes, nextRunAt });
  }
  async listAnalyses() {
    return [...this.analyses.values()]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((a) => {
        const runs = [...this.runs.values()].filter((r) => r.analysisId === a.id).sort((x, y) => y.startedAt.localeCompare(x.startedAt));
        return { ...a, lastRun: runs[0] ? { ...runs[0], result: undefined } : null, runCount: runs.length };
      });
  }
  async getAnalysis(id: string) {
    return this.analyses.get(id) ?? null;
  }
  async dueAnalyses(now: string) {
    return [...this.analyses.values()].filter((a) => a.scheduleMinutes && a.nextRunAt && a.nextRunAt <= now);
  }
  async createRun(r: RunRow) {
    this.runs.set(r.id, r);
  }
  async updateRun(id: string, patch: Partial<RunRow>) {
    const r = this.runs.get(id);
    if (r) Object.assign(r, patch);
  }
  async listRuns(analysisId: string) {
    return [...this.runs.values()].filter((r) => r.analysisId === analysisId).sort((a, b) => b.startedAt.localeCompare(a.startedAt)).map((r) => ({ ...r, result: undefined }));
  }
  async getRun(id: string) {
    return this.runs.get(id) ?? null;
  }
  async saveEvidence(rows: EvidenceRow[]) {
    for (const r of rows) this.evidence.set(`${r.runId}/${r.id}`, r);
  }
  async getEvidence(runId: string, id: string) {
    return this.evidence.get(`${runId}/${id}`) ?? null;
  }
  async listEvidence(runId: string) {
    return [...this.evidence.values()].filter((e) => e.runId === runId);
  }
  async audit(a: Omit<AuditRow, 'at'>) {
    this.auditLog.unshift({ ...a, at: new Date().toISOString() });
  }
  async listAudit(limit: number) {
    return this.auditLog.slice(0, limit);
  }
}

const SCHEMA = `
create table if not exists analyses (
  id text primary key, name text not null, identifiers jsonb not null, options jsonb not null default '{}',
  schedule_minutes int, next_run_at timestamptz, created_at timestamptz not null default now(), created_by text not null
);
create table if not exists runs (
  id text primary key, analysis_id text not null references analyses(id) on delete cascade,
  status text not null, trigger text not null, started_at timestamptz not null, finished_at timestamptz,
  error text, summary jsonb, result jsonb
);
create index if not exists runs_analysis_idx on runs(analysis_id, started_at desc);
create table if not exists evidence (
  run_id text not null references runs(id) on delete cascade, id text not null, url text not null,
  sha256 text not null, fetched_at timestamptz not null, content_type text, raw text not null,
  primary key (run_id, id)
);
create table if not exists audit_log (
  id bigserial primary key, at timestamptz not null default now(), actor text not null,
  action text not null, target text not null, details jsonb not null default '{}'
);`;

const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : (v as string | null));

export class PgStore implements Store {
  kind = 'postgres';
  private pool: pg.Pool;
  constructor(url: string) {
    this.pool = new pg.Pool({ connectionString: url, max: 10 });
  }
  async init() {
    await this.pool.query(SCHEMA);
  }
  private mapA(r: Record<string, unknown>): AnalysisRow {
    return { id: r.id as string, name: r.name as string, identifiers: r.identifiers as Identifier[], options: r.options as Record<string, unknown>, scheduleMinutes: r.schedule_minutes as number | null, nextRunAt: iso(r.next_run_at), createdAt: iso(r.created_at)!, createdBy: r.created_by as string };
  }
  private mapR(r: Record<string, unknown>, withResult = false): RunRow {
    return { id: r.id as string, analysisId: r.analysis_id as string, status: r.status as RunRow['status'], trigger: r.trigger as RunRow['trigger'], startedAt: iso(r.started_at)!, finishedAt: iso(r.finished_at), error: r.error as string | null, summary: r.summary as RunSummary | null, ...(withResult ? { result: r.result as AnalysisResult | null } : {}) };
  }
  async createAnalysis(a: AnalysisRow) {
    await this.pool.query('insert into analyses(id,name,identifiers,options,schedule_minutes,next_run_at,created_at,created_by) values($1,$2,$3,$4,$5,$6,$7,$8)', [a.id, a.name, JSON.stringify(a.identifiers), JSON.stringify(a.options), a.scheduleMinutes, a.nextRunAt, a.createdAt, a.createdBy]);
  }
  async updateSchedule(id: string, minutes: number | null, nextRunAt: string | null) {
    await this.pool.query('update analyses set schedule_minutes=$2, next_run_at=$3 where id=$1', [id, minutes, nextRunAt]);
  }
  async listAnalyses() {
    const { rows } = await this.pool.query(`select a.*, (select count(*)::int from runs r where r.analysis_id=a.id) run_count,
      (select row_to_json(x) from (select id,analysis_id,status,trigger,started_at,finished_at,error,summary from runs r where r.analysis_id=a.id order by started_at desc limit 1) x) last_run
      from analyses a order by created_at desc`);
    return rows.map((r) => ({ ...this.mapA(r), runCount: r.run_count, lastRun: r.last_run ? this.mapR(r.last_run) : null }));
  }
  async getAnalysis(id: string) {
    const { rows } = await this.pool.query('select * from analyses where id=$1', [id]);
    return rows[0] ? this.mapA(rows[0]) : null;
  }
  async dueAnalyses(now: string) {
    const { rows } = await this.pool.query('select * from analyses where schedule_minutes is not null and next_run_at <= $1', [now]);
    return rows.map((r) => this.mapA(r));
  }
  async createRun(r: RunRow) {
    await this.pool.query('insert into runs(id,analysis_id,status,trigger,started_at) values($1,$2,$3,$4,$5)', [r.id, r.analysisId, r.status, r.trigger, r.startedAt]);
  }
  async updateRun(id: string, p: Partial<RunRow>) {
    await this.pool.query('update runs set status=coalesce($2,status), finished_at=coalesce($3,finished_at), error=coalesce($4,error), summary=coalesce($5,summary), result=coalesce($6,result) where id=$1', [id, p.status ?? null, p.finishedAt ?? null, p.error ?? null, p.summary ? JSON.stringify(p.summary) : null, p.result ? JSON.stringify(p.result) : null]);
  }
  async listRuns(analysisId: string) {
    const { rows } = await this.pool.query('select id,analysis_id,status,trigger,started_at,finished_at,error,summary from runs where analysis_id=$1 order by started_at desc', [analysisId]);
    return rows.map((r) => this.mapR(r));
  }
  async getRun(id: string) {
    const { rows } = await this.pool.query('select * from runs where id=$1', [id]);
    return rows[0] ? this.mapR(rows[0], true) : null;
  }
  async saveEvidence(rows: EvidenceRow[]) {
    for (const e of rows) {
      await this.pool.query('insert into evidence(run_id,id,url,sha256,fetched_at,content_type,raw) values($1,$2,$3,$4,$5,$6,$7) on conflict do nothing', [e.runId, e.id, e.url, e.sha256, e.fetchedAt, e.contentType, e.raw]);
    }
  }
  async getEvidence(runId: string, id: string) {
    const { rows } = await this.pool.query('select * from evidence where run_id=$1 and id=$2', [runId, id]);
    const r = rows[0];
    return r ? { runId: r.run_id, id: r.id, url: r.url, sha256: r.sha256, fetchedAt: iso(r.fetched_at)!, contentType: r.content_type, raw: r.raw } : null;
  }
  async listEvidence(runId: string) {
    const { rows } = await this.pool.query('select * from evidence where run_id=$1', [runId]);
    return rows.map((r) => ({ runId: r.run_id, id: r.id, url: r.url, sha256: r.sha256, fetchedAt: iso(r.fetched_at)!, contentType: r.content_type, raw: r.raw }));
  }
  async audit(a: Omit<AuditRow, 'at'>) {
    await this.pool.query('insert into audit_log(actor,action,target,details) values($1,$2,$3,$4)', [a.actor, a.action, a.target, JSON.stringify(a.details)]);
  }
  async listAudit(limit: number) {
    const { rows } = await this.pool.query('select at,actor,action,target,details from audit_log order by id desc limit $1', [limit]);
    return rows.map((r) => ({ ...r, at: iso(r.at)! }));
  }
}

export function createStore(): Store {
  return process.env.DATABASE_URL ? new PgStore(process.env.DATABASE_URL) : new MemoryStore();
}
