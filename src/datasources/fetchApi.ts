import { base64Encode, CustomError, debug } from '../common';
import { fetch, HttpVerb, Body } from '@tauri-apps/api/http';
import { lang } from '../lang';

type FetchApiOptions = {
  method: HttpVerb;
  headers: {
    [key: string]: string | number | undefined;
  };
  agent: { ssl: boolean } | undefined;
  payload: unknown;
};

const handleFetch = (result: { data: unknown; status: number; details: string | undefined }) => {
  if ([404, 400].includes(result.status) || (result.status >= 200 && result.status < 300)) {
    console.log('fetchApi.handleFetch', { result });
    return result.data || JSON.parse(result.details || '');
  }
  if (result.status === 401) {
    throw new CustomError(result.status, lang.global.t('connection.unAuthorized'));
  }
  throw new CustomError(result.status, result.details || '');
};

const buildURL = (host: string, port: number, path?: string, queryParameters?: string) => {
  let url = `${host}:${port}`;
  url += path ?? '';
  url += queryParameters ? `?${queryParameters}` : '';

  return url;
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
  payload?: unknown;
  username?: string;
  password?: string;
  host: string;
  port: number;
  ssl: boolean;
}) => {
  try {
    const authorization =
      username || password ? `Basic ${base64Encode(`${username}:${password}`)}` : undefined;

    const url = buildURL(host, port, path, queryParameters);
    const { data, status, details } = await fetchRequest(url, {
      method: method as HttpVerb,
      headers: { Authorization: authorization },
      payload,
      agent: { ssl },
    });
    return handleFetch({ data, status, details });
  } catch (err) {
    console.log('fetchWrapper error:', err);
    throw err;
  }
};

const fetchRequest = async (
  url: string,
  { method, headers: inputHeaders, payload, agent: agentSslConf }: FetchApiOptions,
) => {
  // const sslConfig = url.startsWith('https') ? { rejectUnauthorized: agentSslConf?.ssl } : undefined;
  // const agent = process.env.https_proxy
  //   ? new HttpsProxyAgent(process.env.https_proxy, { ...sslConfig })
  //   : undefined;

  console.log('fetchApi.fetch', { url, method, headers: inputHeaders, payload, agentSslConf });

  const headers = JSON.parse(
    JSON.stringify({ 'Content-Type': 'application/json', ...inputHeaders }),
  );
  try {
    const result = await fetch(url, {
      method,
      headers,
      body: payload ? Body.json(payload) : undefined,
      // agent,
    });
    if (result.ok) {
      const data = result.headers['content-type']?.includes('application/json')
        ? result.data
        : (result.data as string)?.split('\n')?.filter(Boolean);

      return { status: result.status, data };
    }
    console.log('fetchApi.fetch', { url, method, headers, payload, agentSslConf, result });
    throw new CustomError(result.status, result.data as string);
  } catch (e) {
    const error = typeof e == 'string' ? new CustomError(500, e) : (e as CustomError);
    const details = error.details || error.message;
    debug('error encountered while node-fetch fetch target:', e);
    console.log('error encountered while node-fetch fetch target:', {
      status: error.status || 500,
      details,
      e,
      et: typeof e,
      error,
    });
    return {
      status: error.status || 500,
      details: typeof details === 'string' ? details : JSON.stringify(details),
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
  get: async (path?: string, queryParameters?: string) =>
    fetchWrapper({
      ...con,
      method: 'GET',
      path,
      queryParameters,
      ssl: con.sslCertVerification,
    }),
  post: async (path: string, queryParameters?: string, payload?: unknown) =>
    fetchWrapper({
      ...con,
      method: 'POST',
      path,
      queryParameters,
      payload,
      ssl: con.sslCertVerification,
    }),
  put: async (path: string, queryParameters?: string, payload?: unknown) =>
    fetchWrapper({
      ...con,
      method: 'PUT',
      path,
      queryParameters,
      payload,
      ssl: con.sslCertVerification,
    }),

  delete: async (path: string, queryParameters?: string, payload?: unknown) =>
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
