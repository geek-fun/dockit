import { createSessionLifecycle } from '../../src/common/sessionLifecycle';

type Ports = Parameters<typeof createSessionLifecycle>[0];
type Auth = Parameters<Ports['authenticate']>[0];
type Rotation = Parameters<Ports['applyRotation']>[0];

const fixture = (token = 'opaque-access', refreshToken = 'lease') => {
  let session = { token, refreshToken, revision: 0 };
  let auth: (_payload: Auth) => void = () => {};
  let rotation: (_payload: Rotation) => void = () => {};
  const unlisten = jest.fn();
  const ports: Ports = {
    read: () => session,
    authenticate: jest.fn(payload => {
      session = { token: payload.token, refreshToken: '', revision: session.revision + 1 };
    }),
    applyRotation: jest.fn(payload => {
      session = { ...session, token: payload.accessToken, refreshToken: payload.refreshToken };
    }),
    seed: jest.fn(async () => {}),
    hydrate: jest.fn(async () => {}),
    refresh: jest.fn(async () => {}),
    activate: jest.fn(async () => {}),
    clearCache: jest.fn(async () => {}),
    rotate: jest.fn(async () => ({ access_token: 'next-access', refresh_token: 'next-lease' })),
    listenAuth: jest.fn(async handler => {
      auth = handler;
      return unlisten;
    }),
    listenRotation: jest.fn(async handler => {
      rotation = handler;
      return unlisten;
    }),
    consumeAuth: jest.fn(async () => null),
  };
  return {
    ports,
    lifecycle: createSessionLifecycle(ports),
    unlisten,
    auth: (payload: Auth) => auth(payload),
    rotation: (payload: Rotation) => rotation(payload),
  };
};

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

