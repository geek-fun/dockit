import { CustomError } from './customError';

const catchHandler = (err: unknown) => {
  if (err instanceof CustomError) {
    throw new CustomError(err.status, err.details);
  }
  if (err instanceof Error) {
    throw new CustomError(500, err.message);
  }
  throw new CustomError(500, `unknown error, trace: ${JSON.stringify(err)}`);
};

const buildURL = (host: string, port: number, path?: string, queryParameters?: string) => {
  let url = `${host}:${port}`;
  url += path ?? '';
  url += queryParameters ? `?${queryParameters}` : '';

  return url;
};

export const loadHttpClient = (host: string, port: number) => ({
  get: async (path?: string, queryParameters?: string) => {
    const url = buildURL(host, port, path, queryParameters);
    try {
      const result = await fetch(url, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await result.json();
      if (!result.ok) new CustomError(result.status, data);

      return data;
    } catch (e) {
      throw catchHandler(e);
    }
  },
  post: async (path: string, queryParameters?: string, payload?: unknown) => {
    const url = buildURL(host, port, path, queryParameters);
    try {
      const result = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload ? JSON.stringify(payload) : undefined,
      });
      const data = await result.json();
      if (!result.ok) new CustomError(result.status, data);
      return data;
    } catch (e) {
      throw catchHandler(e);
    }
  },
  put: async (path: string, queryParameters?: string, payload?: unknown) => {
    const url = buildURL(host, port, path, queryParameters);
    try {
      const result = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: payload ? JSON.stringify(payload) : undefined,
      });
      const data = await result.json();
      if (!result.ok) new CustomError(result.status, data);
      return data;
    } catch (e) {
      throw catchHandler(e);
    }
  },

  delete: async (path: string, queryParameters?: string, payload?: unknown) => {
    const url = buildURL(host, port, path, queryParameters);
    try {
      const result = await fetch(url, {
        method: 'delete',
        headers: { 'Content-Type': 'application/json' },
        body: payload ? JSON.stringify(payload) : undefined,
      });
      const data = await result.json();
      if (!result.ok) new CustomError(result.status, data);
      return data;
    } catch (e) {
      throw catchHandler(e);
    }
  },
});
