import { base64Encode } from './base64.ts';

export const buildAuthHeader = (username: string | undefined, password: string | undefined) => {
  const authorization =
    username || password ? `Basic ${base64Encode(`${username}:${password}`)}` : undefined;
  return authorization ? { authorization } : undefined;
};

export const buildURL = (
  host: string,
  port: number,
  path: string | undefined,
  queryParameters?: string,
) => {
  const trimmedPath = path?.startsWith('/') ? path.slice(1) : path;
  return `${host}:${port}${trimmedPath ? `/${trimmedPath}` : ''}${queryParameters ? `?${queryParameters}` : ''}`;
};
