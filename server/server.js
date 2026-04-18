import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || 'hex-world-secret-key-change-in-production';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || '42230238@students.liu.edu.lb';
const CLIENT_ORIGINS = (process.env.CORS_ORIGIN || process.env.CLIENT_URL || '*')
  .split(',')
  .map((origin) => normalizeOrigin(origin))
  .filter(Boolean);

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function normalizeOrigin(origin) {
  const trimmed = String(origin || '').trim();
  if (!trimmed || trimmed === '*') return trimmed;
  return trimmed.replace(/\/+$/, '');
}

function isAllowedOrigin(origin) {
  const normalizedOrigin = normalizeOrigin(origin);
  if (!normalizedOrigin) return true;
  if (CLIENT_ORIGINS.includes('*')) return true;
  return CLIENT_ORIGINS.includes(normalizedOrigin);
}

const corsOptions = {
  origin(origin, callback) {
    if (isAllowedOrigin(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error(`Origin ${origin} is not allowed by CORS.`));
  },
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: corsOptions,
});

app.use(cors(corsOptions));
app.use(express.json());

const DATA_DIR = join(__dirname, 'data');
const PLAYER_DATA_DIR = join(DATA_DIR, 'players');
const USERS_FILE = join(DATA_DIR, 'users.json');
const GAME_STATE_FILE = join(DATA_DIR, 'gameState.json');
const DB_FILE = join(DATA_DIR, 'hexworld.db');

const AUTO_COLLECT_DURATION = 1800;
const AUTO_TICK_MS = 1000;
const INITIAL_COPPER = 500;
const STARTING_TILE_COUNT = 300;
const EXPAND_EVERY_TICKS = 300;
const MAX_CHARACTER_INVENTORY = 50;
const MAX_CHARACTERS_PER_LAND = 3;

const RESOURCE_ORDER = ['wheat', 'brick', 'ore', 'wood'];

const BASE_PRODUCTION_TIME = {
  wheat: 60,
  wood: 90,
  brick: 135,
  ore: 180,
};

const STORAGE_LEVELS = [10, 30, 75, 150, 300, 600];

const RESOURCE_INFO = {
  wheat: { label: 'Wheat', basePrice: 3 },
  brick: { label: 'Brick', basePrice: 5 },
  ore: { label: 'Ore', basePrice: 6 },
  wood: { label: 'Wood', basePrice: 4 },
};

const INITIAL_MARKET = { wheat: 3, brick: 5, ore: 6, wood: 4 };
const INITIAL_LAND_PRICES = { wheat: 30, wood: 60, brick: 80, ore: 100 };
const LEGACY_LAND_PRICE_DEFAULTS = { wheat: 100, brick: 260, ore: 350, wood: 180 };

const CHEST_COSTS = {
  brown: { wheat: 240, wood: 96 },
  gold: { wheat: 480, wood: 240, brick: 144 },
  diamond: { wheat: 960, wood: 480, brick: 280, ore: 160 },
  exclusive: {},
};

const UPGRADE_COSTS = {
  1: { wheat: 20, wood: 10 },
  2: { wheat: 35, wood: 20, brick: 10 },
  3: { wheat: 60, wood: 30, brick: 22, ore: 8 },
  4: { wheat: 100, wood: 50, brick: 35, ore: 18 },
  5: { wheat: 180, wood: 90, brick: 60, ore: 35 },
};

const RARITY_META = {
  rare: { label: 'Rare', stars: 1 },
  very_rare: { label: 'Very Rare', stars: 2 },
  epic: { label: 'Epic', stars: 3 },
  mythic: { label: 'Mythic', stars: 4 },
  legendary: { label: 'Legendary', stars: 5 },
  exclusive: { label: 'Exclusive', stars: 6 },
};

const CHARACTER_TEMPLATES = [
  { id: 1, name: 'Farmer', icon: '🌾', specialty: 'wheat', ability: 'Wheat specialist' },
  { id: 2, name: 'Miner', icon: '⛏️', specialty: 'ore', ability: 'Ore specialist' },
  { id: 3, name: 'Builder', icon: '🧱', specialty: 'brick', ability: 'Brick specialist' },
  { id: 4, name: 'Forester', icon: '🌲', specialty: 'wood', ability: 'Wood specialist' },
  { id: 5, name: 'Merchant', icon: '💰', specialty: 'all', ability: 'Market enhancer' },
  { id: 6, name: 'Engineer', icon: '⚙️', specialty: 'all', ability: 'Upgrade helper' },
  { id: 7, name: 'Harvester', icon: '🚜', specialty: 'wheat', ability: 'Bulk collector' },
  { id: 8, name: 'Smelter', icon: '🔥', specialty: 'ore', ability: 'Industrial boost' },
  { id: 9, name: 'Mason', icon: '🏗️', specialty: 'brick', ability: 'Masonry boost' },
  { id: 10, name: 'Ranger', icon: '🏹', specialty: 'wood', ability: 'Forest boost' },
];

function isAdminEmail(email) {
  return normalizeEmail(email) === normalizeEmail(ADMIN_EMAIL);
}

if (!existsSync(DATA_DIR)) {
  mkdirSync(DATA_DIR);
}

if (!existsSync(PLAYER_DATA_DIR)) {
  mkdirSync(PLAYER_DATA_DIR);
}

