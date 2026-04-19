export type ResourceType = 'wheat' | 'brick' | 'ore' | 'wood';
export type ChestType = 'brown' | 'gold' | 'diamond' | 'exclusive';
export type Rarity = 'rare' | 'very_rare' | 'epic' | 'mythic' | 'legendary' | 'exclusive';
export type SpecialAbility =
  | 'double_production'
  | 'triple_production'
  | 'auto_collect_single'
  | 'auto_collect_adjacent'
  | 'daily_copper';

export type Character = {
  id: number;
  uid: number;
  name: string;
  icon: string;
  rarity: Rarity;
  stars: number;
  boost: number;
  specialty: ResourceType | 'all';
  ability: string;
  specialAbility?: SpecialAbility;
};

export type Tile = {
  id: string;
  q: number;
  r: number;
  ownerId: string | null;
  ownerName: string | null;
  depleted?: boolean;
  resource: ResourceType;
  timer: number;
  stored: number;
  storageLevel: number;
  characters: Character[];
};

export type MarketState = Record<ResourceType, number>;
export type InventoryState = Record<ResourceType, number>;
export type LandPriceState = Record<ResourceType, number>;
export type HistoryPoint = { minute: number; label: string } & MarketState;
export type ResourceCost = Partial<Record<ResourceType, number>>;
export type RarityChances = Partial<Record<Rarity, number>>;

export type ChestDropConfig = {
  rarities: RarityChances;
  starTokenBonusChance: number;
};

export type FusionConfig = {
  requiredCount: number;
  resultByRarity: Partial<Record<Rarity, Rarity>>;
};

export type GameConfig = {
  chestCosts: Record<ChestType, ResourceCost>;
  chestDropRates: Record<ChestType, ChestDropConfig>;
  exclusiveStarCost: number;
  maxCharacterInventory: number;
  starTokenBonusAmount: number;
  fusion: FusionConfig;
};

export type PlayerGameState = {
  copper: number;
  starTokens: number;
  nickel: number;
  inventory: InventoryState;
  charactersOwned: Character[];
  autoCollectActive: boolean;
  autoCollectTimeRemaining: number;
};

export type WorldGameState = {
  tick: number;
  map: Tile[];
  market: MarketState;
  landPrices: LandPriceState;
  history: HistoryPoint[];
};

export type GameSnapshot = {
  config: GameConfig;
  world: WorldGameState;
  player: PlayerGameState;
};

export type GameActionResult = {
  message?: string;
  error?: string;
  gameState?: GameSnapshot;
  wonCharacter?: Character;
  fusedCharacter?: Character;
};

export type TradeOffer = {
  inventory: InventoryState;
  copper: number;
  starTokens: number;
  nickel: number;
  characterUids: number[];
};

export type TradeChatMessage = {
  id: string;
  senderId: string;
  senderName: string;
  message: string;
  timestamp: string;
};

export type TradePartyView = {
  userId: string;
  username: string;
  accepted: boolean;
  offer: TradeOffer;
  visibleCharacters: Character[];
};

export type TradeSessionView = {
  id: string;
  status: 'pending' | 'active' | 'countdown';
  countdownEndsAt: number | null;
  countdownRemainingMs?: number | null;
  self: TradePartyView;
  other: TradePartyView;
  messages: TradeChatMessage[];
};

export type TradeInvite = {
  id: string;
  fromUserId: string;
  fromUsername: string;
  createdAt: string;
};
