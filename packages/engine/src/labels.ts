import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LabelRegistry, type AddressLabel } from '@olcys/core';

export interface LabelDataset {
  name: string;
  description: string;
  license: string;
  count: number;
}

export function loadLabels(dir: string): { registry: LabelRegistry; datasets: LabelDataset[] } {
  const registry = new LabelRegistry();
  const datasets: LabelDataset[] = [];
  if (!existsSync(dir)) return { registry, datasets };
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) {
    const d = JSON.parse(readFileSync(join(dir, f), 'utf8')) as { name: string; description: string; license: string; labels: AddressLabel[] };
    for (const l of d.labels) registry.add({ ...l, source: `${d.name}: ${l.source}` });
    datasets.push({ name: d.name, description: d.description, license: d.license, count: d.labels.length });
  }
  return { registry, datasets };
}
