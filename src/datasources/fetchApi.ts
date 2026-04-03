import { buildAuthHeader, buildURL, CustomError, debug, jsonify } from '../common';
import { lang } from '../lang';
import { invoke } from '@tauri-apps/api/core';
import { get } from 'lodash';

type FetchApiOptions = {
  method: string;
  headers: {
    [key: string]: string | number | undefined;
  };
  agent: { ssl: boolean } | undefined;
  payload?: string;
};

const extractEsError = (data: unknown): string | null => {
  const error = get(data, 'error');
  if (!error) return null;
  if (typeof error === 'string') return error;

  const type = get(error, 'type');
  const reason = get(error, 'reason');
  if (type && reason) {
    return `${type}: ${reason}`;
  }
  if (reason) return reason;
  if (type) return type;
  try {
    const stringified = jsonify.stringify(error);
    return stringified.length > 500 ? stringified.slice(0, 500) + '...' : stringified;
  } catch {
    return null;
  }
};

const handleFetch = (result: {
  data: unknown;
  status: number;
  details: string | undefined;
  errorType?: string;
}) => {
  if (result.status >= 200 && result.status < 300) {
    return result.data;
  }
  if ([404, 400].includes(result.status)) {
    return result.data || jsonify.parse(result.details || '');
  }
  if (result.status === 401) {
    throw new CustomError(result.status, lang.global.t('connection.unAuthorized'));
  }
  if (result.status === 403) {
    const esError = extractEsError(result.data);
    throw new CustomError(result.status, esError || result.details || '');
  }

  const esError = extractEsError(result.data);
  throw new CustomError(result.status, esError || result.details || '', result.errorType);
};

const fetchWrapper = async ({
  method,
  path,
  queryParameters,
  payload,
  host,
  port,
  username,
  password,
  authType,
  apiKey,
  ssl,
}: {
  method: string;
  path?: string;
  queryParameters?: string;
  payload?: string;
  username?: string;
  password?: string;
  authType?: 'basic' | 'apiKey';
  apiKey?: string;
  host: string;
  port: number;
  ssl: boolean;
}) => {
  const url = buildURL(host, port, path, queryParameters);
  const authHeader = buildAuthHeader(authType, username, password, apiKey);
  const { data, status, details, errorType } = await fetchRequest(url, {
    method,
    headers: { ...authHeader },
    payload,
    agent: { ssl },
  });
  return handleFetch({ data, status, details, errorType });
};

const fetchRequest = async (
  url: string,
  { method, headers: inputHeaders, payload, agent: agentSslConf }: FetchApiOptions,
) => {
  const agent = { ssl: url.startsWith('https') && agentSslConf?.ssl };

  const headers = jsonify.parse(
    jsonify.stringify({ 'Content-Type': 'application/json', ...inputHeaders }),
  );
  try {
    const response = await invoke<string>('fetch_api', {
      url,
      options: { method, headers, body: payload ?? undefined, agent },
    });

    const { status, message, data } = jsonify.parse(response) as {
      status: number;
      message: string;
      data: unknown;
    };

    if (status >= 200 && status < 500) {
      return { status, details: message, data };
    }

    throw new CustomError(status, message);
  } catch (e) {
    debug('error encountered while node-fetch fetch target:', e);

    // When Rust returns Err(String), Tauri passes it as a plain string (JSON)
    if (typeof e === 'string') {
      try {
        const parsed = jsonify.parse(e) as {
          status?: number;
          message?: string;
          error_type?: string;
        };
        return {
          status: parsed.status || 500,
          details: parsed.message || e,
          errorType: parsed.error_type,
        };
      } catch {
        return { status: 500, details: e };
      }
    }

    const error = e as CustomError;
    const details = error.details || error.message;
    return {
      status: error.status || 500,
      details: typeof details === 'string' ? details : jsonify.stringify(details),
    };
  }
};

const loadHttpClient = (con: {
  host: string;
  port: number;
  username?: string;
  password?: string;
  authType?: 'basic' | 'apiKey';
  apiKey?: string;
  sslCertVerification: boolean;
}) => ({
  get: async <T = unknown>(path?: string, queryParameters?: string, payload?: string): Promise<T> =>
    fetchWrapper({
      ...con,
      method: 'GET',
      path,
      queryParameters,
      payload,
      ssl: con.sslCertVerification,
    }) as Promise<T>,
  post: async <T = unknown>(path: string, queryParameters?: string, payload?: string): Promise<T> =>
    fetchWrapper({
      ...con,
      method: 'POST',
      path,
      queryParameters,
      payload,
      ssl: con.sslCertVerification,
    }) as Promise<T>,
  put: async <T = unknown>(path: string, queryParameters?: string, payload?: string): Promise<T> =>
    fetchWrapper({
      ...con,
      method: 'PUT',
      path,
      queryParameters,
      payload,
      ssl: con.sslCertVerification,
    }) as Promise<T>,

  delete: async <T = unknown>(
    path: string,
    queryParameters?: string,
    payload?: string,
  ): Promise<T> =>
    fetchWrapper({
      ...con,
      method: 'DELETE',
      path,
      queryParameters,
      payload,
      ssl: con.sslCertVerification,
    }) as Promise<T>,
});

export { loadHttpClient };
