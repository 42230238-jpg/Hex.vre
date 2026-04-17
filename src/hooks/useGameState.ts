import { useCallback, useEffect, useState } from 'react';
import type { GameActionResult, GameSnapshot } from '../gameTypes';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

type ActionPayload = Record<string, unknown>;

export function useGameState(token: string | null, refreshKey = 0) {
  const [gameState, setGameState] = useState<GameSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadGameState = useCallback(async (silent = false) => {
    if (!token) {
      setGameState(null);
      setLoading(false);
      return null;
    }

    if (!silent) {
      setLoading(true);
    }

    setError(null);

    try {
      const response = await fetch(`${SERVER_URL}/api/game/bootstrap`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Failed to load game state.');
        if (!silent) {
          setLoading(false);
        }
        return null;
      }

      setGameState(data.gameState);
      setLoading(false);
      return data.gameState as GameSnapshot;
    } catch (err) {
      setError('Network error while loading game state.');
      if (!silent) {
        setLoading(false);
      }
      return null;
    }
  }, [token]);

  useEffect(() => {
    const silent = refreshKey > 0 && gameState !== null;
    void loadGameState(silent);
  }, [loadGameState, refreshKey]);

  const runAction = useCallback(
    async (action: string, payload: ActionPayload = {}): Promise<GameActionResult & { ok: boolean }> => {
      if (!token) {
        return { ok: false, error: 'Not authenticated.' };
      }

      try {
        const response = await fetch(`${SERVER_URL}/api/game/action`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ action, payload }),
        });

        const data = await response.json();

        if (!response.ok) {
          return { ok: false, error: data.error || 'Action failed.' };
        }

        if (data.gameState) {
          setGameState(data.gameState);
        }

        return { ok: true, ...data };
      } catch (err) {
        return { ok: false, error: 'Network error while updating the game.' };
      }
    },
    [token]
  );

  return {
    gameState,
    loading,
    error,
    reload: loadGameState,
    runAction,
  };
}
