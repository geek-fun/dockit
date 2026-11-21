import {
  configureAvatarRefresh,
  ensureFreshAvatar,
  refreshAvatar,
  type AvatarRefreshPorts,
} from '../../src/common/avatarRefresh';

const NOW_SEC = 1_800_000_000;
const MARGIN_SEC = 30 * 60;

type Fixture = {
  ports: AvatarRefreshPorts;
  read: { url: string; expiresAtSec: number };
};

const fixture = (url = '', expiresAtSec = 0): Fixture => {
  const snapshot = { url, expiresAtSec };
  const ports: AvatarRefreshPorts = {
    read: jest.fn(() => snapshot),
    apply: jest.fn((nextUrl, nextExpires) => {
      snapshot.url = nextUrl;
      snapshot.expiresAtSec = nextExpires;
    }),
    fetch: jest.fn(async () => ({
      avatarUrl: 'https://oss/fresh.webp?Expires=1',
      expiresAtSec: NOW_SEC + 3600,
    })),
  };
  configureAvatarRefresh(ports);
  return { ports, read: snapshot };
};

describe('avatarRefresh', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW_SEC * 1000);
  });

  afterEach(() => {
    configureAvatarRefresh(null);
    jest.useRealTimers();
  });

  describe('ensureFreshAvatar', () => {
    it('returns null without fetching while the credential is fresh', async () => {
      const { ports } = fixture('https://oss/current.webp?Expires=1', NOW_SEC + MARGIN_SEC + 3600);
      await expect(ensureFreshAvatar()).resolves.toBeNull();
      expect(ports.fetch).not.toHaveBeenCalled();
    });

    it('re-arms the renewal timer when the credential is fresh', async () => {
      const { ports } = fixture('https://oss/current.webp?Expires=1', NOW_SEC + MARGIN_SEC + 3600);
      await ensureFreshAvatar();
      // the timer targets expiry − margin: (NOW + 5400) − 1800 − NOW = 3600s
      jest.advanceTimersByTime(3600 * 1000);
      expect(ports.fetch).toHaveBeenCalledTimes(1);
    });

    it('refreshes an expired or missing credential and applies the result', async () => {
      const { ports, read } = fixture('https://oss/stale.webp?Expires=1', NOW_SEC - 100);
      const result = await ensureFreshAvatar();
      expect(result).toEqual({ ok: true, url: 'https://oss/fresh.webp?Expires=1', changed: true });
      expect(ports.apply).toHaveBeenCalledWith('https://oss/fresh.webp?Expires=1', NOW_SEC + 3600);
      expect(read.url).toBe('https://oss/fresh.webp?Expires=1');
    });

    it('refreshes when the URL is empty even with an active session', async () => {
      const { ports } = fixture();
      await ensureFreshAvatar();
      expect(ports.fetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('refreshAvatar', () => {
    it('deduplicates concurrent triggers into one fetch', async () => {
      const { ports } = fixture('https://oss/stale.webp?Expires=1', 0);
      const [first, second] = await Promise.all([refreshAvatar(), refreshAvatar()]);
      expect(ports.fetch).toHaveBeenCalledTimes(1);
      expect(second).toBe(first);
    });

    it('keeps the previous URL when the fetch fails', async () => {
      const { ports } = fixture('https://oss/stale.webp?Expires=1', 0);
      jest.mocked(ports.fetch).mockRejectedValueOnce(new Error('network down'));
      const result = await refreshAvatar();
      expect(result).toEqual({
        ok: false,
        url: 'https://oss/stale.webp?Expires=1',
        changed: false,
      });
      expect(ports.apply).not.toHaveBeenCalled();
    });

    it('treats an empty URL from the console as a failure', async () => {
      const { ports } = fixture('https://oss/stale.webp?Expires=1', 0);
      jest.mocked(ports.fetch).mockResolvedValueOnce({ avatarUrl: '', expiresAtSec: null });
      const result = await refreshAvatar();
      expect(result.ok).toBe(false);
      expect(ports.apply).not.toHaveBeenCalled();
    });

    it('reports an unchanged URL without treating it as a failure', async () => {
      const { ports } = fixture('https://oss/same.webp?Expires=1', 0);
      jest.mocked(ports.fetch).mockResolvedValueOnce({
        avatarUrl: 'https://oss/same.webp?Expires=1',
        expiresAtSec: NOW_SEC + 3600,
      });
      const result = await refreshAvatar();
      expect(result).toEqual({ ok: true, url: 'https://oss/same.webp?Expires=1', changed: false });
      expect(ports.apply).toHaveBeenCalledTimes(1);
    });

    it('does nothing before the ports are configured', async () => {
      configureAvatarRefresh(null);
      await expect(refreshAvatar()).resolves.toEqual({ ok: false, url: '', changed: false });
      await expect(ensureFreshAvatar()).resolves.toBeNull();
    });
  });

  describe('renewal timer', () => {
    it('renews on schedule after a successful refresh', async () => {
      const { ports } = fixture('https://oss/stale.webp?Expires=1', 0);
      await refreshAvatar();
      expect(ports.fetch).toHaveBeenCalledTimes(1);
      jest.advanceTimersByTime(3600 * 1000 - MARGIN_SEC * 1000);
      expect(ports.fetch).toHaveBeenCalledTimes(2);
    });

    it('never schedules for an unknown expiry', async () => {
      const { ports } = fixture();
      jest
        .mocked(ports.fetch)
        .mockResolvedValueOnce({ avatarUrl: 'https://oss/fresh.webp', expiresAtSec: null });
      await refreshAvatar();
      jest.advanceTimersByTime(30 * 24 * 3600 * 1000);
      expect(ports.fetch).toHaveBeenCalledTimes(1);
    });

    it('cancels pending renewals on dispose', async () => {
      const { ports } = fixture('https://oss/stale.webp?Expires=1', 0);
      await refreshAvatar();
      configureAvatarRefresh(null);
      jest.advanceTimersByTime(30 * 24 * 3600 * 1000);
      expect(ports.fetch).toHaveBeenCalledTimes(1);
    });
  });
});
