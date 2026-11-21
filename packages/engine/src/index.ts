import { loadConfig, type EngineConfig } from './config';
import { describeConnectors } from './connectors/registry';
import { loadLabels } from './labels';
import { FALLBACK_RATES } from './rates';
import { runAnalysis, type AnalysisInput } from './pipeline';

export * from './config';
export * from './http';
export * from './evidence';
export * from './pipeline';
export * from './report';
export * from './labels';
export * from './providers';
export * from './connectors/registry';
export type { SourceConnector, HistoryConnector, ConnectorContext } from './connectors/types';

/** Fasada silnika: ładuje konfigurację, etykiety i kursy raz, uruchamia analizy. */
export function createEngine(config: EngineConfig = loadConfig()) {
  const { registry, datasets } = loadLabels(config.labelsDir);
  const rates = FALLBACK_RATES;
  return {
    config,
    labels: registry,
    datasets,
    rates,
    connectors: () => describeConnectors(config),
    run: (input: AnalysisInput) => runAnalysis(input, { config, labels: registry, labelDatasets: datasets.map((d) => ({ name: d.name, count: d.count })), rates }),
  };
}
export type Engine = ReturnType<typeof createEngine>;
