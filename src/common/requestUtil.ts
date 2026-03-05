import { base64Encode } from './base64.ts';

export const buildAuthHeader = (
  authType: 'basic' | 'apiKey' | undefined,
  username: string | undefined,
  password: string | undefined,
  apiKey?: string | undefined,
) => {
  if (authType === 'apiKey') {
    const authorization = apiKey ? `ApiKey ${apiKey}` : undefined;
    return authorization ? { authorization } : undefined;
  }
  const authorization =
    username || password
      ? `Basic ${base64Encode(`${username ?? ''}:${password ?? ''}`)}`
      : undefined;
  return authorization ? { authorization } : undefined;
};

export const buildURL = (
  host: string,
  port: number,
  path: string | undefined,
  queryParameters?: string | null,
) => {
  const trimmedPath = path?.startsWith('/') ? path.slice(1) : path;
  return `${host}:${port}${trimmedPath ? `/${trimmedPath}` : ''}${queryParameters ? `?${queryParameters}` : ''}`;
};