describe('session startup and handoff', () => {
  it('ignores empty auth events and allows the same handoff after logout', async () => {
    const f = fixture();
    await f.lifecycle.start();
    f.auth({ token: '' });
    expect(f.ports.authenticate).not.toHaveBeenCalled();
    f.auth({ token: 'handoff' });
    await flush();
    f.ports.authenticate({ token: '' });
    f.auth({ token: 'handoff' });
    await flush();
    expect(f.ports.authenticate).toHaveBeenCalledTimes(3);
  });

  it('stops an older handoff while its seed is pending', async () => {
    const f = fixture();
    await f.lifecycle.start();
    jest.mocked(f.ports.activate).mockClear();
    let resolve!: () => void;
    jest.mocked(f.ports.seed).mockImplementationOnce(
      () =>
        new Promise(done => {
          resolve = done;
        }),
    );
    f.auth({ token: 'old' });
    f.auth({ token: 'new' });
    await flush();
    resolve();
    await flush();
    expect(f.ports.activate).toHaveBeenCalledTimes(1);
    expect(f.ports.read().token).toBe('new');
  });

  it('prefers an event login arriving while pending authentication is read', async () => {
    const f = fixture();
    jest.mocked(f.ports.consumeAuth).mockImplementation(async () => {
      f.auth({ token: 'new' });
      return null;
    });
    await f.lifecycle.start();
    expect(f.ports.hydrate).not.toHaveBeenCalled();
  });

  it('abandons old restoration when a new login arrives during hydration', async () => {
    const f = fixture();
    jest.mocked(f.ports.hydrate).mockImplementation(async () => {
      f.auth({ token: 'new' });
    });
    await f.lifecycle.start();
    await flush();
    expect(f.ports.activate).toHaveBeenCalledTimes(1);
    expect(f.ports.activate).toHaveBeenCalledWith(true);
  });

  it('does not refresh an old login after activation completes', async () => {
    const f = fixture();
    jest.mocked(f.ports.activate).mockImplementation(async () => {
      f.ports.authenticate({ token: 'new' });
    });
    await f.lifecycle.start();
    expect(f.ports.refresh).not.toHaveBeenCalled();
  });

  it('cleans up both listeners when disposed during pending auth consumption', async () => {
    const f = fixture();
    jest.mocked(f.ports.consumeAuth).mockImplementation(async () => {
      f.lifecycle.dispose();
      return { token: 'late' };
    });
    await f.lifecycle.start();
    expect(f.unlisten).toHaveBeenCalledTimes(2);
    expect(f.ports.authenticate).not.toHaveBeenCalled();
  });

  it('stops registration if disposed while the auth listener is installing', async () => {
    const f = fixture();
    jest.mocked(f.ports.listenAuth).mockImplementation(async () => {
      f.lifecycle.dispose();
      return f.unlisten;
    });
    await f.lifecycle.start();
    expect(f.unlisten).toHaveBeenCalledTimes(2);
    expect(f.ports.consumeAuth).not.toHaveBeenCalled();
  });

  it('subscribes before restoration, and activates before checking entitlement', async () => {
    const { ports, lifecycle } = fixture();
    const order: string[] = [];
    jest.mocked(ports.hydrate).mockImplementation(async () => {
      order.push('hydrate');
    });
    jest.mocked(ports.activate).mockImplementation(async () => {
      order.push('activate');
    });
    jest.mocked(ports.refresh).mockImplementation(async () => {
      order.push('refresh');
    });
    jest.mocked(ports.consumeAuth).mockImplementation(async () => {
      expect(ports.listenAuth).toHaveBeenCalled();
      expect(ports.listenRotation).toHaveBeenCalled();
      return null;
    });
    await lifecycle.start();
    expect(order).toEqual(['hydrate', 'activate', 'refresh']);
    expect(ports.rotate).not.toHaveBeenCalled();
  });

  it('consumes pending authentication before restoring an expired previous account', async () => {
    const { ports, lifecycle } = fixture();
    jest.mocked(ports.consumeAuth).mockResolvedValue({ token: 'new-login' });
    await lifecycle.start();
    expect(ports.authenticate).toHaveBeenCalledTimes(1);
    expect(ports.hydrate).not.toHaveBeenCalled();
    expect(ports.activate).toHaveBeenCalledWith(true);
  });

  it('deduplicates event and pending delivery without clearing the new lease', async () => {
    const f = fixture();
    const payload = { token: 'handoff' };
    jest.mocked(f.ports.consumeAuth).mockImplementation(async () => {
      f.auth(payload);
      return payload;
    });
    await f.lifecycle.start();
    await flush();
    expect(f.ports.authenticate).toHaveBeenCalledTimes(1);
    expect(f.ports.activate).toHaveBeenCalledTimes(1);
  });

  it('renews an expired bearer before authenticated startup work', async () => {
    const jwt = `a.${btoa(JSON.stringify({ exp: 1 }))}.s`;
    const { ports, lifecycle } = fixture(jwt);
    await lifecycle.start();
    expect(ports.rotate).toHaveBeenCalledWith('lease');
    expect(ports.applyRotation).toHaveBeenCalledWith({
      accessToken: 'next-access',
      refreshToken: 'next-lease',
      previousRefreshToken: 'lease',
    });
  });

  it('keeps reactive recovery available after a transient proactive failure', async () => {
    const f = fixture(`a.${btoa(JSON.stringify({ exp: 1 }))}.s`);
    jest.mocked(f.ports.rotate).mockRejectedValue('network timeout');
    await f.lifecycle.start();
    expect(f.ports.refresh).toHaveBeenCalledTimes(1);
  });

  it('clears leftover cache for an anonymous start and tolerates a missing pending command', async () => {
    const f = fixture('', '');
    jest.mocked(f.ports.consumeAuth).mockRejectedValue('not available');
    await f.lifecycle.start();
    expect(f.ports.clearCache).toHaveBeenCalled();
    expect(f.ports.hydrate).not.toHaveBeenCalled();
  });

  it('does not apply an old startup rotation after a new handoff', async () => {
    const f = fixture(`a.${btoa(JSON.stringify({ exp: 1 }))}.s`);
    let resolve!: (_value: { access_token: string; refresh_token: string }) => void;
    jest.mocked(f.ports.rotate).mockImplementation(
      () =>
        new Promise(done => {
          resolve = done;
        }),
    );
    const starting = f.lifecycle.start();
    await flush();
    await flush();
    f.auth({ token: 'new-login' });
    resolve({ access_token: 'old-access', refresh_token: 'old-lease' });
    await starting;
    await flush();
    expect(f.ports.applyRotation).not.toHaveBeenCalled();
    expect(f.ports.read().token).toBe('new-login');
  });

  it('delivers rotations received during restoration', async () => {
    const f = fixture();
    const payload = { accessToken: 'a', refreshToken: 'r', previousRefreshToken: 'lease' };
    jest.mocked(f.ports.hydrate).mockImplementation(async () => {
      f.rotation(payload);
    });
    await f.lifecycle.start();
    expect(f.ports.applyRotation).toHaveBeenCalledWith(payload);
  });

  it('ignores events and releases subscriptions after disposal', async () => {
    const f = fixture();
    await f.lifecycle.start();
    f.lifecycle.dispose();
    f.auth({ token: 'late' });
    f.rotation({ accessToken: 'late', refreshToken: 'late', previousRefreshToken: 'lease' });
    expect(f.unlisten).toHaveBeenCalledTimes(2);
    expect(f.ports.authenticate).not.toHaveBeenCalled();
    expect(f.ports.applyRotation).not.toHaveBeenCalled();
  });

  it('stops startup when disposed while a subscription is registering', async () => {
    const f = fixture();
    const starting = f.lifecycle.start();
    f.lifecycle.dispose();
    await starting;
    expect(f.unlisten).toHaveBeenCalledTimes(1);
    expect(f.ports.consumeAuth).not.toHaveBeenCalled();
  });
});
