import { BackendType, HttpMethod } from '../types';
import { apiSpecProvider } from '../apiSpec';
import { QueryLanguageDef, MonarchTokenRule } from './types';
import { esqlLanguage } from './esql';
import { sqlLanguage } from './sql';
import { pplLanguage } from './ppl';
import { eqlLanguage } from './eql';

const languages: QueryLanguageDef[] = [esqlLanguage, sqlLanguage, pplLanguage, eqlLanguage];

/**
 * Detect which query language applies to an endpoint.
 * Uses the API spec to find the matching endpoint, then checks against
 * registered language endpointPaths.
 */
export const detectQueryLanguage = (
  path: string | undefined,
  backend: BackendType,
  method?: HttpMethod,
  version?: string,
): QueryLanguageDef | null => {
  if (!path) return null;

  const endpoint = apiSpecProvider.findEndpoint(backend, path, method, version);
  if (!endpoint) return null;

  return (
    languages.find(
      lang => lang.backends.includes(backend) && lang.endpointPaths.includes(endpoint.path),
    ) ?? null
  );
};

/**
 * Get all registered query languages
 */
export const getAllLanguages = (): QueryLanguageDef[] => {
  return languages;
};

/**
 * Get all monarch tokens from all registered languages for use in the
 * string_literal state of the Monarch tokenizer. This ensures any
 * triple-quoted string gets language-aware highlighting.
 */
export const getAllMonarchTokens = (): MonarchTokenRule[] => {
  const seen = new Set<string>();
  const all: MonarchTokenRule[] = [];

  for (const lang of languages) {
    for (const [regex, action] of lang.monarchTokens) {
      const key = `${regex.source}||${regex.flags}`;
      if (!seen.has(key)) {
        seen.add(key);
        all.push([regex, action]);
      }
    }
  }

  return all;
};

export type { QueryLanguageDef, MonarchTokenRule } from './types';
export { esqlLanguage, sqlLanguage, pplLanguage, eqlLanguage };
