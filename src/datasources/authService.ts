import { open } from '@tauri-apps/plugin-shell';

export type AuthCallbackData = {
  token: string;
  userId?: string;
  username?: string;
  email?: string;
  avatar?: string;
};

const GEEKFUN_BASE_URL = 'https://console.geekfun.club';

// hosts a console account avatar may be served from — uploads land on the
// media OSS bucket, Google-registered accounts keep the Google CDN URL
const AVATAR_MEDIA_HOSTS = [
  'wentsen-media-store-prod.ap-southeast-1.aliyuncs.com',
  'lh3.googleusercontent.com',
  'lh4.googleusercontent.com',
  'lh5.googleusercontent.com',
  'lh6.googleusercontent.com',
];

const ALLOWED_AVATAR_HOSTS = [
  'console.geekfun.club',
  'console-geekfun.wentsen.com',
  ...AVATAR_MEDIA_HOSTS,
  ...(import.meta.env.DEV ? ['localhost'] : []),
];

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

/** Console accounts store uploaded avatars as paths relative to the console
 * origin — resolve them so `<img>` gets an absolute, allowlisted URL. */
export const resolveAvatarUrl = (raw: string): string =>
  raw.startsWith('/') ? `${GEEKFUN_BASE_URL}${raw}` : raw;

export const openLoginUrl = async (): Promise<void> => {
  await open(`${GEEKFUN_BASE_URL}/login?source=dockit`);
};

export const openRegisterUrl = async (): Promise<void> => {
  await open(`${GEEKFUN_BASE_URL}/register?source=dockit`);
};

export const openConsoleUrl = async (): Promise<void> => {
  await open(`${GEEKFUN_BASE_URL}/home`);
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
  openConsoleUrl,
  parseDeepLinkUrl,
};
