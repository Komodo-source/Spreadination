import {
  ApiError,
  catalogIdFromUuid,
  catalogUuid,
  clearSession,
  getLeaderboard,
  getMoney,
  isSignedIn,
  login,
  setMoney,
} from './api';

const jsonResponse = (status, payload) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => JSON.stringify(payload),
});

describe('catalog id mapping', () => {
  it('maps catalog ids to stable uuids', () => {
    expect(catalogUuid(1)).toBe('00000000-0000-4000-8000-000000000001');
    expect(catalogUuid(255)).toBe('00000000-0000-4000-8000-0000000000ff');
  });

  it('round-trips the id the API stores', () => {
    [1, 2, 200, 3630].forEach((id) => {
      expect(catalogIdFromUuid(catalogUuid(id))).toBe(id);
    });
  });

  it('rejects ids that cannot fit the uuid suffix', () => {
    expect(() => catalogUuid(-1)).toThrow();
    expect(() => catalogUuid('nope')).toThrow();
  });
});

describe('session handling', () => {
  beforeEach(() => {
    clearSession();
    global.fetch = jest.fn();
  });

  afterEach(() => {
    clearSession();
  });

  it('stores the token and player id on login', async () => {
    global.fetch.mockResolvedValue(
      jsonResponse(200, { token: 'token-abc', player: { id_player: 'player-1' } })
    );

    await login('nashou', 'hunter2hunter2');

    expect(isSignedIn()).toBe(true);
    expect(localStorage.getItem('oceanMarket.token')).toBe('token-abc');
    expect(localStorage.getItem('oceanMarket.playerId')).toBe('player-1');
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/auth/login'),
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('surfaces the server error message on a failed login', async () => {
    global.fetch.mockResolvedValue(
      jsonResponse(401, { error: 'Invalid user_name or password' })
    );

    await expect(login('nashou', 'wrong')).rejects.toThrow('Invalid user_name or password');
    expect(isSignedIn()).toBe(false);
  });

  it('reports an unreachable server', async () => {
    global.fetch.mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(login('nashou', 'hunter2hunter2')).rejects.toThrow(
      'Cannot reach the game server'
    );
  });

  it('sends the bearer token when reading player state', async () => {
    global.fetch.mockResolvedValue(
      jsonResponse(200, { token: 'token-abc', player: { id_player: 'player-1' } })
    );
    await login('nashou', 'hunter2hunter2');

    global.fetch.mockResolvedValue(jsonResponse(200, { money: 3750 }));
    await expect(getMoney()).resolves.toBe(3750);

    const [url, options] = global.fetch.mock.calls.at(-1);
    expect(url).toContain('/api/player/player-1/money');
    expect(options.headers.authorization).toBe('Bearer token-abc');
  });

  it('refuses player calls when signed out', async () => {
    await expect(setMoney(100)).rejects.toBeInstanceOf(ApiError);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe('leaderboard', () => {
  beforeEach(() => {
    clearSession();
    global.fetch = jest.fn();
  });

  afterEach(() => {
    clearSession();
  });

  it('reads the public endpoint and ranks the companies by money', async () => {
    global.fetch.mockResolvedValue(
      jsonResponse(200, {
        leaderboard: [
          { user_name: 'BlueWave', money: 1200 },
          { user_name: 'OceanCorp', money: 2500 },
        ],
      })
    );

    await expect(getLeaderboard()).resolves.toEqual([
      { name: 'OceanCorp', money: 2500 },
      { name: 'BlueWave', money: 1200 },
    ]);

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/get_leaderboard'),
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('accepts a bare array and tolerates a missing name or money', async () => {
    global.fetch.mockResolvedValue(jsonResponse(200, [{ player_name: 'Nashou' }]));

    await expect(getLeaderboard()).resolves.toEqual([{ name: 'Nashou', money: 0 }]);
  });

  it('returns an empty list for a payload it cannot read', async () => {
    global.fetch.mockResolvedValue(jsonResponse(200, { ok: true }));

    await expect(getLeaderboard()).resolves.toEqual([]);
  });
});
