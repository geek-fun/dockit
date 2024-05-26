import { CustomError } from './customError';
import { Buffer } from 'buffer';
import { lang } from '../lang';

const { fetchApi } = window;

const handleFetch = (result: { data: unknown; status: number; details: string }) => {
  if ([404, 400].includes(result.status) || (result.status >= 200 && result.status < 300)) {
    return result.data || JSON.parse(result.details);
  }
  if (result.status === 401) {
    throw new CustomError(result.status, lang.global.t('connection.unAuthorized'));
  }
  throw new CustomError(result.status, result.details);
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
  const { data, status, details } = await fetchApi.fetch(url, {
    method,
    headers: {
      authorization,
    },
    payload: payload ? JSON.stringify(payload) : undefined,
    agent: { ssl },
  });
  return handleFetch({ data, status, details });
};

export const loadHttpClient = (con: {
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
