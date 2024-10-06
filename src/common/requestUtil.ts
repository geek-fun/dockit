import { base64Encode } from './base64.ts';

export const buildAuthHeader = (username: string | undefined, password: string | undefined) => {
  const authorization =
    username || password ? `Basic ${base64Encode(`${username}:${password}`)}` : undefined;
  return authorization ? { authorization } : undefined;
};

export const buildURL = (
  host: string,
  port: number,
  index: string | undefined,
  path: string | undefined,
  queryParameters?: string,
) => {
  const trimmedPath = path?.startsWith('/') ? path.slice(1) : path;
  const pathWithIndex =
    index &&
    !['_nodes', '_cluster', '_cat', '_bulk', '_aliases', '_analyze'].includes(
      trimmedPath?.split('/')[0] ?? '',
    )
      ? `${index}/${trimmedPath}`
      : `${trimmedPath}`;

  return `${host}:${port}/${pathWithIndex}${queryParameters ? `?${queryParameters}` : ''}`;
};
