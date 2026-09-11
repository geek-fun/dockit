import { open } from '@tauri-apps/plugin-shell';

export type AuthCallbackData = {
  token: string;
  userId?: string;
  username?: string;
  email?: string;
  avatar?: string;
};

const GEEKFUN_BASE_URL = 'https://console-geekfun.wentsen.com';
const GEEKFUN_LOCAL_URL = 'http://localhost:5174';

const ALLOWED_AVATAR_HOSTS = import.meta.env.DEV
  ? ['console-geekfun.wentsen.com', 'localhost']
  : ['console-geekfun.wentsen.com'];

const getGeekfunUrl = (): string => {
  const isDev = import.meta.env.DEV;
  return isDev ? GEEKFUN_LOCAL_URL : GEEKFUN_BASE_URL;
};

export const isSafeAvatarUrl = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    // Only allow exact hostname matches — no subdomain wildcards
    return (
      (parsed.protocol === 'https:' || (import.meta.env.DEV && parsed.protocol === 'http:')) &&
      ALLOWED_AVATAR_HOSTS.includes(parsed.hostname)
    );
  } catch {
    return false;
  }
};

export const openLoginUrl = async (): Promise<void> => {
  const baseUrl = getGeekfunUrl();
  const loginUrl = `${baseUrl}/login?source=dockit`;
  await open(loginUrl);
};

export const openRegisterUrl = async (): Promise<void> => {
  const baseUrl = getGeekfunUrl();
  const registerUrl = `${baseUrl}/register?source=dockit`;
  await open(registerUrl);
};

export const parseDeepLinkUrl = (url: string): AuthCallbackData | null => {
  try {
    const parsedUrl = new URL(url);

    if (!parsedUrl.protocol.startsWith('dockit')) {
      return null;
    }

    if (parsedUrl.hostname !== 'auth') {
      return null;
    }

    const token = parsedUrl.searchParams.get('token');
    if (!token) {
      return null;
    }

    return {
      token,
      userId: parsedUrl.searchParams.get('userId') || undefined,
      username: parsedUrl.searchParams.get('username') || undefined,
      email: parsedUrl.searchParams.get('email') || undefined,
      avatar: parsedUrl.searchParams.get('avatar') || undefined,
    };
  } catch {
    return null;
  }
};

export const authService = {
  openLoginUrl,
  openRegisterUrl,
  parseDeepLinkUrl,
};