const db = new DatabaseSync(DB_FILE);
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS users (
    email TEXT PRIMARY KEY,
    id TEXT NOT NULL UNIQUE,
    username TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    is_admin INTEGER NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS player_states (
    user_id TEXT PRIMARY KEY,
    state_json TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS app_state (
    key TEXT PRIMARY KEY,
    value_json TEXT NOT NULL
  );
`);

function loadUsers() {
  const rows = db.prepare('SELECT email, id, username, password, is_admin, created_at FROM users').all();
  return Object.fromEntries(
    rows.map((row) => [
      normalizeEmail(row.email),
      {
        id: row.id,
        email: normalizeEmail(row.email),
        username: row.username,
        password: row.password,
        isAdmin: Boolean(row.is_admin) || isAdminEmail(row.email),
        createdAt: row.created_at,
      },
    ])
  );
}

function saveUsers(users) {
  const upsertUser = db.prepare(`
    INSERT INTO users (email, id, username, password, is_admin, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(email) DO UPDATE SET
      id = excluded.id,
      username = excluded.username,
      password = excluded.password,
      is_admin = excluded.is_admin,
      created_at = excluded.created_at
  `);

  const syncUsers = db.transaction((entries) => {
    for (const user of entries) {
      const email = normalizeEmail(user.email);
      const isAdmin = Boolean(user.isAdmin) || isAdminEmail(email);

      upsertUser.run(
        email,
        user.id,
        user.username,
        user.password,
        isAdmin ? 1 : 0,
        user.createdAt
      );
    }
  });

  syncUsers(Object.values(users));
}

function randomResource() {
  return RESOURCE_ORDER[Math.floor(Math.random() * RESOURCE_ORDER.length)];
}

function keyOf(q, r) {
  return `${q},${r}`;
}

function storageCapacity(level) {
  return STORAGE_LEVELS[Math.max(0, Math.min(STORAGE_LEVELS.length - 1, level - 1))];
}

function createTile(q, r) {
  const resource = randomResource();
  return {
    id: keyOf(q, r),
    q,
    r,
    ownerId: null,
    ownerName: null,
    depleted: false,
    resource,
    timer: BASE_PRODUCTION_TIME[resource],
    stored: 0,
    storageLevel: 1,
    characters: [],
  };
}

function createInitialHexMap(tileCount = STARTING_TILE_COUNT) {
  const tiles = [];

  for (let radius = 0; tiles.length < tileCount; radius += 1) {
    if (radius === 0) {
      tiles.push(createTile(0, 0));
      continue;
    }

    for (let q = -radius; q <= radius && tiles.length < tileCount; q += 1) {
      const r1 = Math.max(-radius, -q - radius);
      const r2 = Math.min(radius, -q + radius);
      for (let r = r1; r <= r2 && tiles.length < tileCount; r += 1) {
        if (Math.max(Math.abs(q), Math.abs(r), Math.abs(-q - r)) !== radius) continue;
        tiles.push(createTile(q, r));
      }
    }
  }

  return tiles;
}

function expandMap(prev) {
  const depletedIndex = prev.findIndex((tile) => tile.depleted);
  if (depletedIndex !== -1) {
    const resource = randomResource();
    const next = [...prev];
    next[depletedIndex] = {
      ...next[depletedIndex],
      depleted: false,
      resource,
      timer: BASE_PRODUCTION_TIME[resource],
      stored: 0,
      storageLevel: 1,
      characters: [],
    };
    return next;
  }

  const occupied = new Set(prev.map((tile) => keyOf(tile.q, tile.r)));
  const neighbors = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, -1],
    [-1, 1],
  ];
  const candidates = [];

  for (const tile of prev) {
    for (const [dq, dr] of neighbors) {
      const q = tile.q + dq;
      const r = tile.r + dr;
      const id = keyOf(q, r);
      if (!occupied.has(id)) {
        candidates.push({ q, r });
      }
    }
  }

  if (!candidates.length) return prev;

  const pick = candidates[Math.floor(Math.random() * candidates.length)];
  return [...prev, createTile(pick.q, pick.r)];
}

function boostFromStars(stars) {
  const min = 0.005;
  const max = 0.1;
  const t = (stars - 1) / 4;
  const cappedT = Math.max(0, Math.min(1, t));
  return Number((min + (max - min) * cappedT).toFixed(3));
}

function rollRarityFromChest(type) {
  const roll = Math.random();

  if (type === 'exclusive') {
    if (roll < 0.001) return 'exclusive';
    if (roll < 0.2) return 'legendary';
    if (roll < 0.5) return 'mythic';
    if (roll < 0.8) return 'epic';
    return 'very_rare';
  }

  if (type === 'brown') {
    if (roll < 0.72) return 'rare';
    if (roll < 0.94) return 'very_rare';
    if (roll < 0.991) return 'epic';
    if (roll < 0.9998) return 'mythic';
    return 'legendary';
  }

  if (type === 'gold') {
    if (roll < 0.38) return 'rare';
    if (roll < 0.74) return 'very_rare';
    if (roll < 0.94) return 'epic';
    if (roll < 0.999) return 'mythic';
    return 'legendary';
  }

  if (roll < 0.16) return 'rare';
  if (roll < 0.42) return 'very_rare';
  if (roll < 0.76) return 'epic';
  if (roll < 0.995) return 'mythic';
  return 'legendary';
}

function createCharacterInstance(type) {
  const base = CHARACTER_TEMPLATES[Math.floor(Math.random() * CHARACTER_TEMPLATES.length)];
  const rarity = rollRarityFromChest(type);
  const stars = RARITY_META[rarity].stars;
  const boost = rarity === 'exclusive' ? 0.18 : boostFromStars(stars);

  let specialAbility;
  if (type === 'exclusive') {
    const roll = Math.random();
    if (roll < 0.0005) specialAbility = 'daily_copper';
    else if (roll < 0.005) specialAbility = 'auto_collect_adjacent';
    else if (roll < 0.05) specialAbility = 'auto_collect_single';
    else if (roll < 0.3) specialAbility = 'triple_production';
    else specialAbility = 'double_production';
  }

  let ability = base.ability;
  if (specialAbility === 'double_production') ability = 'Doubles production (2x speed)';
  if (specialAbility === 'triple_production') ability = 'Triples production (3x speed)';
  if (specialAbility === 'auto_collect_single') ability = 'Auto-collects from assigned land';
  if (specialAbility === 'auto_collect_adjacent') ability = 'Auto-collects from 6 adjacent lands';
  if (specialAbility === 'daily_copper') ability = 'Generates 1 copper per day';

  return {
    ...base,
    uid: Date.now() + Math.random(),
    rarity,
    stars,
    boost,
    ability,
    specialAbility,
  };
}

function getEffectiveCharacterBoost(tile, character) {
  let value = character.boost;
  if (character.specialty === tile.resource) value *= 1.7;
  else if (character.specialty === 'all') value *= 1.15;
  return value;
}

function getSynergyBonus(tile) {
  const matching = tile.characters.filter((character) => character.specialty === tile.resource).length;
  return matching * 0.01;
}

function canAfford(cost, inventory) {
  return RESOURCE_ORDER.every((resource) => (cost[resource] ?? 0) <= inventory[resource]);
}

function payCost(cost, inventory) {
  return {
    wheat: Number((inventory.wheat - (cost.wheat ?? 0)).toFixed(3)),
    brick: Number((inventory.brick - (cost.brick ?? 0)).toFixed(3)),
    ore: Number((inventory.ore - (cost.ore ?? 0)).toFixed(3)),
    wood: Number((inventory.wood - (cost.wood ?? 0)).toFixed(3)),
  };
}

function hexDistance(q1, r1, q2, r2) {
  const dq = Math.abs(q1 - q2);
  const dr = Math.abs(r1 - r2);
  const ds = Math.abs(-q1 - r1 - (-q2 - r2));
  return Math.max(dq, dr, ds);
}

function defaultInventory() {
  return { wheat: 0, brick: 0, ore: 0, wood: 0 };
}

function defaultTradeOffer() {
  return {
    inventory: defaultInventory(),
    copper: 0,
    starTokens: 0,
    nickel: 0,
    characterUids: [],
  };
}

function nextLandPriceOnBuy(resource) {
  return gameState.landPrices[resource] + 1;
}

function nextLandPriceOnSell(resource) {
  return Math.max(INITIAL_LAND_PRICES[resource], gameState.landPrices[resource] - 1);
}

function createDefaultPlayerState() {
  return {
    copper: INITIAL_COPPER,
    starTokens: 0,
    nickel: 0,
    inventory: defaultInventory(),
    charactersOwned: [],
    autoCollectActive: false,
    autoCollectTimeRemaining: 0,
  };
}

function createDefaultGameState() {
  return {
    version: 1,
    tick: 0,
    lastUpdate: Date.now(),
    map: createInitialHexMap(),
    market: { ...INITIAL_MARKET },
    landPrices: { ...INITIAL_LAND_PRICES },
    history: [{ tick: 0, ...INITIAL_MARKET }],
  };
}

function normalizeLandPrices(rawLandPrices) {
  const merged = { ...INITIAL_LAND_PRICES, ...(rawLandPrices || {}) };
  const matchesLegacyDefaults = RESOURCE_ORDER.every(
    (resource) => Number(merged[resource]) === LEGACY_LAND_PRICE_DEFAULTS[resource]
  );

  if (matchesLegacyDefaults) {
    return { ...INITIAL_LAND_PRICES };
  }

  return {
    wheat: Number(merged.wheat ?? INITIAL_LAND_PRICES.wheat),
    wood: Number(merged.wood ?? INITIAL_LAND_PRICES.wood),
    brick: Number(merged.brick ?? INITIAL_LAND_PRICES.brick),
    ore: Number(merged.ore ?? INITIAL_LAND_PRICES.ore),
  };
}

function normalizeTile(tile) {
  const resource = RESOURCE_ORDER.includes(tile?.resource) ? tile.resource : randomResource();
  return {
    id: tile.id,
    q: tile.q,
    r: tile.r,
    ownerId: tile.ownerId ?? null,
    ownerName: tile.ownerName ?? null,
    depleted: Boolean(tile.depleted),
    resource,
    timer: Number.isFinite(tile.timer) ? tile.timer : BASE_PRODUCTION_TIME[resource],
    stored: Number(tile.stored || 0),
    storageLevel: Number(tile.storageLevel || 1),
    characters: Array.isArray(tile.characters) ? tile.characters : [],
  };
}

function loadGameState() {
  try {
    const row = db.prepare('SELECT value_json FROM app_state WHERE key = ?').get('world_state');
    if (row) {
      const parsed = JSON.parse(row.value_json);
      const next = {
        ...createDefaultGameState(),
        ...parsed,
      };
      next.map = Array.isArray(parsed.map) && parsed.map.length ? parsed.map.map(normalizeTile) : createInitialHexMap();
      next.market = { ...INITIAL_MARKET, ...(parsed.market || {}) };
      next.landPrices = normalizeLandPrices(parsed.landPrices);
      next.history = Array.isArray(parsed.history) && parsed.history.length ? parsed.history : [{ tick: 0, ...INITIAL_MARKET }];
      next.version = parsed.version || 1;
      return next;
    }
  } catch (error) {
    console.error('Error loading game state:', error);
  }
  return createDefaultGameState();
}

function saveGameState(state) {
  try {
    db.prepare(`
      INSERT INTO app_state (key, value_json)
      VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json
    `).run('world_state', JSON.stringify(state));
  } catch (error) {
    console.error('Error saving game state:', error);
  }
}

function migrateLegacyJsonToDatabase() {
  const userCount = db.prepare('SELECT COUNT(*) AS count FROM users').get().count;
  const hasWorldState = db.prepare('SELECT COUNT(*) AS count FROM app_state WHERE key = ?').get('world_state').count > 0;
  const playerStateCount = db.prepare('SELECT COUNT(*) AS count FROM player_states').get().count;

  if (!userCount && existsSync(USERS_FILE)) {
    try {
      saveUsers(JSON.parse(readFileSync(USERS_FILE, 'utf8')));
    } catch (error) {
      console.error('Error migrating legacy users.json:', error);
    }
  }

  if (!hasWorldState && existsSync(GAME_STATE_FILE)) {
    try {
      const legacyGameState = JSON.parse(readFileSync(GAME_STATE_FILE, 'utf8'));
      if (legacyGameState?.players && !playerStateCount) {
        for (const [userId, playerState] of Object.entries(legacyGameState.players)) {
          savePlayerState(userId, normalizePlayerState(playerState));
        }
        delete legacyGameState.players;
      }
      saveGameState({
        ...createDefaultGameState(),
        ...legacyGameState,
      });
    } catch (error) {
      console.error('Error migrating legacy gameState.json:', error);
    }
  }

  if (!playerStateCount && existsSync(PLAYER_DATA_DIR)) {
    try {
      for (const file of readdirSync(PLAYER_DATA_DIR)) {
        if (!file.endsWith('.json')) continue;
        const userId = file.replace(/\.json$/i, '');
        const playerState = JSON.parse(readFileSync(join(PLAYER_DATA_DIR, file), 'utf8'));
        savePlayerState(userId, normalizePlayerState(playerState));
      }
    } catch (error) {
      console.error('Error migrating legacy player json files:', error);
    }
  }
}

migrateLegacyJsonToDatabase();
const users = loadUsers();
const players = new Map();
const chatHistory = [];
const MAX_CHAT_HISTORY = 100;
let gameState = loadGameState();
const playerStateCache = {};
const tradeInvites = new Map();
const activeTrades = new Map();
const mutedTradeInvites = new Map();
const TRADE_INVITE_MUTE_MS = 10 * 60 * 1000;
const TRADE_COUNTDOWN_MS = 5000;

function getUserById(userId) {
  return Object.values(users).find((user) => user.id === userId) || null;
}

function loadPlayerState(userId) {
  try {
    const row = db.prepare('SELECT state_json FROM player_states WHERE user_id = ?').get(userId);
    if (row) {
      return JSON.parse(row.state_json);
    }
  } catch (error) {
    console.error(`Error loading player state for ${userId}:`, error);
  }

  return null;
}

function savePlayerState(userId, playerState) {
  try {
    db.prepare(`
      INSERT INTO player_states (user_id, state_json)
      VALUES (?, ?)
      ON CONFLICT(user_id) DO UPDATE SET state_json = excluded.state_json
    `).run(userId, JSON.stringify(playerState));
  } catch (error) {
    console.error(`Error saving player state for ${userId}:`, error);
  }
}

function normalizePlayerState(rawPlayer) {
  const player = rawPlayer ? { ...rawPlayer } : createDefaultPlayerState();
  player.inventory = { ...defaultInventory(), ...(player.inventory || {}) };
  player.charactersOwned = Array.isArray(player.charactersOwned) ? player.charactersOwned : [];
  player.autoCollectActive = Boolean(player.autoCollectActive);
  player.autoCollectTimeRemaining = Number(player.autoCollectTimeRemaining || 0);
  player.copper = Number(player.copper ?? INITIAL_COPPER);
  player.starTokens = Number(player.starTokens ?? 0);
  player.nickel = Number(player.nickel ?? 0);
  return player;
}

function ensurePlayerState(userId) {
  if (!playerStateCache[userId]) {
    const loadedPlayer = loadPlayerState(userId);
    playerStateCache[userId] = normalizePlayerState(loadedPlayer);
  }

  return playerStateCache[userId];
}

function persistPlayerState(userId) {
  if (!playerStateCache[userId]) return;
  savePlayerState(userId, playerStateCache[userId]);
}

function persistAllPlayerStates() {
  for (const userId of Object.keys(playerStateCache)) {
    persistPlayerState(userId);
  }
}

function resetAllPlayerStates() {
  try {
    db.prepare('DELETE FROM player_states').run();
  } catch (error) {
    console.error('Error clearing player states:', error);
  }

  for (const key of Object.keys(playerStateCache)) {
    delete playerStateCache[key];
  }

  for (const user of Object.values(users)) {
    playerStateCache[user.id] = createDefaultPlayerState();
  }
}

function getPlayerSnapshot(userId) {
  return JSON.parse(JSON.stringify(ensurePlayerState(userId)));
}

function getConnectedPlayerByUserId(userId) {
  return Array.from(players.values()).find((player) => player.userId === userId) || null;
}

function getConnectedPlayerByUsername(username) {
  return Array.from(players.values()).find((player) => player.username === username) || null;
}

function emitToUser(userId, eventName, payload) {
  for (const player of players.values()) {
    if (player.userId === userId) {
      io.to(player.id).emit(eventName, payload);
    }
  }
}

function getMutedTradeInviteKey(targetUserId, fromUserId) {
  return `${targetUserId}:${fromUserId}`;
}

function isTradeInviteMuted(targetUserId, fromUserId) {
  const key = getMutedTradeInviteKey(targetUserId, fromUserId);
  const expiresAt = mutedTradeInvites.get(key);
  if (!expiresAt) return false;
  if (expiresAt <= Date.now()) {
    mutedTradeInvites.delete(key);
    return false;
  }
  return true;
}

function findTradeByUserId(userId) {
  return Array.from(activeTrades.values()).find((trade) => trade.participantIds.includes(userId)) || null;
}

function clearTradeCountdown(trade) {
  if (trade.countdownTimer) {
    clearTimeout(trade.countdownTimer);
    trade.countdownTimer = null;
  }
  trade.countdownEndsAt = null;
}

function getTradePartyView(trade, viewerUserId, subjectUserId) {
  const player = ensurePlayerState(subjectUserId);
  const user = getUserById(subjectUserId);
  const offer = trade.offers[subjectUserId] || defaultTradeOffer();
  const visibleCharacters = player.charactersOwned.filter((character) => offer.characterUids.includes(character.uid));

  return {
    userId: subjectUserId,
    username: user?.username || 'Unknown',
    accepted: Boolean(trade.accepted[subjectUserId]),
    offer,
    visibleCharacters,
  };
}

function serializeTradeForUser(trade, viewerUserId) {
  const otherUserId = trade.participantIds.find((participantId) => participantId !== viewerUserId);
  if (!otherUserId) return null;

  return {
    id: trade.id,
    status: trade.countdownEndsAt ? 'countdown' : trade.status,
    countdownEndsAt: trade.countdownEndsAt,
    self: getTradePartyView(trade, viewerUserId, viewerUserId),
    other: getTradePartyView(trade, viewerUserId, otherUserId),
    messages: trade.messages,
  };
}

function emitTradeUpdate(trade) {
  for (const participantId of trade.participantIds) {
    const payload = serializeTradeForUser(trade, participantId);
    if (payload) {
      emitToUser(participantId, 'tradeSessionUpdated', payload);
    }
  }
}

function closeTrade(tradeId, message) {
  const trade = activeTrades.get(tradeId);
  if (!trade) return;

  clearTradeCountdown(trade);
  activeTrades.delete(tradeId);

  for (const participantId of trade.participantIds) {
    emitToUser(participantId, 'tradeSessionClosed', { message });
  }
}

function playerCanCoverTradeOffer(player, offer) {
  if (offer.copper > player.copper) return false;
  if (offer.starTokens > player.starTokens) return false;
  if (offer.nickel > player.nickel) return false;

  for (const resource of RESOURCE_ORDER) {
    if ((offer.inventory[resource] || 0) > player.inventory[resource]) {
      return false;
    }
  }

  const ownedUids = new Set(player.charactersOwned.map((character) => character.uid));
  return offer.characterUids.every((uid) => ownedUids.has(uid));
}

function sanitizeTradeOffer(userId, rawOffer) {
  const player = ensurePlayerState(userId);
  const safeInventory = defaultInventory();

  for (const resource of RESOURCE_ORDER) {
    const numericValue = Number(rawOffer?.inventory?.[resource] || 0);
    const clamped = Math.max(0, Math.min(player.inventory[resource], Number.isFinite(numericValue) ? numericValue : 0));
    safeInventory[resource] = Number(clamped.toFixed(3));
  }

  const ownedUids = new Set(player.charactersOwned.map((character) => character.uid));
  const uniqueCharacterUids = [];
  for (const uid of rawOffer?.characterUids || []) {
    const numericUid = Number(uid);
    if (ownedUids.has(numericUid) && !uniqueCharacterUids.includes(numericUid)) {
      uniqueCharacterUids.push(numericUid);
    }
  }

  const clampCurrency = (value, max) => {
    const numericValue = Number(value || 0);
    if (!Number.isFinite(numericValue)) return 0;
    return Math.max(0, Math.min(max, Math.floor(numericValue)));
  };

  return {
    inventory: safeInventory,
    copper: clampCurrency(rawOffer?.copper, player.copper),
    starTokens: clampCurrency(rawOffer?.starTokens, player.starTokens),
    nickel: clampCurrency(rawOffer?.nickel, player.nickel),
    characterUids: uniqueCharacterUids,
  };
}

function finalizeTrade(tradeId) {
  const trade = activeTrades.get(tradeId);
  if (!trade) return;

  clearTradeCountdown(trade);

  const [leftUserId, rightUserId] = trade.participantIds;
  const leftPlayer = ensurePlayerState(leftUserId);
  const rightPlayer = ensurePlayerState(rightUserId);
  const leftOffer = trade.offers[leftUserId] || defaultTradeOffer();
  const rightOffer = trade.offers[rightUserId] || defaultTradeOffer();

  if (!playerCanCoverTradeOffer(leftPlayer, leftOffer) || !playerCanCoverTradeOffer(rightPlayer, rightOffer)) {
    closeTrade(tradeId, 'Trade cancelled because one player no longer had the offered items.');
    return;
  }

  const transferOffer = (fromPlayer, toPlayer, offer) => {
    for (const resource of RESOURCE_ORDER) {
      fromPlayer.inventory[resource] = Number((fromPlayer.inventory[resource] - offer.inventory[resource]).toFixed(3));
      toPlayer.inventory[resource] = Number((toPlayer.inventory[resource] + offer.inventory[resource]).toFixed(3));
    }

    fromPlayer.copper -= offer.copper;
    toPlayer.copper += offer.copper;
    fromPlayer.starTokens -= offer.starTokens;
    toPlayer.starTokens += offer.starTokens;
    fromPlayer.nickel -= offer.nickel;
    toPlayer.nickel += offer.nickel;

    if (offer.characterUids.length > 0) {
      const movingCharacters = [];
      fromPlayer.charactersOwned = fromPlayer.charactersOwned.filter((character) => {
        if (offer.characterUids.includes(character.uid)) {
          movingCharacters.push(character);
          return false;
        }
        return true;
      });
      toPlayer.charactersOwned = [...toPlayer.charactersOwned, ...movingCharacters];
    }
  };

  transferOffer(leftPlayer, rightPlayer, leftOffer);
  transferOffer(rightPlayer, leftPlayer, rightOffer);

  persistAndBroadcast();
  closeTrade(tradeId, 'Trade completed successfully.');
}

function getGameSnapshot(userId) {
  return {
    world: {
      tick: gameState.tick,
      map: gameState.map,
      market: gameState.market,
      landPrices: gameState.landPrices,
      history: gameState.history,
    },
    player: getPlayerSnapshot(userId),
  };
}

function broadcastGameStateUpdate() {
  io.emit('gameStateUpdated', {
    version: gameState.version,
    tick: gameState.tick,
  });
}

function persistAndBroadcast() {
  gameState.version += 1;
  gameState.lastUpdate = Date.now();
  saveGameState(gameState);
  persistAllPlayerStates();
  broadcastGameStateUpdate();
}

function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access denied' });
  }

  jwt.verify(token, JWT_SECRET, (error, user) => {
    if (error) {
      return res.status(403).json({ error: 'Invalid token' });
    }
    req.user = {
      ...user,
      email: normalizeEmail(user.email),
      isAdmin: isAdminEmail(user.email),
    };
    next();
  });
}

function aggregateInventory() {
  const totals = defaultInventory();

  for (const user of Object.values(users)) {
    const player = ensurePlayerState(user.id);
    for (const resource of RESOURCE_ORDER) {
      totals[resource] += Number(player.inventory?.[resource] || 0);
    }
  }

  return totals;
}

function processWorldTick() {
  const ownedTilesByPlayer = new Map();

  for (const tile of gameState.map) {
    if (!tile.ownerId) continue;
    if (!ownedTilesByPlayer.has(tile.ownerId)) {
      ownedTilesByPlayer.set(tile.ownerId, []);
    }
    ownedTilesByPlayer.get(tile.ownerId).push(tile);
  }

  for (const [playerId, ownedTiles] of ownedTilesByPlayer.entries()) {
    const player = ensurePlayerState(playerId);

    if (!player.autoCollectActive) continue;

    if (player.autoCollectTimeRemaining <= 0) {
      player.autoCollectActive = false;
      player.autoCollectTimeRemaining = 0;
      continue;
    }

    for (const tile of ownedTiles) {
      if (tile.stored >= 1) {
        tile.stored = Number((tile.stored - 1).toFixed(3));
        player.inventory[tile.resource] = Number((player.inventory[tile.resource] + 1).toFixed(3));
      }
    }

    player.autoCollectTimeRemaining -= 1;
    if (player.autoCollectTimeRemaining <= 0) {
      player.autoCollectActive = false;
      player.autoCollectTimeRemaining = 0;
    }
  }

  const prevMap = gameState.map;
  let nextMap = prevMap.map((tile) => {
    if (!tile.ownerId || tile.depleted) return tile;

    const currentTile = { ...tile };
    const owner = ensurePlayerState(tile.ownerId);

    let speedMultiplier = 1;
    let autoCollectAmount = 0;

    for (const character of tile.characters) {
      if (character.rarity !== 'exclusive') continue;
      if (character.specialAbility === 'double_production') speedMultiplier = Math.max(speedMultiplier, 2);
      if (character.specialAbility === 'triple_production') speedMultiplier = Math.max(speedMultiplier, 3);
      if (character.specialAbility === 'auto_collect_single') autoCollectAmount += tile.stored * 0.5;
    }

    if (autoCollectAmount > 0 && currentTile.stored > 0) {
      const amount = Math.min(currentTile.stored, autoCollectAmount);
      if (amount > 0.01) {
        currentTile.stored = Number((currentTile.stored - amount).toFixed(3));
        owner.inventory[currentTile.resource] = Number((owner.inventory[currentTile.resource] + amount).toFixed(3));
      }
    }

    const adjacentAutoCollect = prevMap.some((otherTile) => {
      if (!otherTile.ownerId || otherTile.id === tile.id) return false;
      if (hexDistance(otherTile.q, otherTile.r, tile.q, tile.r) !== 1) return false;
      return otherTile.characters.some((character) => character.specialAbility === 'auto_collect_adjacent');
    });

    if (adjacentAutoCollect && currentTile.stored > 0) {
      const amount = currentTile.stored * 0.25;
      currentTile.stored = Number((currentTile.stored - amount).toFixed(3));
      owner.inventory[currentTile.resource] = Number((owner.inventory[currentTile.resource] + amount).toFixed(3));
    }

    const timer = currentTile.timer - speedMultiplier;
    if (timer > 0) {
      return { ...currentTile, timer };
    }

    const cap = storageCapacity(currentTile.storageLevel);
    if (currentTile.stored >= cap) {
      return { ...currentTile, timer: BASE_PRODUCTION_TIME[currentTile.resource] };
    }

    return {
      ...currentTile,
      stored: Math.min(cap, Number((currentTile.stored + 1).toFixed(3))),
      timer: BASE_PRODUCTION_TIME[currentTile.resource],
    };
  });

  if (gameState.tick > 0 && gameState.tick % EXPAND_EVERY_TICKS === 0) {
    nextMap = expandMap(nextMap);
  }

  gameState.map = nextMap;

  if (gameState.tick > 0 && gameState.tick % 86400 === 0) {
    for (const user of Object.values(users)) {
      const player = ensurePlayerState(user.id);
      const count = player.charactersOwned.filter((character) => character.specialAbility === 'daily_copper').length;
      if (count > 0) {
        player.copper += count;
      }
    }
  }

  const totalInventory = aggregateInventory();
  const nextMarket = {};

  for (const resource of RESOURCE_ORDER) {
    const base = RESOURCE_INFO[resource].basePrice;
    const supply = Math.max(1, totalInventory[resource]);
    const scarcity = 1 / Math.pow(supply, 0.7);
    let targetPrice = base * scarcity * 500;
    const volatility = (Math.random() - 0.5) * 0.1 * targetPrice;
    targetPrice += volatility;
    targetPrice += gameState.market[resource] * 0.01;
    const price = gameState.market[resource] * 0.9 + targetPrice * 0.1;
    nextMarket[resource] = Number(Math.max(0.000001, Math.min(base * 1000, price)).toFixed(6));
  }

  gameState.market = nextMarket;
  gameState.history = [...gameState.history, { tick: gameState.tick, ...nextMarket }].slice(-40);
}

function runManualRefresh(refreshedBy = 'system') {
  gameState.tick += 1;
  processWorldTick();
  persistAndBroadcast();
  io.emit('gameTick', { tick: gameState.tick, refreshedBy });
}

function runAutoTick() {
  gameState.tick += 1;
  processWorldTick();
  persistAndBroadcast();
  io.emit('gameTick', { tick: gameState.tick, refreshedBy: 'auto' });
}

function respondWithSnapshot(res, userId, extra = {}) {
  return res.json({
    gameState: getGameSnapshot(userId),
    ...extra,
  });
}

app.post('/api/auth/register', async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || '');
    const username = String(req.body.username || '').trim();

    if (!email || !password || !username) {
      return res.status(400).json({ error: 'Email, password, and username are required' });
    }

    if (users[email]) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    for (const user of Object.values(users)) {
      if (user.username === username.trim()) {
        return res.status(409).json({ error: 'Username already taken' });
      }
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const userId = uuidv4();
    const isAdmin = isAdminEmail(email);

    users[email] = {
      id: userId,
      email,
      username,
      password: hashedPassword,
      isAdmin,
      createdAt: new Date().toISOString(),
    };

    saveUsers(users);
    ensurePlayerState(userId);
    persistPlayerState(userId);
    saveGameState(gameState);

    const token = jwt.sign(
      { userId, email, username, isAdmin },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.json({
      token,
      user: {
        id: userId,
        email,
        username,
        isAdmin,
      },
    });
  } catch (error) {
    console.error('Registration failed:', error);
    return res.status(500).json({ error: 'Server error while registering user.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const password = String(req.body.password || '');

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const user = users[email];
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const validPassword = await bcrypt.compare(password, user.password);
  if (!validPassword) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  ensurePlayerState(user.id);
  persistPlayerState(user.id);
  saveGameState(gameState);

  const token = jwt.sign(
    { userId: user.id, email, username: user.username, isAdmin: isAdminEmail(email) },
    JWT_SECRET,
    { expiresIn: '7d' }
  );

  return res.json({
    token,
    user: {
      id: user.id,
      email,
      username: user.username,
      isAdmin: isAdminEmail(email),
    },
  });
});

app.get('/api/auth/me', authenticateToken, (req, res) => {
  const user = users[normalizeEmail(req.user.email)];
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  return res.json({
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      isAdmin: isAdminEmail(user.email),
    },
  });
});

app.get('/api/game/state', (req, res) => {
  return res.json({
    tick: gameState.tick,
    version: gameState.version,
    lastUpdate: gameState.lastUpdate,
    mapTiles: gameState.map.length,
    players: Object.keys(users).length,
  });
});

app.get('/api/game/bootstrap', authenticateToken, (req, res) => {
  const user = getUserById(req.user.userId);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  ensurePlayerState(user.id);
  return res.json({
    gameState: getGameSnapshot(user.id),
    limits: {
      maxCharacterInventory: MAX_CHARACTER_INVENTORY,
      maxCharactersPerLand: MAX_CHARACTERS_PER_LAND,
      autoCollectDuration: AUTO_COLLECT_DURATION,
      storageLevels: STORAGE_LEVELS,
    },
  });
});

app.post('/api/game/refresh', authenticateToken, (req, res) => {
  if (!req.user.isAdmin) {
    return res.status(403).json({ error: 'Only admin can refresh' });
  }

  runManualRefresh(req.user.username);
  return respondWithSnapshot(res, req.user.userId, { message: 'World refreshed.' });
});

app.post('/api/game/action', authenticateToken, async (req, res) => {
  const { action, payload = {} } = req.body;
  const userId = req.user.userId;
  const player = ensurePlayerState(userId);

  try {
    switch (action) {
      case 'buyLand': {
        const tile = gameState.map.find((entry) => entry.id === payload.tileId);
        if (!tile) return res.status(404).json({ error: 'Land not found.' });
        if (tile.depleted) return res.status(409).json({ error: 'This land slot is empty and waiting to be filled again.' });
        if (tile.ownerId) return res.status(409).json({ error: 'This land is already owned.' });
        const price = gameState.landPrices[tile.resource];
        if (player.copper < price) return res.status(400).json({ error: 'Not enough copper.' });

        player.copper = Number((player.copper - price).toFixed(6));
        gameState.landPrices[tile.resource] = nextLandPriceOnBuy(tile.resource);
        tile.ownerId = userId;
        tile.ownerName = req.user.username;
        tile.depleted = false;
        tile.timer = BASE_PRODUCTION_TIME[tile.resource];
        tile.storageLevel = 1;
        tile.stored = 0;
        tile.characters = [];

        persistAndBroadcast();
        return respondWithSnapshot(res, userId, {
          message: `Bought ${tile.resource} land for ${price} copper.`,
        });
      }

      case 'burnLand': {
        const tile = gameState.map.find((entry) => entry.id === payload.tileId);
        if (!tile) return res.status(404).json({ error: 'Land not found.' });
        if (tile.ownerId !== userId) return res.status(403).json({ error: 'You do not own this land.' });

        const levelBonus = tile.storageLevel;
        const storedBonus = Math.min(4, Math.floor(tile.stored / 20));
        const tokens = Math.min(10, Math.max(1, levelBonus + storedBonus));

        player.starTokens += tokens;
        if (tile.characters.length > 0) {
          player.charactersOwned = [...player.charactersOwned, ...tile.characters];
        }

        gameState.landPrices[tile.resource] = nextLandPriceOnSell(tile.resource);
        gameState.map = gameState.map.filter((entry) => entry.id !== tile.id);

        persistAndBroadcast();
        return respondWithSnapshot(res, userId, {
          message: `Burned land for ${tokens} Star Tokens!`,
        });
      }

      case 'collectLand': {
        const tile = gameState.map.find((entry) => entry.id === payload.tileId);
        if (!tile) return res.status(404).json({ error: 'Land not found.' });
        if (tile.ownerId !== userId) return res.status(403).json({ error: 'You do not own this land.' });
        if (tile.stored <= 0) return res.status(400).json({ error: 'Nothing stored on this land.' });

        const totalBoost =
          tile.characters.reduce((sum, character) => sum + getEffectiveCharacterBoost(tile, character), 0) +
          getSynergyBonus(tile);
        const boostedAmount = Number((tile.stored * (1 + totalBoost)).toFixed(3));

        player.inventory[tile.resource] = Number((player.inventory[tile.resource] + boostedAmount).toFixed(3));
        tile.stored = 0;

        persistAndBroadcast();
        return respondWithSnapshot(res, userId, {
          message: `Collected ${boostedAmount.toFixed(3)} ${tile.resource}.`,
        });
      }

      case 'upgradeStorage': {
        const tile = gameState.map.find((entry) => entry.id === payload.tileId);
        if (!tile) return res.status(404).json({ error: 'Land not found.' });
        if (tile.ownerId !== userId) return res.status(403).json({ error: 'You do not own this land.' });

        const nextLevel = tile.storageLevel + 1;
        if (nextLevel > STORAGE_LEVELS.length) {
          return res.status(400).json({ error: 'Storage is already maxed.' });
        }

        const cost = UPGRADE_COSTS[tile.storageLevel];
        if (!canAfford(cost, player.inventory)) {
          return res.status(400).json({ error: 'Not enough materials for upgrade.' });
        }

        player.inventory = payCost(cost, player.inventory);
        tile.storageLevel = nextLevel;

        persistAndBroadcast();
        return respondWithSnapshot(res, userId, {
          message: `Upgraded storage to level ${nextLevel}.`,
        });
      }

      case 'sellResource': {
        const resource = payload.resource;
        const mode = payload.mode;
        if (!RESOURCE_ORDER.includes(resource)) {
          return res.status(400).json({ error: 'Invalid resource.' });
        }

        const currentAmount = player.inventory[resource];
        const amount = mode === 'all' ? currentAmount : 1;

        if (amount <= 0 || currentAmount < amount) {
          return res.status(400).json({ error: 'Not enough inventory.' });
        }

        player.inventory[resource] = Number((player.inventory[resource] - amount).toFixed(3));
        player.copper = Number((player.copper + amount * gameState.market[resource]).toFixed(6));

        persistAndBroadcast();
        return respondWithSnapshot(res, userId, {
          message: `Sold ${amount.toFixed(3)} ${resource}.`,
        });
      }

      case 'openChest': {
        const type = payload.type;
        if (!['brown', 'gold', 'diamond'].includes(type)) {
          return res.status(400).json({ error: 'Invalid chest type.' });
        }
        if (player.charactersOwned.length >= MAX_CHARACTER_INVENTORY) {
          return res.status(400).json({ error: 'Character inventory full.' });
        }

        const cost = CHEST_COSTS[type];
        if (!canAfford(cost, player.inventory)) {
          return res.status(400).json({ error: 'Not enough materials for this chest.' });
        }

        player.inventory = payCost(cost, player.inventory);
        const wonCharacter = createCharacterInstance(type);
        player.charactersOwned = [...player.charactersOwned, wonCharacter];
        player.nickel += RARITY_META[wonCharacter.rarity].stars;

        let message = `Opened ${type} chest.`;
        const starRoll = Math.random();
        if (starRoll < 0.01) {
          let amount = 1;
          const weight = Math.random() * 2000;
          if (weight < 1) amount = 20;
          else if (weight < 5) amount = 15;
          else if (weight < 20) amount = 10;
          else if (weight < 100) amount = 7;
          else if (weight < 500) amount = 5;
          else if (weight < 1000) amount = 3;
          else amount = 2;
          if (type === 'gold') amount = Math.min(20, amount + 2);
          if (type === 'diamond') amount = Math.min(20, amount + 5);
          player.starTokens += amount;
          message = `${message} Found ${amount} Blue Star Tokens!`;
        }

        persistAndBroadcast();
        return respondWithSnapshot(res, userId, {
          message,
          wonCharacter,
        });
      }

      case 'buyExclusive': {
        if (player.charactersOwned.length >= MAX_CHARACTER_INVENTORY) {
          return res.status(400).json({ error: 'Character inventory full.' });
        }
        if (player.starTokens < 500) {
          return res.status(400).json({ error: `Need 500 Star Tokens (have ${player.starTokens}).` });
        }

        player.starTokens -= 500;
        const wonCharacter = createCharacterInstance('exclusive');
        player.charactersOwned = [...player.charactersOwned, wonCharacter];
        player.nickel += RARITY_META[wonCharacter.rarity].stars;

        persistAndBroadcast();
        return respondWithSnapshot(res, userId, {
          message: 'Opened Exclusive Box with Star Tokens!',
          wonCharacter,
        });
      }

      case 'assignCharacter': {
        const tile = gameState.map.find((entry) => entry.id === payload.tileId);
        if (!tile) return res.status(404).json({ error: 'Land not found.' });
        if (tile.ownerId !== userId) return res.status(403).json({ error: 'You do not own this land.' });
        if (tile.characters.length >= MAX_CHARACTERS_PER_LAND) {
          return res.status(400).json({ error: 'This land is full.' });
        }

        const charIndex = player.charactersOwned.findIndex((character) => character.uid === payload.uid);
        if (charIndex === -1) {
          return res.status(404).json({ error: 'Character not found in inventory.' });
        }

        const [character] = player.charactersOwned.splice(charIndex, 1);
        tile.characters = [...tile.characters, character];

        persistAndBroadcast();
        return respondWithSnapshot(res, userId, {
          message: `${character.name} assigned to ${tile.resource} land.`,
        });
      }

      case 'removeCharacter': {
        const tile = gameState.map.find((entry) => entry.id === payload.tileId);
        if (!tile) return res.status(404).json({ error: 'Land not found.' });
        if (tile.ownerId !== userId) return res.status(403).json({ error: 'You do not own this land.' });

        const index = Number(payload.index);
        const removed = tile.characters[index];
        if (!removed) return res.status(404).json({ error: 'Character not found on land.' });

        tile.characters = tile.characters.filter((_, currentIndex) => currentIndex !== index);
        player.charactersOwned = [...player.charactersOwned, removed];

        persistAndBroadcast();
        return respondWithSnapshot(res, userId, {
          message: `${removed.name} returned to inventory.`,
        });
      }

      case 'extendAutoCollect': {
        if (player.nickel < 5) {
          return res.status(400).json({ error: 'Need 5 nickels to activate auto collect.' });
        }

        player.nickel -= 5;
        player.autoCollectActive = true;
        player.autoCollectTimeRemaining += AUTO_COLLECT_DURATION;

        persistAndBroadcast();
        return respondWithSnapshot(res, userId, {
          message: 'Auto-collect extended by 30 minutes.',
        });
      }

      case 'moveTile': {
        const tile = gameState.map.find((entry) => entry.id === payload.tileId);
        if (!tile) return res.status(404).json({ error: 'Land not found.' });
        if (tile.ownerId !== userId) return res.status(403).json({ error: 'You do not own this land.' });

        const targetQ = Number(payload.targetQ);
        const targetR = Number(payload.targetR);
        if (!Number.isFinite(targetQ) || !Number.isFinite(targetR)) {
          return res.status(400).json({ error: 'Invalid tile destination.' });
        }

        const occupied = gameState.map.some(
          (entry) => entry.id !== tile.id && entry.q === targetQ && entry.r === targetR
        );
        if (occupied) {
          return res.status(409).json({ error: 'Destination is already occupied.' });
        }

        tile.q = targetQ;
        tile.r = targetR;
        tile.id = keyOf(targetQ, targetR);

        persistAndBroadcast();
        return respondWithSnapshot(res, userId, {
          message: 'Land moved.',
        });
      }

      case 'adminResetWorld': {
        if (!req.user.isAdmin) {
          return res.status(403).json({ error: 'Only admin can reset the world.' });
        }

        const adminUser = users[normalizeEmail(req.user.email)];
        if (!adminUser) {
          return res.status(404).json({ error: 'Admin account not found.' });
        }

        const password = String(payload.password || '');
        if (!password) {
          return res.status(400).json({ error: 'Password is required to reset the world.' });
        }

        const validPassword = await bcrypt.compare(password, adminUser.password);
        if (!validPassword) {
          return res.status(401).json({ error: 'Incorrect password.' });
        }

        gameState = createDefaultGameState();
        resetAllPlayerStates();
        persistAndBroadcast();
        io.emit('gameTick', { tick: gameState.tick, refreshedBy: 'admin-reset' });

        return respondWithSnapshot(res, userId, {
          message: 'World reset complete. All land, inventory, characters, and market progress were cleared.',
        });
      }

      default:
        return res.status(400).json({ error: 'Unknown action.' });
    }
  } catch (error) {
    console.error('Game action failed:', error);
    return res.status(500).json({ error: 'Server error while processing action.' });
  }
});

app.get('/', (req, res) => {
  return res.json({
    status: 'running',
    players: players.size,
    tick: gameState.tick,
    version: gameState.version,
    uptime: process.uptime(),
  });
});

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('authenticate', (data) => {
    try {
      const decoded = jwt.verify(data.token, JWT_SECRET);
      socket.userId = decoded.userId;
      socket.username = decoded.username;
      socket.isAdmin = decoded.isAdmin;
      socket.email = decoded.email;

      ensurePlayerState(decoded.userId);

      const playerData = {
        id: socket.id,
        userId: decoded.userId,
        username: decoded.username,
        isAdmin: decoded.isAdmin,
        joinedAt: new Date(),
      };

      players.set(socket.id, playerData);

      socket.emit('authenticated', {
        success: true,
        playerId: socket.id,
        isAdmin: decoded.isAdmin,
        gameTick: gameState.tick,
        version: gameState.version,
        onlinePlayers: Array.from(players.values()),
        chatHistory,
      });

      socket.broadcast.emit('playerJoined', playerData);
      console.log(`${decoded.username} authenticated. Total players: ${players.size}`);
    } catch (error) {
      socket.emit('authenticated', { success: false, error: 'Invalid token' });
    }
  });

  socket.on('chatMessage', (data) => {
    if (!socket.userId) return;

    const messageData = {
      id: uuidv4(),
      username: socket.username,
      message: String(data.message || '').substring(0, 500),
      timestamp: new Date().toISOString(),
    };

    chatHistory.push(messageData);
    if (chatHistory.length > MAX_CHAT_HISTORY) {
      chatHistory.shift();
    }

    io.emit('newMessage', messageData);
  });

  socket.on('manualRefresh', () => {
    if (!socket.isAdmin) {
      socket.emit('error', { message: 'Only admin can refresh' });
      return;
    }

    runManualRefresh(socket.username);
    console.log(`Game refreshed by ${socket.username}. Tick: ${gameState.tick}`);
  });

  socket.on('tradeInvite', (data) => {
    if (!socket.userId) return;

    const rawTargetUserId = String(data.targetUserId || '');
    const targetUsername = String(data.targetUsername || '');
    const targetPlayer =
      (rawTargetUserId ? getConnectedPlayerByUserId(rawTargetUserId) : null) ||
      (targetUsername ? getConnectedPlayerByUsername(targetUsername) : null);

    if (!targetPlayer || !targetPlayer.userId || targetPlayer.userId === socket.userId) {
      socket.emit('error', { message: 'Invalid trade target.' });
      return;
    }

    const targetUserId = targetPlayer.userId;

    if (findTradeByUserId(socket.userId) || findTradeByUserId(targetUserId)) {
      socket.emit('error', { message: 'One of the players is already in a trade.' });
      return;
    }

    if (isTradeInviteMuted(targetUserId, socket.userId)) {
      socket.emit('error', { message: 'That player muted your trade invites for 10 minutes.' });
      return;
    }

    const existingInvite = Array.from(tradeInvites.values()).find(
      (invite) =>
        invite.fromUserId === socket.userId &&
        invite.toUserId === targetUserId
    );
    if (existingInvite) {
      socket.emit('error', { message: 'Trade invite already sent.' });
      return;
    }

    const invite = {
      id: uuidv4(),
      fromUserId: socket.userId,
      fromUsername: socket.username,
      toUserId: targetUserId,
      createdAt: new Date().toISOString(),
    };

    tradeInvites.set(invite.id, invite);
    emitToUser(targetUserId, 'tradeInviteReceived', invite);
  });

  socket.on('tradeInviteResponse', (data) => {
    if (!socket.userId) return;

    const inviteId = String(data.inviteId || '');
    const action = data.action;
    const muteForTenMinutes = Boolean(data.muteForTenMinutes);
    const invite = tradeInvites.get(inviteId);

    if (!invite || invite.toUserId !== socket.userId) {
      socket.emit('error', { message: 'Trade invite not found.' });
      return;
    }

    tradeInvites.delete(inviteId);

    if (muteForTenMinutes) {
      mutedTradeInvites.set(
        getMutedTradeInviteKey(socket.userId, invite.fromUserId),
        Date.now() + TRADE_INVITE_MUTE_MS
      );
      emitToUser(invite.fromUserId, 'tradeInviteMuted', {
        message: `${socket.username} muted your trade invites for 10 minutes.`,
      });
    }

    if (action === 'reject') {
      emitToUser(invite.fromUserId, 'tradeInviteDeclined', {
        message: `${socket.username} declined your trade invite.`,
      });
      return;
    }

    if (findTradeByUserId(invite.fromUserId) || findTradeByUserId(invite.toUserId)) {
      socket.emit('error', { message: 'One of the players is already in a trade.' });
      return;
    }

    const trade = {
      id: uuidv4(),
      participantIds: [invite.fromUserId, invite.toUserId],
      status: 'active',
      offers: {
        [invite.fromUserId]: defaultTradeOffer(),
        [invite.toUserId]: defaultTradeOffer(),
      },
      accepted: {
        [invite.fromUserId]: false,
        [invite.toUserId]: false,
      },
      messages: [],
      countdownEndsAt: null,
      countdownTimer: null,
    };

    activeTrades.set(trade.id, trade);
    emitTradeUpdate(trade);
  });

  socket.on('tradeOfferUpdate', (data) => {
    if (!socket.userId) return;

    const trade = findTradeByUserId(socket.userId);
    if (!trade) {
      socket.emit('error', { message: 'No active trade session.' });
      return;
    }

    trade.offers[socket.userId] = sanitizeTradeOffer(socket.userId, data.offer);
    trade.accepted[socket.userId] = false;
    for (const participantId of trade.participantIds) {
      trade.accepted[participantId] = false;
    }
    clearTradeCountdown(trade);
    emitTradeUpdate(trade);
  });

  socket.on('tradeSetAccepted', (data) => {
    if (!socket.userId) return;

    const trade = findTradeByUserId(socket.userId);
    if (!trade) {
      socket.emit('error', { message: 'No active trade session.' });
      return;
    }

    const accepted = Boolean(data.accepted);
    trade.accepted[socket.userId] = accepted;

    if (!accepted) {
      clearTradeCountdown(trade);
      emitTradeUpdate(trade);
      return;
    }

    const player = ensurePlayerState(socket.userId);
    const offer = trade.offers[socket.userId] || defaultTradeOffer();
    if (!playerCanCoverTradeOffer(player, offer)) {
      trade.accepted[socket.userId] = false;
      socket.emit('error', { message: 'You no longer have enough items for this offer.' });
      emitTradeUpdate(trade);
      return;
    }

    const everyoneAccepted = trade.participantIds.every((participantId) => trade.accepted[participantId]);
    if (everyoneAccepted) {
      clearTradeCountdown(trade);
      trade.countdownEndsAt = Date.now() + TRADE_COUNTDOWN_MS;
      trade.countdownTimer = setTimeout(() => finalizeTrade(trade.id), TRADE_COUNTDOWN_MS);
    }

    emitTradeUpdate(trade);
  });

  socket.on('tradeChatMessage', (data) => {
    if (!socket.userId) return;

    const trade = findTradeByUserId(socket.userId);
    if (!trade) {
      socket.emit('error', { message: 'No active trade session.' });
      return;
    }

    const messageText = String(data.message || '').trim().slice(0, 500);
    if (!messageText) return;

    trade.messages.push({
      id: uuidv4(),
      senderId: socket.userId,
      senderName: socket.username,
      message: messageText,
      timestamp: new Date().toISOString(),
    });

    emitTradeUpdate(trade);
  });

  socket.on('tradeCancel', () => {
    if (!socket.userId) return;
    const trade = findTradeByUserId(socket.userId);
    if (!trade) return;

    closeTrade(trade.id, `${socket.username} cancelled the trade.`);
  });

  socket.on('disconnect', () => {
    if (socket.userId) {
      const trade = findTradeByUserId(socket.userId);
      if (trade) {
        closeTrade(trade.id, `${socket.username} left the trade.`);
      }
    }

    const player = players.get(socket.id);
    if (!player) return;

    players.delete(socket.id);
    io.emit('playerLeft', {
      playerId: socket.id,
      username: player.username,
    });
    console.log(`${player.username} left. Total players: ${players.size}`);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Hex World Server running on port ${PORT}`);
  console.log(`WebSocket endpoint: ws://localhost:${PORT}`);
  console.log(`Admin email: ${ADMIN_EMAIL}`);
});

setInterval(() => {
  try {
    runAutoTick();
  } catch (error) {
    console.error('Automatic world tick failed:', error);
  }
}, AUTO_TICK_MS);
