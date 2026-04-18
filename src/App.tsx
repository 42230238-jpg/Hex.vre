import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Chat } from './components/Chat';
import { Auth } from './components/Auth';
import { useAuth } from './hooks/useAuth';
import { useGameState } from './hooks/useGameState';
import { useSocket } from './hooks/useSocket';
import { SERVER_CONFIG_ERROR, SERVER_URL } from './config';
import type {
  Character,
  ChestType,
  GameActionResult,
  HistoryPoint,
  InventoryState,
  LandPriceState,
  MarketState,
  Rarity,
  ResourceCost,
  ResourceType,
  SpecialAbility,
  Tile,
  TradeOffer,
} from './gameTypes';

const AUTO_COLLECT_DURATION = 1800;
const HEX_SIZE = 34;
const TILE_HEIGHT = 16;
const MAX_CHARACTER_INVENTORY = 50;
const MAX_CHARACTERS_PER_LAND = 3;

const STORAGE_LEVELS = [10, 30, 75, 150, 300, 600];

const RESOURCE_INFO: Record<ResourceType, { label: string; color: string; dark: string; side: string; basePrice: number }> = {
  wheat: { label: 'Wheat', color: '#facc15', dark: '#ca8a04', side: '#a16207', basePrice: 3 },
  brick: { label: 'Brick', color: '#ef4444', dark: '#b91c1c', side: '#7f1d1d', basePrice: 5 },
  ore: { label: 'Ore', color: '#d1d5db', dark: '#9ca3af', side: '#6b7280', basePrice: 6 },
  wood: { label: 'Wood', color: '#166534', dark: '#14532d', side: '#0f3d24', basePrice: 4 },
};

const RESOURCE_ORDER: ResourceType[] = ['wheat', 'brick', 'ore', 'wood'];

const RARITY_META: Record<Rarity, { label: string; stars: number; color: string }> = {
  rare: { label: 'Rare', stars: 1, color: '#22c55e' },
  very_rare: { label: 'Very Rare', stars: 2, color: '#3b82f6' },
  epic: { label: 'Epic', stars: 3, color: '#a855f7' },
  mythic: { label: 'Mythic', stars: 4, color: '#ef4444' },
  legendary: { label: 'Legendary', stars: 5, color: '#eab308' },
  exclusive: { label: 'Exclusive', stars: 6, color: '#f97316' },
};

const CHARACTER_TEMPLATES = [
  { id: 1, name: 'Farmer', icon: '🌾', specialty: 'wheat' as const, ability: 'Wheat specialist' },
  { id: 2, name: 'Miner', icon: '⛏️', specialty: 'ore' as const, ability: 'Ore specialist' },
  { id: 3, name: 'Builder', icon: '🧱', specialty: 'brick' as const, ability: 'Brick specialist' },
  { id: 4, name: 'Forester', icon: '🌲', specialty: 'wood' as const, ability: 'Wood specialist' },
  { id: 5, name: 'Merchant', icon: '💰', specialty: 'all' as const, ability: 'Market enhancer' },
  { id: 6, name: 'Engineer', icon: '⚙️', specialty: 'all' as const, ability: 'Upgrade helper' },
  { id: 7, name: 'Harvester', icon: '🚜', specialty: 'wheat' as const, ability: 'Bulk collector' },
  { id: 8, name: 'Smelter', icon: '🔥', specialty: 'ore' as const, ability: 'Industrial boost' },
  { id: 9, name: 'Mason', icon: '🏗️', specialty: 'brick' as const, ability: 'Masonry boost' },
  { id: 10, name: 'Ranger', icon: '🏹', specialty: 'wood' as const, ability: 'Forest boost' },
] as const;

const CHEST_COSTS: Record<ChestType, ResourceCost> = {
  brown: { wheat: 240, wood: 96 },
  gold: { wheat: 480, wood: 240, brick: 144 },
  diamond: { wheat: 960, wood: 480, brick: 280, ore: 160 },
  exclusive: {},
};

const UPGRADE_COSTS: Record<number, ResourceCost> = {
  1: { wheat: 20, wood: 10 },
  2: { wheat: 35, wood: 20, brick: 10 },
  3: { wheat: 60, wood: 30, brick: 22, ore: 8 },
  4: { wheat: 100, wood: 50, brick: 35, ore: 18 },
  5: { wheat: 180, wood: 90, brick: 60, ore: 35 },
};

function storageCapacity(level: number) {
  return STORAGE_LEVELS[Math.max(0, Math.min(STORAGE_LEVELS.length - 1, level - 1))];
}

function hexToPixel(q: number, r: number) {
  const x = HEX_SIZE * Math.sqrt(3) * (q + r / 2);
  const y = HEX_SIZE * 1.5 * r;
  return { x, y };
}

function topPoints(size: number) {
  return `0,${-size} ${size * 0.866},${-size / 2} ${size * 0.866},${size / 2} 0,${size} ${-size * 0.866},${size / 2} ${-size * 0.866},${-size / 2}`;
}

function boostFromStars(stars: number) {
  const min = 0.005;
  const max = 0.1;
  const t = (stars - 1) / 4;
  const cappedT = Math.max(0, Math.min(1, t));
  return Number((min + (max - min) * cappedT).toFixed(3));
}

