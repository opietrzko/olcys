import type { EngineConfig } from '../config';
import { ensConnector } from './ens';
import { devtoConnector } from './devto';
import { githubConnector } from './github';
import { githubCodeConnector } from './github-code';
import { redditConnector } from './reddit';
import { gravatarConnector } from './gravatar';
import { keybaseConnector } from './keybase';
import { searxngConnector } from './search';
import { telegramConnector } from './telegram';
import type { HistoryConnector, SourceConnector } from './types';
import { waybackConnector } from './wayback';
import { webConnector } from './web';

/** Rejestr konektorów. Dodanie źródła = dopisanie konektora do tej listy. */
export const ALL_CONNECTORS: SourceConnector[] = [githubConnector, githubCodeConnector, devtoConnector, redditConnector, keybaseConnector, gravatarConnector, webConnector, telegramConnector, ensConnector, searxngConnector];
export const HISTORY_CONNECTORS: HistoryConnector[] = [waybackConnector];

export function describeConnectors(config: EngineConfig) {
  return [
    ...ALL_CONNECTORS.map((c) => ({ id: c.id, title: c.title, accepts: c.accepts, compliance: c.compliance, enabled: c.enabled(config), live: c.isLive(config), kind: 'source' as const })),
    ...HISTORY_CONNECTORS.map((c) => ({ id: c.id, title: c.title, accepts: ['url'], compliance: c.compliance, enabled: true, live: c.isLive(config), kind: 'history' as const })),
  ];
}
