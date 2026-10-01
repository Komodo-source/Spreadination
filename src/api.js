
const API_URL = "https://backend-ocean-gbj7.onrender.com"

const TOKEN_KEY = 'oceanMarket.token';
const PLAYER_ID_KEY = 'oceanMarket.playerId';

export class ApiError extends Error {
  constructor(message, status = 0, payload = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
  }
}

// ---------------------------------------------------------------------------
// Session storage
// ---------------------------------------------------------------------------

export function getToken() {
  return window.localStorage.getItem(TOKEN_KEY);
}

export function getPlayerId() {
  return window.localStorage.getItem(PLAYER_ID_KEY);
}

export function isSignedIn() {
  return Boolean(getToken() && getPlayerId());
}

export function saveSession({ token, player }) {
  window.localStorage.setItem(TOKEN_KEY, token);
  window.localStorage.setItem(PLAYER_ID_KEY, player.id_player);
  return player;
}

export function clearSession() {
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(PLAYER_ID_KEY);
}

// ---------------------------------------------------------------------------
// Catalog id <-> db uuid
// ---------------------------------------------------------------------------
//
// ports.json / vessels.json use integer ids (id_port: 1, id_vessel: 2), but
// player_port.port_id and player_vessel.vessel_id are uuid in Postgres.
// These helpers map between the two so no schema change is needed.

export function catalogUuid(catalogId) {
  const value = Number(catalogId);
  if (!Number.isInteger(value) || value < 0 || value > 0xffffffffffff) {
    throw new Error(`Catalog id out of range: ${catalogId}`);
  }
  return `00000000-0000-4000-8000-${value.toString(16).padStart(12, '0')}`;
}

export function catalogIdFromUuid(uuid) {
  const hex = String(uuid).split('-').pop();
  const value = Number.parseInt(hex, 16);
  return Number.isNaN(value) ? null : value;
}

// ---------------------------------------------------------------------------
// Request helper
// ---------------------------------------------------------------------------

async function request(path, { method = 'GET', body, auth = true } = {}) {
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';

  const token = getToken();
  if (auth && token) headers.authorization = `Bearer ${token}`;

  let response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (cause) {
    throw new ApiError('Cannot reach the game server. Is the backend running?', 0, cause);
  }

  if (response.status === 204) return null;

  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    throw new ApiError(
      (payload && payload.error) || `Request failed with status ${response.status}`,
      response.status,
      payload
    );
  }

  return payload;
}

function playerPath(suffix = '') {
  const id = getPlayerId();
  if (!id) throw new ApiError('Not signed in', 401);
  return `/api/player/${id}${suffix}`;
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export async function register(userName, pass) {
  const session = await request('/api/auth/register', {
    method: 'POST',
    body: { user_name: userName, password: pass },
    auth: false,
  });
  return saveSession(session);
}

export async function login(userName, pass) {
  const session = await request('/api/auth/login', {
    method: 'POST',
    body: { user_name: userName, password: pass},
    auth: false,
  });
  return saveSession(session);
}

export function logout() {
  clearSession();
}

export function getPlayer() {
  return request('/api/me');
}

// ---------------------------------------------------------------------------
// Player state
// ---------------------------------------------------------------------------

export async function getMoney() {
  const { money } = await request(playerPath('/money'));
  return money;
}

export async function getMoneyUnits() {
  const { money_unit } = await request(playerPath('/money_unit'));
  return money_unit;
}


export async function setMoney(money) {
  const result = await request(playerPath('/money'), { method: 'POST', body: { money } });
  return result.money;
}

// Public leaderboard: the server ranks every player by money, so it needs no player id.
// The payload shape has drifted between `{ leaderboard: [...] }`, `{ players: [...] }` and
// a bare array, so accept all three and hand the screen one predictable list.
export async function getLeaderboard() {
  const result = await request('/api/get_leaderboard', { method: 'GET'});
  return result;
}

export async function addMoney(delta) {
  const result = await request(playerPath('/money'), { method: 'POST', body: { delta } });
  return result.money;
}

export async function listPorts() {
  const { ports } = await request(playerPath('/ports'));
  return ports.map((port) => catalogIdFromUuid(port.port_id)).filter((id) => id !== null);
}

export function claimPort(catalogId) {
  return request(playerPath(`/ports/${catalogUuid(catalogId)}`), { method: 'PUT' });
}

export function releasePort(catalogId) {
  return request(playerPath(`/ports/${catalogUuid(catalogId)}`), { method: 'DELETE' });
}

export async function listVessels() {
  const { vessels } = await request(playerPath('/vessels'));
  return vessels.map((vessel) => catalogIdFromUuid(vessel.vessel_id)).filter((id) => id !== null);
}

export function acquireVessel(catalogId) {
  return request(playerPath(`/vessels/${catalogUuid(catalogId)}`), { method: 'PUT' });
}

export function releaseVessel(catalogId) {
  return request(playerPath(`/vessels/${catalogUuid(catalogId)}`), { method: 'DELETE' });
}

export { API_URL };
