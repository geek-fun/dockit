import { debug } from './debug';
import { shouldRotateToken } from './sessionExpiry';

type AuthPayload = {
  token: string;
  username?: string | null;
  email?: string | null;
  userId?: string | null;
  avatar?: string | null;
  /** Signature expiry of the handoff avatar (unix seconds, absent on older consoles). */
  avatarExpiresAt?: number | null;
  ultimateExpiresAt?: string | null;
  versionLockHorizon?: string | null;
  cancelScheduledAt?: string | null;
};

type Rotation = { accessToken: string; refreshToken: string; previousRefreshToken: string };
type Unlisten = () => void;
type SessionLifecycle = {
  syncUiLocale: () => Promise<void>;
  read: () => { token: string; refreshToken: string; revision: number };
  authenticate: (payload: AuthPayload) => void;
  applyRotation: (rotation: Rotation) => void;
  seed: (payload: AuthPayload) => Promise<void>;
  hydrate: () => Promise<void>;
  refresh: () => Promise<unknown>;
  /** Avatar credential calibration — check-then-renew, own error handling. */
  ensureFreshAvatar: () => Promise<unknown>;
  activate: (force: boolean) => Promise<void>;
  clearCache: () => Promise<void>;
  rotate: (refreshToken: string) => Promise<{ access_token: string; refresh_token: string }>;
  listenAuth: (handler: (payload: AuthPayload) => void) => Promise<Unlisten>;
  listenRotation: (handler: (rotation: Rotation) => void) => Promise<Unlisten>;
  consumeAuth: () => Promise<AuthPayload | null>;
};

export const createSessionLifecycle = (ports: SessionLifecycle) => {
  let lastHandoff: { token: string; revision: number } | null = null;
  let unlisteners: Unlisten[] = [];
  let disposed = false;

  const current = (revision: number) => !disposed && ports.read().revision === revision;

  const syncUiLocale = async (): Promise<void> => {
    try {
      await ports.syncUiLocale();
    } catch (error) {
      debug('Could not sync the UI locale for device activation:', error);
    }
  };

  const handleAuth = async (payload: AuthPayload) => {
    if (disposed || !payload.token) return;
    if (lastHandoff?.token === payload.token && current(lastHandoff.revision)) return;
    ports.authenticate(payload);
    const revision = ports.read().revision;
    lastHandoff = { token: payload.token, revision };
    await ports.seed(payload);
    if (!current(revision)) return;
    await ports.activate(true);
    if (current(revision)) await ports.refresh();
    // The handoff avatar may be a stale localStorage signature (the console
    // only re-signs on its settings page) — calibrate display-only, never
    // holding up the handoff.
    if (current(revision)) void ports.ensureFreshAvatar().catch(() => {});
  };

  const register = async (subscription: Promise<Unlisten>) => {
    const unlisten = await subscription;
    if (disposed) unlisten();
    else unlisteners = [...unlisteners, unlisten];
  };

  const start = async () => {
    // A pending login can trigger device activation as soon as listeners are ready.
    await syncUiLocale();
    if (disposed) return;
    const initialRevision = ports.read().revision;
    await register(
      ports.listenRotation(rotation => {
        if (!disposed) ports.applyRotation(rotation);
      }),
    );
    if (disposed) return;
    await register(
      ports.listenAuth(payload => {
        void handleAuth(payload);
      }),
    );
    if (disposed) return;
    const pending = await ports.consumeAuth().catch(() => null);
    if (disposed) return;
    if (pending) {
      await handleAuth(pending);
      return;
    }
    if (!current(initialRevision)) return;
    if (!ports.read().token) {
      await ports.clearCache();
      return;
    }
    await ports.hydrate();
    if (!current(initialRevision)) return;
    // Parallel with the token work below — avatar staleness is a display
    // concern and must never delay session restoration.
    void ports.ensureFreshAvatar().catch(() => {});
    const session = ports.read();
    if (shouldRotateToken(session.token, session.refreshToken)) {
      try {
        const rotated = await ports.rotate(session.refreshToken);
        if (!current(initialRevision)) return;
        ports.applyRotation({
          accessToken: rotated.access_token,
          refreshToken: rotated.refresh_token,
          previousRefreshToken: session.refreshToken,
        });
      } catch {
        // The reactive request can retry transport failures or report a dead lease.
      }
    }
    if (!current(initialRevision)) return;
    await ports.activate(false);
    if (current(initialRevision)) await ports.refresh();
  };

  const dispose = () => {
    disposed = true;
    unlisteners.forEach(unlisten => unlisten());
    unlisteners = [];
  };

  return { start, dispose, syncUiLocale };
};
