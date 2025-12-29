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

const handleFetch = (result: { data: unknown; status: number; details: string | undefined }) => {
  if(result.status >= 200 && result.status < 300) {
    return result.data;
  }
  if ([404, 400].includes(result.status)) {
    return result.data || jsonify.parse(result.details || '');
  }
  if (result.status === 401) {
    throw new CustomError(result.status, lang.global.t('connection.unAuthorized'));
  }
  if (result.status === 403) {
    throw new CustomError(result.status, get(result, 'data.error.reason', result.details || ''));
  }
  throw new CustomError(result.status, result.details || '');
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
  ssl,
}: {
  method: string;
  path?: string;
  queryParameters?: string;
  payload?: string;
  username?: string;
  password?: string;
  host: string;
  port: number;
  ssl: boolean;
}) => {
  try {
    const url = buildURL(host, port, path, queryParameters);
    const { data, status, details } = await fetchRequest(url, {
      method,
      headers: { ...buildAuthHeader(username, password) },
      payload,
      agent: { ssl },
    });
    return handleFetch({ data, status, details });
  } catch (err) {
    throw err;
  }
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
    const error = typeof e == 'string' ? new CustomError(500, e) : (e as CustomError);
    const details = error.details || error.message;
    debug('error encountered while node-fetch fetch target:', e);
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
  sslCertVerification: boolean;
}) => ({
  get: async (path?: string, queryParameters?: string, payload?: string) =>
    fetchWrapper({
      ...con,
      method: 'GET',
      path,
      queryParameters,
      payload,
      ssl: con.sslCertVerification,
    }),
  post: async (path: string, queryParameters?: string, payload?: string) =>
    fetchWrapper({
      ...con,
      method: 'POST',
      path,
      queryParameters,
      payload,
      ssl: con.sslCertVerification,
    }),
  put: async (path: string, queryParameters?: string, payload?: string) =>
    fetchWrapper({
      ...con,
      method: 'PUT',
      path,
      queryParameters,
      payload,
      ssl: con.sslCertVerification,
    }),

  delete: async (path: string, queryParameters?: string, payload?: string) =>
    fetchWrapper({
      ...con,
      method: 'DELETE',
      path,
      queryParameters,
      payload,
      ssl: con.sslCertVerification,
    }),
});

export { loadHttpClient };