function rollRarityFromChest(type: ChestType): Rarity {
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

function createPreviewCharacter(type: ChestType): Character {
  const base = CHARACTER_TEMPLATES[Math.floor(Math.random() * CHARACTER_TEMPLATES.length)];
  const rarity = rollRarityFromChest(type);
  const stars = RARITY_META[rarity].stars;
  const boost = rarity === 'exclusive' ? 0.18 : boostFromStars(stars);

  let specialAbility: SpecialAbility | undefined;
  if (type === 'exclusive') {
    const roll = Math.random();
    if (roll < 0.0005) specialAbility = 'daily_copper';
    else if (roll < 0.005) specialAbility = 'auto_collect_adjacent';
    else if (roll < 0.05) specialAbility = 'auto_collect_single';
    else if (roll < 0.3) specialAbility = 'triple_production';
    else specialAbility = 'double_production';
  }

  let ability: string = base.ability;
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

function getEffectiveCharacterBoost(tile: Tile, character: Character) {
  let value = character.boost;
  if (character.specialty === tile.resource) value *= 1.7;
  else if (character.specialty === 'all') value *= 1.15;
  return value;
}

function getSynergyBonus(tile: Tile) {
  const matching = tile.characters.filter((character) => character.specialty === tile.resource).length;
  return matching * 0.01;
}

function canAfford(cost: ResourceCost, inventory: InventoryState) {
  return RESOURCE_ORDER.every((resource) => (cost[resource] ?? 0) <= inventory[resource]);
}

function darkerFill(tile: Tile, selectedId: string | null, currentUserId: string | undefined) {
  if (tile.depleted) return '#111827';
  if (tile.ownerId === currentUserId) return RESOURCE_INFO[tile.resource].color;
  if (tile.ownerId) return RESOURCE_INFO[tile.resource].dark;
  if (selectedId === tile.id) return '#2a2a2a';
  return '#000000';
}

function formatTime(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`;
}

const EMPTY_INVENTORY: InventoryState = { wheat: 0, brick: 0, ore: 0, wood: 0 };
const EMPTY_MARKET: MarketState = { wheat: 3, brick: 5, ore: 6, wood: 4 };
const EMPTY_LAND_PRICES: LandPriceState = { wheat: 30, wood: 60, brick: 80, ore: 100 };
const EMPTY_HISTORY: HistoryPoint[] = [{ minute: 0, label: '00:00', wheat: 3, brick: 5, ore: 6, wood: 4 }];

export default function HexLandGame() {
  const { user, token, isAuthenticated, isAdmin, loading: authLoading, error: authError, login, register, logout } = useAuth();
  const {
    isConnected,
    username,
    messages,
    onlinePlayers,
    gameTick: socketTick,
    gameStateVersion,
    activeTrade,
    incomingTradeInvite,
    error,
    sendMessage,
    manualRefreshServer,
    inviteToTrade,
    respondToTradeInvite,
    updateTradeOffer,
    setTradeAccepted,
    sendTradeMessage,
    cancelTrade,
    clearSocketError,
    clearIncomingTradeInvite,
  } = useSocket(token, user);
  const { gameState, loading: gameLoading, error: gameError, runAction } = useGameState(token, gameStateVersion);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [camera, setCamera] = useState({ x: 0, y: 0, scale: 1 });
  const [status, setStatus] = useState('Build sinks, not just sources.');
  const [rolling, setRolling] = useState(false);
  const [rollPreview, setRollPreview] = useState<Character[]>([]);
  const [wonCharacter, setWonCharacter] = useState<Character | null>(null);
  const [showCharInv, setShowCharInv] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetPassword, setResetPassword] = useState('');
  const [resettingWorld, setResettingWorld] = useState(false);
  const [tradeMessage, setTradeMessage] = useState('');
  const [muteTradeInviter, setMuteTradeInviter] = useState(false);
  const [tradeCountdown, setTradeCountdown] = useState(0);

  const dragMode = useRef<'map' | 'owned' | null>(null);
  const lastMouse = useRef({ x: 0, y: 0 });
  const movedTileId = useRef<string | null>(null);
  const dragTileOrigin = useRef<{ q: number; r: number } | null>(null);
  const dragTileDelta = useRef({ dx: 0, dy: 0 });

  const map = gameState?.world.map ?? [];
  const tick = gameState?.world.tick ?? socketTick ?? 0;
  const market = gameState?.world.market ?? EMPTY_MARKET;
  const landPrices = gameState?.world.landPrices ?? EMPTY_LAND_PRICES;
  const history = gameState?.world.history ?? EMPTY_HISTORY;
  const player = gameState?.player;
  const copper = player?.copper ?? 0;
  const starTokens = player?.starTokens ?? 0;
  const nickel = player?.nickel ?? 0;
  const inventory = player?.inventory ?? EMPTY_INVENTORY;
  const charactersOwned = player?.charactersOwned ?? [];
  const autoCollectActive = player?.autoCollectActive ?? false;
  const autoCollectTimeRemaining = player?.autoCollectTimeRemaining ?? 0;
  const tradeOffer = activeTrade?.self.offer ?? null;

  const selectedTile = useMemo(() => map.find((tile) => tile.id === selectedId) ?? null, [map, selectedId]);
  const ownedTiles = useMemo(() => map.filter((tile) => tile.ownerId === user?.id), [map, user?.id]);
  const ownedCount = ownedTiles.length;

  useEffect(() => {
    if (selectedId && !map.some((tile) => tile.id === selectedId)) {
      setSelectedId(null);
    }
  }, [map, selectedId]);

  useEffect(() => {
    if (error) {
      setStatus(error);
      clearSocketError();
    }
  }, [error, clearSocketError]);

  useEffect(() => {
    if (activeTrade?.status !== 'countdown') {
      setTradeCountdown(0);
      return;
    }

    let remainingMs = Math.max(0, activeTrade.countdownRemainingMs ?? 0);
    setTradeCountdown(Math.max(0, Math.ceil(remainingMs / 1000)));

    const intervalId = window.setInterval(() => {
      remainingMs = Math.max(0, remainingMs - 250);
      setTradeCountdown(Math.max(0, Math.ceil(remainingMs / 1000)));
    }, 250);

    return () => window.clearInterval(intervalId);
  }, [activeTrade?.countdownRemainingMs, activeTrade?.status]);

  const worldBounds = useMemo(() => {
    if (!map.length) return { minX: -500, minY: -500, width: 1000, height: 1000 };
    const pixels = map.map((tile) => hexToPixel(tile.q, tile.r));
    const minX = Math.min(...pixels.map((point) => point.x)) - 220;
    const maxX = Math.max(...pixels.map((point) => point.x)) + 220;
    const minY = Math.min(...pixels.map((point) => point.y)) - 180;
    const maxY = Math.max(...pixels.map((point) => point.y)) + 220;
    return { minX, minY, width: maxX - minX, height: maxY - minY };
  }, [map]);

  const selectedUpgradeCost = selectedTile && selectedTile.ownerId === user?.id ? UPGRADE_COSTS[selectedTile.storageLevel] : null;
  const selectedCollectBoost =
    selectedTile && selectedTile.ownerId === user?.id
      ? selectedTile.characters.reduce((sum, character) => sum + getEffectiveCharacterBoost(selectedTile, character), 0) +
        getSynergyBonus(selectedTile)
      : 0;
  const selectedProjectedCollectAmount =
    selectedTile && selectedTile.ownerId === user?.id
      ? Number((selectedTile.stored * (1 + selectedCollectBoost)).toFixed(3))
      : 0;

  async function runGameAction(action: string, payload: Record<string, unknown> = {}) {
    const result = await runAction(action, payload);
    setStatus(result.ok ? result.message || 'World updated.' : result.error || 'Action failed.');
    return result;
  }

  async function buySelectedLand() {
    if (!selectedTile || selectedTile.ownerId) return;
    await runGameAction('buyLand', { tileId: selectedTile.id });
  }

  async function burnSelectedLand() {
    if (!selectedTile || selectedTile.ownerId !== user?.id) return;
    const result = await runGameAction('burnLand', { tileId: selectedTile.id });
    if (result.ok) {
      setSelectedId(null);
    }
  }

  async function sellSelectedLand() {
    if (!selectedTile || selectedTile.ownerId !== user?.id) return;
    await runGameAction('sellLand', { tileId: selectedTile.id });
  }

  async function collectSelectedLand() {
    if (!selectedTile || selectedTile.ownerId !== user?.id || selectedTile.stored <= 0) return;
    await runGameAction('collectLand', { tileId: selectedTile.id });
  }

  async function upgradeSelectedStorage() {
    if (!selectedTile || selectedTile.ownerId !== user?.id) return;
    await runGameAction('upgradeStorage', { tileId: selectedTile.id });
  }

  async function sellOne(resource: ResourceType) {
    await runGameAction('sellResource', { resource, mode: 'one' });
  }

  async function sellAll(resource: ResourceType) {
    await runGameAction('sellResource', { resource, mode: 'all' });
  }

  async function finishChestAnimation(actionPromise: Promise<GameActionResult & { ok: boolean }>) {
    const result = await actionPromise;
    window.setTimeout(() => {
      if (!result.ok) {
        setRolling(false);
        setStatus(result.error || 'Chest opening failed.');
        return;
      }

      if (result.wonCharacter) {
        setWonCharacter(result.wonCharacter);
      }
      setRolling(false);
      setStatus(result.message || 'Chest opened.');
    }, 1400);
  }

  function openChest(type: ChestType) {
    if (rolling) return;
    if (type === 'exclusive') {
      setStatus('Use Star Tokens to buy Exclusive boxes.');
      return;
    }

    if (charactersOwned.length >= MAX_CHARACTER_INVENTORY) {
      setStatus('Character inventory full.');
      return;
    }

    setRolling(true);
    setWonCharacter(null);
    setRollPreview(Array.from({ length: 12 }, () => createPreviewCharacter(type)));
    void finishChestAnimation(runAction('openChest', { type }));
  }

  function buyExclusiveWithStars() {
    if (rolling) return;
    if (charactersOwned.length >= MAX_CHARACTER_INVENTORY) {
      setStatus('Character inventory full.');
      return;
    }

    setRolling(true);
    setWonCharacter(null);
    setRollPreview(Array.from({ length: 12 }, () => createPreviewCharacter('exclusive')));
    void finishChestAnimation(runAction('buyExclusive'));
  }

  async function assignCharacterToLand(character: Character, tileId: string) {
    await runGameAction('assignCharacter', { uid: character.uid, tileId });
  }

  async function removeCharacterFromLand(tileId: string, index: number) {
    await runGameAction('removeCharacter', { tileId, index });
  }

  function manualRefresh() {
    if (!isAdmin) return;
    manualRefreshServer();
  }

  async function confirmWorldReset() {
    if (!resetPassword.trim()) {
      setStatus('Enter your password to confirm the reset.');
      return;
    }

    setResettingWorld(true);
    const result = await runAction('adminResetWorld', { password: resetPassword });
    setResettingWorld(false);

    if (result.ok) {
      setShowResetModal(false);
      setResetPassword('');
      setSelectedId(null);
      setStatus(result.message || 'World reset complete.');
      return;
    }

    setStatus(result.error || 'World reset failed.');
  }

  function buildTradeOffer(nextOffer?: Partial<TradeOffer>): TradeOffer {
    return {
      inventory: {
        wheat: nextOffer?.inventory?.wheat ?? tradeOffer?.inventory.wheat ?? 0,
        brick: nextOffer?.inventory?.brick ?? tradeOffer?.inventory.brick ?? 0,
        ore: nextOffer?.inventory?.ore ?? tradeOffer?.inventory.ore ?? 0,
        wood: nextOffer?.inventory?.wood ?? tradeOffer?.inventory.wood ?? 0,
      },
      copper: nextOffer?.copper ?? tradeOffer?.copper ?? 0,
      starTokens: nextOffer?.starTokens ?? tradeOffer?.starTokens ?? 0,
      nickel: nextOffer?.nickel ?? tradeOffer?.nickel ?? 0,
      characterUids: nextOffer?.characterUids ?? tradeOffer?.characterUids ?? [],
    };
  }

  function setTradeOfferInventory(resource: ResourceType, value: number) {
    updateTradeOffer(
      buildTradeOffer({
        inventory: {
          ...buildTradeOffer().inventory,
          [resource]: Math.max(0, Number.isFinite(value) ? value : 0),
        },
      })
    );
  }

  function setTradeOfferCurrency(field: 'copper' | 'starTokens' | 'nickel', value: number) {
    updateTradeOffer(
      buildTradeOffer({
        [field]: Math.max(0, Number.isFinite(value) ? Math.floor(value) : 0),
      })
    );
  }

  function toggleTradeOfferCharacter(uid: number) {
    const current = buildTradeOffer().characterUids;
    updateTradeOffer(
      buildTradeOffer({
        characterUids: current.includes(uid)
          ? current.filter((currentUid) => currentUid !== uid)
          : [...current, uid],
      })
    );
  }

  function onBoardMouseDown(e: React.MouseEvent) {
    lastMouse.current = { x: e.clientX, y: e.clientY };
    dragMode.current = 'map';
  }

  function startOwnedTileDrag(e: React.MouseEvent, tileId: string) {
    e.stopPropagation();
    const tile = map.find((entry) => entry.id === tileId);
    if (!tile || tile.ownerId !== user?.id) return;

    dragMode.current = 'owned';
    movedTileId.current = tileId;
    dragTileOrigin.current = { q: tile.q, r: tile.r };
    dragTileDelta.current = { dx: 0, dy: 0 };
    lastMouse.current = { x: e.clientX, y: e.clientY };
  }

  function onBoardMouseMove(e: React.MouseEvent) {
    const dx = e.clientX - lastMouse.current.x;
    const dy = e.clientY - lastMouse.current.y;
    lastMouse.current = { x: e.clientX, y: e.clientY };

    if (dragMode.current === 'map') {
      setCamera((prev) => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
      return;
    }

    if (dragMode.current === 'owned' && movedTileId.current) {
      dragTileDelta.current = {
        dx: dragTileDelta.current.dx + dx,
        dy: dragTileDelta.current.dy + dy,
      };
    }
  }

  function onBoardMouseUp() {
    if (dragMode.current === 'owned' && movedTileId.current && dragTileOrigin.current) {
      const dq = Math.round(dragTileDelta.current.dx / (HEX_SIZE * 1.7));
      const dr = Math.round(dragTileDelta.current.dy / (HEX_SIZE * 1.5));

      if (dq !== 0 || dr !== 0) {
        void runGameAction('moveTile', {
          tileId: movedTileId.current,
          targetQ: dragTileOrigin.current.q + dq,
          targetR: dragTileOrigin.current.r + dr,
        });
      }
    }

    dragMode.current = null;
    movedTileId.current = null;
    dragTileOrigin.current = null;
    dragTileDelta.current = { dx: 0, dy: 0 };
  }

  function onWheel(e: React.WheelEvent) {
    e.preventDefault();
    setCamera((prev) => ({ ...prev, scale: Math.max(0.45, Math.min(2.2, prev.scale - e.deltaY * 0.001)) }));
  }

  function renderHex3D(tile: Tile) {
    const { x, y } = hexToPixel(tile.q, tile.r);
    const info = RESOURCE_INFO[tile.resource];
    const fill = darkerFill(tile, selectedId, user?.id);
    const selected = selectedId === tile.id;
    const mine = tile.ownerId === user?.id;
    const ownedByOther = Boolean(tile.ownerId) && tile.ownerId !== user?.id;
    const depleted = Boolean(tile.depleted);
    const totalBoost = tile.characters.reduce((sum, character) => sum + getEffectiveCharacterBoost(tile, character), 0) + getSynergyBonus(tile);
    const hasDouble = tile.characters.some((character) => character.specialAbility === 'double_production');
    const hasTriple = tile.characters.some((character) => character.specialAbility === 'triple_production');
    const hasAuto = tile.characters.some((character) => character.specialAbility === 'auto_collect_single');

    let speedMult = 1;
    if (hasTriple) speedMult = 3;
    else if (hasDouble) speedMult = 2;
    const effectiveTimer = Math.ceil(tile.timer / speedMult);

    return (
      <g
        key={tile.id}
        transform={`translate(${x}, ${y})`}
        onClick={(e) => {
          e.stopPropagation();
          setSelectedId(tile.id);
        }}
        onMouseDown={(e) => mine && !depleted && startOwnedTileDrag(e, tile.id)}
        style={{ cursor: mine && !depleted ? 'grab' : 'pointer' }}
      >
        <polygon points={`${-HEX_SIZE * 0.866},${HEX_SIZE / 2} 0,${HEX_SIZE} 0,${HEX_SIZE + TILE_HEIGHT} ${-HEX_SIZE * 0.866},${HEX_SIZE / 2 + TILE_HEIGHT}`} fill={depleted ? '#0f172a' : mine ? info.side : '#111'} />
        <polygon points={`0,${HEX_SIZE} ${HEX_SIZE * 0.866},${HEX_SIZE / 2} ${HEX_SIZE * 0.866},${HEX_SIZE / 2 + TILE_HEIGHT} 0,${HEX_SIZE + TILE_HEIGHT}`} fill={depleted ? '#1e293b' : mine ? info.dark : '#1b1b1b'} />
        <polygon points={topPoints(HEX_SIZE)} fill={fill} stroke={selected ? '#60a5fa' : '#404040'} strokeWidth={selected ? 3 : 1.2} />

        {depleted && (
          <>
            <text x={0} y={-4} textAnchor="middle" fontSize="9" fill="#cbd5e1" fontWeight={700}>Empty</text>
            <text x={0} y={10} textAnchor="middle" fontSize="8" fill="#94a3b8" fontWeight={700}>Waiting to refill</text>
          </>
        )}

        {!tile.ownerId && !depleted && (
          <>
            <text x={0} y={-4} textAnchor="middle" fontSize="9" fill="#d4d4d4" fontWeight={700}>{info.label}</text>
            <text x={0} y={10} textAnchor="middle" fontSize="10" fill="#fff" fontWeight={800}>{landPrices[tile.resource]}c</text>
          </>
        )}

        {tile.ownerId && !depleted && (
          <>
            <text x={0} y={0} textAnchor="middle" fontSize="10" fill="#111" fontWeight={800}>{info.label}</text>
            <text x={0} y={14} textAnchor="middle" fontSize="9" fill="#111" fontWeight={700}>{effectiveTimer}s</text>
            <text x={0} y={26} textAnchor="middle" fontSize="8" fill="#111" fontWeight={700}>
              {Number((tile.stored * (1 + totalBoost)).toFixed(1))}/{storageCapacity(tile.storageLevel)}
            </text>
            {totalBoost > 0 && <text x={0} y={36} textAnchor="middle" fontSize="8" fill="#111" fontWeight={800}>+{Math.round(totalBoost * 100)}%</text>}
            {hasTriple && <text x={0} y={-20} textAnchor="middle" fontSize="12" fill="#f97316" fontWeight="bold">3x</text>}
            {!hasTriple && hasDouble && <text x={0} y={-20} textAnchor="middle" fontSize="12" fill="#f97316" fontWeight="bold">2x</text>}
            {hasAuto && <text x={0} y={-8} textAnchor="middle" fontSize="8" fill="#3b82f6">AUTO</text>}
            {ownedByOther && (
              <text x={0} y={-30} textAnchor="middle" fontSize="8" fill="#e2e8f0" fontWeight={700}>
                {tile.ownerName}
              </text>
            )}
          </>
        )}
      </g>
    );
  }

  if (!isAuthenticated) {
    return <Auth onLogin={login} onRegister={register} error={authError} loading={authLoading} />;
  }

  if (SERVER_CONFIG_ERROR) {
    return (
      <div className="min-h-screen bg-[#0b1020] flex items-center justify-center text-white p-5">
        <div className="max-w-xl rounded-2xl border border-red-500/30 bg-slate-900 px-6 py-5">
          <div className="text-lg font-bold text-red-300">Deployment setup incomplete</div>
          <div className="mt-2 text-sm text-slate-200">{SERVER_CONFIG_ERROR}</div>
          <div className="mt-3 text-xs text-slate-400">
            Current site: {typeof window !== 'undefined' ? window.location.origin : 'unknown'}
          </div>
        </div>
      </div>
    );
  }

  if (authLoading || gameLoading || !gameState) {
    return (
      <div className="min-h-screen bg-[#0b1020] flex items-center justify-center text-white">
        <div className="max-w-xl rounded-2xl border border-slate-800 bg-slate-900 px-6 py-5">
          <div>{gameError || 'Loading shared world...'}</div>
          {gameError && (
            <div className="mt-3 text-xs text-slate-400">
              Backend URL: {SERVER_URL || 'missing'}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0b1020] text-white p-5">
      <div className="mx-auto max-w-7xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold">Hex World</h1>
            <span className="text-sm text-slate-400">Welcome, {user?.username}</span>
            <span className="text-xs text-slate-500">Shared world mode</span>
            {isAdmin && (
              <>
                <button onClick={manualRefresh} className="ml-2 rounded-xl bg-red-600 px-3 py-1 text-sm font-bold hover:bg-red-500">
                  Global Refresh (Tick: {tick})
                </button>
                <button onClick={() => setShowResetModal(true)} className="rounded-xl bg-red-950 px-3 py-1 text-sm font-bold hover:bg-red-900">
                  Reset World
                </button>
              </>
            )}
          </div>
          <div className="flex flex-wrap gap-3 items-center">
            <div className="rounded-xl bg-slate-900 px-4 py-2">Copper: <b className="text-yellow-300">{copper.toFixed(6)}</b></div>
            <div className="rounded-xl bg-slate-900 px-4 py-2">Owned: <b>{ownedCount}</b></div>
            <div className="rounded-xl bg-blue-900 px-4 py-2">Star Tokens: <b className="text-blue-200">{starTokens}</b></div>
            <div className="rounded-xl bg-gray-700 px-4 py-2">Nickel: <b className="text-gray-300">{nickel}</b></div>
            <div className="rounded-xl bg-slate-900 px-4 py-2 text-sm text-slate-200">{status}</div>
            <button onClick={logout} className="rounded-xl bg-red-800 px-3 py-2 text-sm hover:bg-red-700">Logout</button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.6fr_1fr]">
          <div className="rounded-2xl border border-slate-800 bg-[#09111f] p-3">
            <div className="mb-2 text-sm text-slate-300">
              Drag to move map, scroll to zoom, drag your own owned hex to reposition.
              {autoCollectActive && <span className="ml-2 text-green-400 font-bold">AUTO-COLLECT ACTIVE ({formatTime(autoCollectTimeRemaining)})</span>}
            </div>
            <div className="h-[720px] w-full overflow-hidden rounded-2xl border border-slate-800 bg-[radial-gradient(circle_at_top,_#17233f,_#050812)]" onMouseDown={onBoardMouseDown} onMouseMove={onBoardMouseMove} onMouseUp={onBoardMouseUp} onMouseLeave={onBoardMouseUp} onWheel={onWheel}>
              <svg width="100%" height="100%" viewBox={`${worldBounds.minX - camera.x} ${worldBounds.minY - camera.y} ${worldBounds.width / camera.scale} ${worldBounds.height / camera.scale}`}>
                {map.slice().sort((a, b) => a.r - b.r || a.q - b.q).map((tile) => renderHex3D(tile))}
              </svg>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
              <h2 className="mb-3 text-lg font-semibold">Selected Land</h2>
              {selectedTile ? (
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between"><span>Type</span><b style={{ color: RESOURCE_INFO[selectedTile.resource].color }}>{RESOURCE_INFO[selectedTile.resource].label}</b></div>
                  <div className="flex justify-between">
                    <span>Status</span>
                    <b>
                      {selectedTile.depleted
                        ? 'Empty slot'
                        : !selectedTile.ownerId
                          ? 'For sale'
                          : selectedTile.ownerId === user?.id
                            ? 'Owned by you'
                            : `Owned by ${selectedTile.ownerName}`}
                    </b>
                  </div>
                  {!selectedTile.depleted && <div className="flex justify-between"><span>Price</span><b>{landPrices[selectedTile.resource]}c</b></div>}
                  {selectedTile.ownerId && !selectedTile.depleted && (
                    <>
                      <div className="flex justify-between"><span>Next drop</span><b>{selectedTile.timer}s</b></div>
                      <div className="flex justify-between"><span>Stored</span><b>{selectedTile.stored.toFixed(3)}</b></div>
                      <div className="flex justify-between"><span>Projected collect</span><b>{selectedProjectedCollectAmount.toFixed(3)}</b></div>
                      <div className="flex justify-between"><span>Storage</span><b>L{selectedTile.storageLevel} / {storageCapacity(selectedTile.storageLevel)}</b></div>
                    </>
                  )}
                  {selectedTile.ownerId === user?.id && !selectedTile.depleted && (
                    <div className="flex justify-between"><span>Collect bonus</span><b>+{Math.round(selectedCollectBoost * 100)}%</b></div>
                  )}

                  {selectedTile.depleted ? (
                    <div className="rounded-xl bg-slate-950 p-3 text-slate-300">
                      This land was burned and is now an empty slot. It cannot be bought until world expansion fills it again.
                    </div>
                  ) : !selectedTile.ownerId ? (
                    <button className="w-full rounded-xl bg-blue-600 px-4 py-2 disabled:opacity-50" onClick={buySelectedLand} disabled={copper < landPrices[selectedTile.resource]}>Buy</button>
                  ) : selectedTile.ownerId === user?.id ? (
                    <>
                      <button className="w-full rounded-xl bg-emerald-700 px-4 py-2 disabled:opacity-50" onClick={collectSelectedLand} disabled={selectedTile.stored <= 0}>Collect Stored</button>
                      <button className="w-full rounded-xl bg-orange-700 px-4 py-2 disabled:opacity-50" onClick={upgradeSelectedStorage} disabled={!selectedUpgradeCost || !canAfford(selectedUpgradeCost, inventory) || selectedTile.storageLevel >= STORAGE_LEVELS.length}>Upgrade Storage</button>
                      <button className="w-full rounded-xl bg-red-800 px-4 py-2 hover:bg-red-700" onClick={burnSelectedLand}>Burn Land (Get 1-10 Star Tokens)</button>
                      <button className="w-full rounded-xl bg-yellow-500 px-4 py-2 font-bold text-black hover:bg-yellow-400" onClick={sellSelectedLand}>
                        Sell Land
                      </button>
                      <div className="text-xs text-slate-400">Selling returns 90% of the current land price. Burning returns assigned characters and grants Star Tokens.</div>
                      {selectedUpgradeCost && selectedTile.storageLevel < STORAGE_LEVELS.length && (
                        <div className="text-xs text-slate-300">Upgrade cost: {RESOURCE_ORDER.map((resource) => (selectedUpgradeCost[resource] ? `${resource}:${selectedUpgradeCost[resource]} ` : '')).join('')}</div>
                      )}
                      <div>
                        <div className="mb-2 text-xs text-slate-300">Characters: {selectedTile.characters.length}/{MAX_CHARACTERS_PER_LAND}</div>
                        {selectedTile.characters.map((character, index) => (
                          <div key={character.uid} className="mb-1 flex justify-between text-xs">
                            <span style={{ color: RARITY_META[character.rarity].color }}>
                              {character.icon} {character.name} - {RARITY_META[character.rarity].label} ({character.stars}*)
                              {character.specialAbility && <span className="ml-1 text-orange-400">[{character.ability}]</span>}
                            </span>
                            <button onClick={() => removeCharacterFromLand(selectedTile.id, index)}>Remove</button>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="rounded-xl bg-slate-950 p-3 text-slate-300">This land belongs to {selectedTile.ownerName}. You can inspect it, but only the owner can manage it.</div>
                  )}
                </div>
              ) : (
                <div className="text-sm text-slate-400">Click a hex to inspect it.</div>
              )}
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
              <h2 className="mb-3 text-lg font-semibold">Inventory & Sell</h2>
              {RESOURCE_ORDER.map((resource) => (
                <div key={resource} className="mb-2 rounded-xl bg-slate-950 p-3">
                  <div className="flex justify-between text-sm"><b style={{ color: RESOURCE_INFO[resource].color }}>{RESOURCE_INFO[resource].label}</b><span>{inventory[resource].toFixed(3)}</span></div>
                  <div className="mt-1 flex items-center justify-between">
                    <span className="text-xs text-slate-400">{market[resource].toFixed(6)} c</span>
                    <div className="flex gap-2">
                      <button className="rounded bg-emerald-600 px-2 py-1" onClick={() => sellOne(resource)} disabled={inventory[resource] < 1}>Sell 1</button>
                      <button className="rounded bg-yellow-600 px-2 py-1" onClick={() => sellAll(resource)} disabled={inventory[resource] <= 0}>Sell All</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
              <h2 className="mb-3 text-lg font-semibold">Boxes & Costs</h2>
              <div className="space-y-2 text-sm">
                <button className="w-full rounded bg-yellow-800 py-2" onClick={() => openChest('brown')} disabled={!canAfford(CHEST_COSTS.brown, inventory) || rolling || charactersOwned.length >= MAX_CHARACTER_INVENTORY}>Brown - wheat 240 / wood 96</button>
                <button className="w-full rounded bg-yellow-500 py-2 text-black" onClick={() => openChest('gold')} disabled={!canAfford(CHEST_COSTS.gold, inventory) || rolling || charactersOwned.length >= MAX_CHARACTER_INVENTORY}>Gold - wheat 480 / wood 240 / brick 144</button>
                <button className="w-full rounded bg-cyan-400 py-2 text-black" onClick={() => openChest('diamond')} disabled={!canAfford(CHEST_COSTS.diamond, inventory) || rolling || charactersOwned.length >= MAX_CHARACTER_INVENTORY}>Diamond - wheat 960 / wood 480 / brick 280 / ore 160</button>
                <button className="w-full rounded bg-blue-600 py-2 text-white disabled:opacity-50" onClick={buyExclusiveWithStars} disabled={starTokens < 500 || rolling || charactersOwned.length >= MAX_CHARACTER_INVENTORY}>Buy Exclusive (500 Star Tokens)</button>
              </div>
              <div className="mt-2 text-xs text-slate-400">Exclusive characters have special abilities: 2x/3x speed, auto-collect, and daily copper.</div>
              <div className="mt-1 text-xs text-slate-400">You own {charactersOwned.length} / {MAX_CHARACTER_INVENTORY} characters</div>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
              <h2 className="mb-3 text-lg font-semibold">Market</h2>
              <div className="h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={history}>
                    <CartesianGrid stroke="#22304d" strokeDasharray="3 3" />
                    <XAxis dataKey="label" stroke="#94a3b8" minTickGap={28} />
                    <YAxis stroke="#94a3b8" />
                    <Tooltip />
                    <Area type="monotone" dataKey="wheat" stroke="#facc15" fill="#facc15" fillOpacity={0.1} />
                    <Area type="monotone" dataKey="brick" stroke="#ef4444" fill="#ef4444" fillOpacity={0.1} />
                    <Area type="monotone" dataKey="ore" stroke="#d1d5db" fill="#d1d5db" fillOpacity={0.1} />
                    <Area type="monotone" dataKey="wood" stroke="#166534" fill="#166534" fillOpacity={0.1} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
              <h2 className="mb-3 text-lg font-semibold">Auto Collect</h2>
              {!autoCollectActive ? (
                <>
                  <button className="w-full rounded-xl bg-green-600 px-4 py-3 font-bold hover:bg-green-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed" onClick={() => void runGameAction('extendAutoCollect')} disabled={nickel < 5}>
                    Start Auto Collect (30 min) - 5 nickels
                  </button>
                  {nickel < 5 && <div className="text-xs text-red-400 mt-2">Need 5 nickels to activate</div>}
                </>
              ) : (
                <div className="p-3 bg-green-900/30 border border-green-600 rounded text-center">
                  <div className="text-green-400 font-bold text-lg">Auto-Collect Running</div>
                  <div className="text-xs text-green-300 mt-1">Collecting from stored output every tick, with character bonuses applied.</div>
                  <div className="text-sm text-green-300 mt-2">Time remaining: {formatTime(autoCollectTimeRemaining)}</div>
                  <div className="w-full bg-green-900 h-2 rounded-full mt-2">
                    <div className="bg-green-500 h-2 rounded-full transition-all" style={{ width: `${Math.min(100, (autoCollectTimeRemaining / AUTO_COLLECT_DURATION) * 100)}%` }} />
                  </div>
                  <button className="mt-3 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold hover:bg-blue-500 disabled:opacity-50" onClick={() => void runGameAction('extendAutoCollect')} disabled={nickel < 5}>
                    + Add 30 min (5 nickels)
                  </button>
                </div>
              )}
              <div className="text-xs text-slate-400 mt-2">5 nickels = 30 min auto-collect (stacks on the server)</div>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
              <h2 className="mb-3 text-lg font-semibold">Land Markets</h2>
              <div className="space-y-1 text-sm">
                {RESOURCE_ORDER.map((resource) => (
                  <div key={resource} className="flex justify-between"><span>{RESOURCE_INFO[resource].label} land</span><b>{landPrices[resource]} copper</b></div>
                ))}
              </div>
              <button className="mt-3 w-full rounded-xl bg-indigo-700 py-2" onClick={() => setShowCharInv(true)}>Open Character Inventory</button>
            </div>

            <Chat
              isConnected={isConnected}
              username={username}
              messages={messages}
              onlinePlayers={onlinePlayers}
              error={null}
              onJoin={() => {}}
              onSendMessage={sendMessage}
              onTradeInvite={(player) => {
                if (player.userId === user?.id) return;
                inviteToTrade({ userId: player.userId, username: player.username });
                setStatus(`Trade invite sent to ${player.username}.`);
              }}
            />
          </div>
        </div>

        {(rolling || wonCharacter) && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
            <div className="w-[420px] rounded-2xl bg-slate-900 p-6 text-center">
              <h2 className="mb-4 text-xl">Opening Box...</h2>
              <div className="mb-4 h-16 overflow-hidden rounded border border-slate-700">
                <div className={`flex gap-3 p-2 ${rolling ? 'animate-pulse' : ''}`}>
                  {(rolling ? rollPreview : wonCharacter ? [wonCharacter] : []).map((character) => (
                    <div key={character.uid} className="rounded px-3 py-2" style={{ background: RARITY_META[character.rarity].color }}>
                      {character.icon} {character.name}
                    </div>
                  ))}
                </div>
              </div>
              {wonCharacter && (
                <div className="mt-2">
                  <div className="text-lg font-bold">You got:</div>
                  <div className="text-xl" style={{ color: RARITY_META[wonCharacter.rarity].color }}>
                    {wonCharacter.icon} {wonCharacter.name} - {RARITY_META[wonCharacter.rarity].label} ({wonCharacter.stars}*)
                  </div>
                  {wonCharacter.specialAbility && <div className="text-sm font-bold text-orange-400 mt-1">SPECIAL: {wonCharacter.ability}</div>}
                  <div className="text-sm">+{wonCharacter.boost} boost</div>
                  <button className="mt-4 rounded bg-blue-600 px-4 py-2" onClick={() => setWonCharacter(null)}>Continue</button>
                </div>
              )}
            </div>
          </div>
        )}

        {showCharInv && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
            <div className="w-[620px] rounded-2xl bg-slate-900 p-6">
              <h2 className="mb-4 text-xl">Your Characters</h2>
              {charactersOwned.length === 0 && <div className="mb-4 text-sm text-slate-400">No characters yet. Open boxes and build supply sinks.</div>}
              <div className="mb-4 grid max-h-[320px] grid-cols-2 gap-3 overflow-y-auto pr-2">
                {charactersOwned.map((character) => (
                  <div key={character.uid} className="rounded p-3" style={{ background: RARITY_META[character.rarity].color }}>
                    <div className="font-bold">{character.icon} {character.name}</div>
                    <div className="mb-2 text-xs">{RARITY_META[character.rarity].label} - {character.stars}* - +{character.boost}</div>
                    {character.specialAbility && <div className="mb-2 text-xs font-bold text-white bg-black/30 p-1 rounded">{character.ability}</div>}
                    <div className="mb-1 text-xs text-black/80">Choose land:</div>
                    {ownedTiles.map((tile) => (
                      <button key={tile.id} className="mr-1 mb-1 rounded bg-black/40 px-2 py-1 text-xs" onClick={() => void assignCharacterToLand(character, tile.id)}>
                        {tile.resource} ({tile.characters.length}/{MAX_CHARACTERS_PER_LAND})
                      </button>
                    ))}
                  </div>
                ))}
              </div>
              <div className="mb-4 text-xs text-slate-400">Character fusion is temporarily disabled while the shared-world server migration is in progress.</div>
              <button className="w-full rounded bg-red-600 py-2" onClick={() => setShowCharInv(false)}>Close</button>
            </div>
          </div>
        )}

        {showResetModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
            <div className="w-[420px] rounded-2xl bg-slate-900 p-6">
              <h2 className="mb-2 text-xl font-bold text-white">Reset Shared World</h2>
              <p className="mb-4 text-sm text-slate-300">
                This will reset the map, land market, world tick, and every player's materials, currencies, and characters back to zero.
              </p>
              <label className="mb-2 block text-sm font-medium text-slate-300">Confirm with admin password</label>
              <input
                type="password"
                value={resetPassword}
                onChange={(e) => setResetPassword(e.target.value)}
                className="w-full rounded-xl bg-slate-800 px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500"
                placeholder="Enter your password"
              />
              <div className="mt-4 flex gap-3">
                <button
                  onClick={() => {
                    setShowResetModal(false);
                    setResetPassword('');
                  }}
                  className="flex-1 rounded-xl bg-slate-700 px-4 py-3 font-bold hover:bg-slate-600"
                  disabled={resettingWorld}
                >
                  Cancel
                </button>
                <button
                  onClick={() => void confirmWorldReset()}
                  className="flex-1 rounded-xl bg-red-700 px-4 py-3 font-bold hover:bg-red-600 disabled:opacity-50"
                  disabled={resettingWorld}
                >
                  {resettingWorld ? 'Resetting...' : 'Confirm Reset'}
                </button>
              </div>
            </div>
          </div>
        )}

        {incomingTradeInvite && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
            <div className="w-[420px] rounded-2xl bg-slate-900 p-6">
              <h2 className="mb-2 text-xl font-bold text-white">Trade Invite</h2>
              <p className="mb-4 text-sm text-slate-300">{incomingTradeInvite.fromUsername} wants to trade with you.</p>
              <label className="mb-4 flex items-center gap-2 text-sm text-slate-300">
                <input type="checkbox" checked={muteTradeInviter} onChange={(e) => setMuteTradeInviter(e.target.checked)} />
                Mute this player&apos;s trade invites for 10 minutes
              </label>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    respondToTradeInvite(incomingTradeInvite.id, 'reject', muteTradeInviter);
                    clearIncomingTradeInvite();
                    setMuteTradeInviter(false);
                  }}
                  className="flex-1 rounded-xl bg-slate-700 px-4 py-3 font-bold hover:bg-slate-600"
                >
                  Reject
                </button>
                <button
                  onClick={() => {
                    respondToTradeInvite(incomingTradeInvite.id, 'accept');
                    setMuteTradeInviter(false);
                  }}
                  className="flex-1 rounded-xl bg-emerald-700 px-4 py-3 font-bold hover:bg-emerald-600"
                >
                  Accept
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTrade && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <div className="w-full max-w-6xl rounded-2xl bg-slate-900 p-6">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-bold">Trading With {activeTrade.other.username}</h2>
                  <div className="text-sm text-slate-400">
                    {activeTrade.status === 'countdown'
                      ? `Trade completes in ${tradeCountdown}s unless someone cancels.`
                      : 'Only selected items are visible to the other player. Both players must accept to start the countdown.'}
                  </div>
                </div>
                <button className="rounded-xl bg-red-800 px-4 py-2 font-bold hover:bg-red-700" onClick={cancelTrade}>
                  Cancel Trade
                </button>
              </div>

              {activeTrade.status === 'countdown' && (
                <div className="mb-4 rounded-2xl border border-yellow-500/40 bg-yellow-500/10 p-4 text-center">
                  <div className="text-sm font-semibold uppercase tracking-[0.2em] text-yellow-300">Trade Countdown</div>
                  <div className="mt-2 text-5xl font-black text-yellow-200">{tradeCountdown}</div>
                  <div className="mt-2 text-sm text-yellow-100">Trade completes when this reaches 0 unless one player cancels first.</div>
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_1fr_320px]">
                <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-lg font-semibold">Your Offer</h3>
                    <span className={`text-sm font-bold ${activeTrade.self.accepted ? 'text-green-400' : 'text-slate-400'}`}>
                      {activeTrade.self.accepted ? 'Accepted' : 'Editing'}
                    </span>
                  </div>

                  <div className="mb-4 grid grid-cols-2 gap-3">
                    {RESOURCE_ORDER.map((resource) => (
                      <label key={resource} className="text-sm">
                        <div className="mb-1 text-slate-300">{RESOURCE_INFO[resource].label}</div>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={tradeOffer?.inventory[resource] ?? 0}
                          onChange={(e) => setTradeOfferInventory(resource, Number(e.target.value))}
                          className="w-full rounded-xl bg-slate-800 px-3 py-2 text-white"
                        />
                        <div className="mt-1 text-xs text-slate-500">You have {inventory[resource].toFixed(3)}</div>
                      </label>
                    ))}
                  </div>

                  <div className="mb-4 grid grid-cols-3 gap-3">
                    <label className="text-sm">
                      <div className="mb-1 text-slate-300">Copper</div>
                      <input type="number" min="0" value={tradeOffer?.copper ?? 0} onChange={(e) => setTradeOfferCurrency('copper', Number(e.target.value))} className="w-full rounded-xl bg-slate-800 px-3 py-2 text-white" />
                      <div className="mt-1 text-xs text-slate-500">You have {Math.floor(copper)}</div>
                    </label>
                    <label className="text-sm">
                      <div className="mb-1 text-slate-300">Star Tokens</div>
                      <input type="number" min="0" value={tradeOffer?.starTokens ?? 0} onChange={(e) => setTradeOfferCurrency('starTokens', Number(e.target.value))} className="w-full rounded-xl bg-slate-800 px-3 py-2 text-white" />
                      <div className="mt-1 text-xs text-slate-500">You have {starTokens}</div>
                    </label>
                    <label className="text-sm">
                      <div className="mb-1 text-slate-300">Nickel</div>
                      <input type="number" min="0" value={tradeOffer?.nickel ?? 0} onChange={(e) => setTradeOfferCurrency('nickel', Number(e.target.value))} className="w-full rounded-xl bg-slate-800 px-3 py-2 text-white" />
                      <div className="mt-1 text-xs text-slate-500">You have {nickel}</div>
                    </label>
                  </div>

                  <div>
                    <div className="mb-2 text-sm font-semibold text-slate-300">Select Characters To Offer</div>
                    <div className="grid max-h-[260px] grid-cols-2 gap-3 overflow-y-auto pr-1">
                      {charactersOwned.map((character) => {
                        const selected = tradeOffer?.characterUids.includes(character.uid) ?? false;
                        return (
                          <button
                            key={character.uid}
                            type="button"
                            onClick={() => toggleTradeOfferCharacter(character.uid)}
                            className={`rounded-xl p-3 text-left ${selected ? 'ring-2 ring-white' : ''}`}
                            style={{ background: RARITY_META[character.rarity].color }}
                          >
                            <div className="font-bold">{character.icon} {character.name}</div>
                            <div className="text-xs">{RARITY_META[character.rarity].label} - {character.stars}*</div>
                          </button>
                        );
                      })}
                      {charactersOwned.length === 0 && <div className="text-sm text-slate-500">No characters available.</div>}
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-lg font-semibold">{activeTrade.other.username}&apos;s Offer</h3>
                    <span className={`text-sm font-bold ${activeTrade.other.accepted ? 'text-green-400' : 'text-slate-400'}`}>
                      {activeTrade.other.accepted ? 'Accepted' : 'Editing'}
                    </span>
                  </div>

                  <div className="space-y-2 text-sm">
                    {RESOURCE_ORDER.map((resource) => (
                      <div key={resource} className="flex justify-between rounded-xl bg-slate-900 px-3 py-2">
                        <span>{RESOURCE_INFO[resource].label}</span>
                        <b>{activeTrade.other.offer.inventory[resource].toFixed(3)}</b>
                      </div>
                    ))}
                    <div className="flex justify-between rounded-xl bg-slate-900 px-3 py-2"><span>Copper</span><b>{activeTrade.other.offer.copper}</b></div>
                    <div className="flex justify-between rounded-xl bg-slate-900 px-3 py-2"><span>Star Tokens</span><b>{activeTrade.other.offer.starTokens}</b></div>
                    <div className="flex justify-between rounded-xl bg-slate-900 px-3 py-2"><span>Nickel</span><b>{activeTrade.other.offer.nickel}</b></div>
                  </div>

                  <div className="mt-4">
                    <div className="mb-2 text-sm font-semibold text-slate-300">Visible Characters They Selected</div>
                    <div className="grid max-h-[260px] grid-cols-2 gap-3 overflow-y-auto pr-1">
                      {activeTrade.other.visibleCharacters.map((character) => (
                        <div key={character.uid} className="rounded-xl p-3" style={{ background: RARITY_META[character.rarity].color }}>
                          <div className="font-bold">{character.icon} {character.name}</div>
                          <div className="text-xs">{RARITY_META[character.rarity].label} - {character.stars}*</div>
                        </div>
                      ))}
                      {activeTrade.other.visibleCharacters.length === 0 && <div className="text-sm text-slate-500">No selected characters yet.</div>}
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
                  <h3 className="mb-3 text-lg font-semibold">Trade Chat</h3>
                  <div className="mb-3 h-[320px] overflow-y-auto rounded-xl bg-slate-900 p-3 space-y-2">
                    {activeTrade.messages.map((message) => (
                      <div key={message.id} className="text-sm">
                        <span className="text-slate-500 text-xs">[{new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}]</span>{' '}
                        <span className="font-bold text-blue-400">{message.senderName}:</span>{' '}
                        <span className="text-slate-200">{message.message}</span>
                      </div>
                    ))}
                    {activeTrade.messages.length === 0 && <div className="text-sm text-slate-500">This chat disappears forever when the trade ends.</div>}
                  </div>

                  <form
                    className="mb-4 flex gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!tradeMessage.trim()) return;
                      sendTradeMessage(tradeMessage);
                      setTradeMessage('');
                    }}
                  >
                    <input
                      type="text"
                      value={tradeMessage}
                      onChange={(e) => setTradeMessage(e.target.value)}
                      placeholder="Type a private trade message..."
                      className="flex-1 rounded-xl bg-slate-800 px-4 py-2 text-white"
                    />
                    <button type="submit" className="rounded-xl bg-blue-600 px-4 py-2 font-bold hover:bg-blue-500">Send</button>
                  </form>

                  <button
                    className={`w-full rounded-xl px-4 py-3 font-bold ${activeTrade.self.accepted ? 'bg-yellow-700 hover:bg-yellow-600' : 'bg-emerald-700 hover:bg-emerald-600'}`}
                    onClick={() => setTradeAccepted(!activeTrade.self.accepted)}
                  >
                    {activeTrade.self.accepted ? 'Unaccept Trade' : 'Accept Trade'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
