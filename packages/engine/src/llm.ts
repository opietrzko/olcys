/**
 * Opcjonalne wsparcie AI (KROK 4): klasyfikacja kontekstu wystąpienia adresu.
 * Uniwersalne API zgodne z OpenAI /v1/chat/completions → działa z Ollama, vLLM, LocalAI, LiteLLM (lokalnie, bez chmury).
 * Wynik AI jest WYŁĄCZNIE podpowiedzią zapisywaną obok – Wskaźnik Pewności liczony jest regułami.
 */
import type { ContextCategory } from '@olcys/core';
import type { EngineConfig } from './config';
import type { SafeFetch } from './http';

const CATEGORIES: ContextCategory[] = ['OFFICIAL_PROFILE', 'SALE_OR_SETTLEMENT', 'DISCUSSION', 'MASS_COMMENT', 'THIRD_PARTY_REFERENCE'];

export interface LlmClient {
  model: string;
  classifyContext(context: string): Promise<{ category: ContextCategory; rationale: string } | null>;
}

export function createLlmClient(config: EngineConfig, fetch: SafeFetch): LlmClient | undefined {
  const llm = config.llm;
  if (!llm) return undefined;
  return {
    model: llm.model,
    async classifyContext(context) {
      try {
        const r = await fetch(`${llm.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...(llm.apiKey ? { authorization: `Bearer ${llm.apiKey}` } : {}) },
          body: JSON.stringify({
            model: llm.model,
            temperature: 0,
            messages: [
              { role: 'system', content: `Klasyfikujesz kontekst, w jakim autor opublikował adres kryptowalutowy. Odpowiedz JSON {"category": one of ${CATEGORIES.join('|')}, "rationale": "krótko po polsku"}.` },
              { role: 'user', content: context.slice(0, 1500) },
            ],
          }),
        });
        const content = JSON.parse(r.body).choices?.[0]?.message?.content ?? '';
        const parsed = JSON.parse(content.match(/\{[\s\S]*\}/)?.[0] ?? '{}');
        return CATEGORIES.includes(parsed.category) ? { category: parsed.category, rationale: String(parsed.rationale ?? '') } : null;
      } catch {
        return null;
      }
    },
  };
}
