import { useCallback, useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import type { TradeInvite, TradeOffer, TradeSessionView } from '../gameTypes';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

type ChatMessage = {
  id: string;
  username: string;
  message: string;
  timestamp: string;
};

type Player = {
  id: string;
  userId?: string;
  username: string;
  joinedAt: Date;
};

type AuthUser = {
  id: string;
  username: string;
  isAdmin: boolean;
};

export function useSocket(token: string | null, user: AuthUser | null) {
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [onlinePlayers, setOnlinePlayers] = useState<Player[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [gameTick, setGameTick] = useState(0);
  const [gameStateVersion, setGameStateVersion] = useState(0);
  const [activeTrade, setActiveTrade] = useState<TradeSessionView | null>(null);
  const [incomingTradeInvite, setIncomingTradeInvite] = useState<TradeInvite | null>(null);

  useEffect(() => {
    if (!token) return;

    const socket = io(SERVER_URL);
    socketRef.current = socket;

    socket.on('connect', () => {
      setIsConnected(true);
      setError(null);
      socket.emit('authenticate', { token });
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
    });

    socket.on('error', (data: { message: string }) => {
      setError(data.message);
    });

    socket.on(
      'authenticated',
      (data: {
        success: boolean;
        playerId: string;
        isAdmin: boolean;
        gameTick: number;
        onlinePlayers?: Player[];
        chatHistory?: ChatMessage[];
        version?: number;
      }) => {
        if (!data.success) return;
        setGameTick(data.gameTick);
        setOnlinePlayers(data.onlinePlayers ?? []);
        setMessages(data.chatHistory ?? []);
        if (typeof data.version === 'number') {
          setGameStateVersion(data.version);
        }
      }
    );

    socket.on('playerJoined', (player: Player) => {
      setOnlinePlayers((prev) => {
        const filtered = prev.filter((existing) => existing.id !== player.id);
        return [...filtered, player];
      });
    });

    socket.on('playerLeft', (data: { playerId: string }) => {
      setOnlinePlayers((prev) => prev.filter((player) => player.id !== data.playerId));
    });

    socket.on('newMessage', (message: ChatMessage) => {
      setMessages((prev) => [...prev, message]);
    });

    socket.on('gameTick', (data: { tick: number; refreshedBy?: string }) => {
      setGameTick(data.tick);
    });

    socket.on('gameStateUpdated', (data: { version: number; tick: number }) => {
      setGameStateVersion(data.version);
      setGameTick(data.tick);
    });

    socket.on('tradeInviteReceived', (invite: TradeInvite) => {
      setIncomingTradeInvite(invite);
    });

    socket.on('tradeInviteDeclined', (data: { message: string }) => {
      setError(data.message);
    });

    socket.on('tradeInviteMuted', (data: { message: string }) => {
      setError(data.message);
    });

    socket.on('tradeSessionUpdated', (tradeSession: TradeSessionView) => {
      setIncomingTradeInvite(null);
      setActiveTrade(tradeSession);
    });

    socket.on('tradeSessionClosed', (data: { message: string }) => {
      setActiveTrade(null);
      setIncomingTradeInvite(null);
      setError(data.message || null);
    });

    return () => {
      socket.disconnect();
    };
  }, [token]);

  const sendMessage = useCallback((message: string) => {
    if (socketRef.current && message.trim()) {
      socketRef.current.emit('chatMessage', { message: message.trim() });
    }
  }, []);

  const manualRefreshServer = useCallback(() => {
    if (socketRef.current && user?.isAdmin) {
      socketRef.current.emit('manualRefresh');
    }
  }, [user]);

  const inviteToTrade = useCallback((target: { userId?: string; username: string }) => {
    if (socketRef.current) {
      socketRef.current.emit('tradeInvite', {
        targetUserId: target.userId,
        targetUsername: target.username,
      });
    }
  }, []);

  const respondToTradeInvite = useCallback((inviteId: string, action: 'accept' | 'reject', muteForTenMinutes = false) => {
    if (socketRef.current) {
      socketRef.current.emit('tradeInviteResponse', { inviteId, action, muteForTenMinutes });
    }
  }, []);

  const updateTradeOffer = useCallback((offer: TradeOffer) => {
    if (socketRef.current) {
      socketRef.current.emit('tradeOfferUpdate', { offer });
    }
  }, []);

  const setTradeAccepted = useCallback((accepted: boolean) => {
    if (socketRef.current) {
      socketRef.current.emit('tradeSetAccepted', { accepted });
    }
  }, []);

  const sendTradeMessage = useCallback((message: string) => {
    if (socketRef.current && message.trim()) {
      socketRef.current.emit('tradeChatMessage', { message: message.trim() });
    }
  }, []);

  const cancelTrade = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.emit('tradeCancel');
    }
  }, []);

  return {
    isConnected,
    username: user?.username || '',
    messages,
    onlinePlayers,
    gameTick,
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
    clearSocketError: () => setError(null),
    clearIncomingTradeInvite: () => setIncomingTradeInvite(null),
  };
}
