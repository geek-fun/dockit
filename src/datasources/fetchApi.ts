import { CustomError, debug } from '../common';
import { fetch, HttpVerb } from '@tauri-apps/api/http';
import { lang } from '../lang';

type FetchApiOptions = {
  method: HttpVerb;
  headers: {
    [key: string]: string | number | undefined;
  };
  agent: { ssl: boolean } | undefined;
  payload: string | undefined;
};

const handleFetch = (result: { data: unknown; status: number; details: string | undefined }) => {
  if ([404, 400].includes(result.status) || (result.status >= 200 && result.status < 300)) {
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
  payload?: string;
  username?: string;
  password?: string;
  host: string;
  port: number;
  ssl: boolean;
}) => {
  const authorization =
    username || password
      ? `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`
      : undefined;

  const url = buildURL(host, port, path, queryParameters);
  const { data, status, details } = await fetchRequest(url, {
    method: method as HttpVerb,
    headers: { authorization },
    payload: payload ? JSON.stringify(payload) : undefined,
    agent: { ssl },
  });
  return handleFetch({ data, status, details });
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
      body: payload ? JSON.parse(payload) : undefined,
      // agent,
    });
    if (result.ok) {
      const data = result.headers['content-type']?.includes('application/json')
        ? result.data
        : (result.data as string)?.split('\n')?.filter(Boolean);

      return { status: result.status, data };
    }
    throw new CustomError(result.status, result.data as string);
  } catch (e) {
    const error = e as CustomError;
    debug('error encountered while node-fetch fetch target:', e);
    console.log('error encountered while node-fetch fetch target:', e);
    return { status: error.status || 500, details: error.details || error.message };
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
