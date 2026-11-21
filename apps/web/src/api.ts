import type { AnalysisResult, Identifier, RunDiff } from '@olcys/core';

export interface RunSummary {
  addresses: number;
  attributed: number;
  rejected: number;
  maxScore: number;
  indicators: number;
  evidence: number;
}
export interface Run {
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
export interface Analysis {
  id: string;
  name: string;
  identifiers: Identifier[];
  options: Record<string, unknown>;
  scheduleMinutes: number | null;
  nextRunAt: string | null;
  createdAt: string;
  createdBy: string;
  lastRun?: Run | null;
  runCount?: number;
}
export interface Meta {
  engineVersion: string;
  rulesVersion: string;
  mode: 'demo' | 'live';
  store: string;
  chainProvider: string;
  egressAllowlist: string[];
  llm: { model: string; baseUrl: string } | null;
  connectors: { id: string; title: string; accepts: string[]; compliance: string; enabled: boolean; live: boolean; kind: string }[];
  labelDatasets: { name: string; description: string; license: string; count: number }[];
  labelsCount: number;
  rates: { source: string; asOf: string; usdPln: number; usd: Record<string, number> };
  scoring: {
    rules: Record<string, unknown> & { base: Record<string, { value: number; label: string }>; identity: Record<string, { value: number; label: string }> };
    bands: { min: number; band: string; label: string }[];
  };
  activityThresholds: Record<string, number>;
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) } });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json() as Promise<T>;
}

export const api = {
  meta: () => req<Meta>('/api/meta'),
  analyses: () => req<Analysis[]>('/api/analyses'),
  analysis: (id: string) => req<{ analysis: Analysis; runs: Run[] }>(`/api/analyses/${id}`),
  create: (body: { name: string; identifiers: Identifier[]; options?: Record<string, unknown>; scheduleMinutes?: number | null }) =>
    req<{ analysis: Analysis; run: Run }>('/api/analyses', { method: 'POST', body: JSON.stringify(body) }),
  rerun: (id: string) => req<Run>(`/api/analyses/${id}/runs`, { method: 'POST', body: '{}' }),
  schedule: (id: string, scheduleMinutes: number | null) => req<{ ok: true }>(`/api/analyses/${id}`, { method: 'PATCH', body: JSON.stringify({ scheduleMinutes }) }),
  run: (id: string) => req<Run>(`/api/runs/${id}`),
  diff: (id: string) => req<{ diff: RunDiff | null; message?: string }>(`/api/runs/${id}/diff`),
  audit: () => req<{ at: string; actor: string; action: string; target: string; details: Record<string, unknown> }[]>('/api/audit'),
};
