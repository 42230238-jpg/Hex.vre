import { useState, useEffect, useCallback } from 'react';
import { GOOGLE_AUTH_URL, SERVER_CONFIG_ERROR, SERVER_URL } from '../config';

type User = {
  id: string;
  email: string;
  username: string;
  isAdmin: boolean;
};

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('hexWorldToken'));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const currentUrl = new URL(window.location.href);
    const authToken = currentUrl.searchParams.get('authToken');
    const authError = currentUrl.searchParams.get('authError');

    if (!authToken && !authError) {
      return;
    }

    currentUrl.searchParams.delete('authToken');
    currentUrl.searchParams.delete('authError');
    window.history.replaceState({}, '', currentUrl.toString());

    if (authToken) {
      localStorage.setItem('hexWorldToken', authToken);
      setToken(authToken);
      setError(null);
      return;
    }

    if (authError) {
      setError(authError);
      localStorage.removeItem('hexWorldToken');
      setToken(null);
    }
  }, []);

  // Check if user is already logged in
  useEffect(() => {
    const checkAuth = async () => {
      if (!token) {
        setLoading(false);
        return;
      }

      try {
        const response = await fetch(`${SERVER_URL}/api/auth/me`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        if (response.ok) {
          const data = await response.json();
          setUser(data.user);
        } else {
          localStorage.removeItem('hexWorldToken');
          setToken(null);
        }
      } catch (err) {
        console.error('Auth check failed:', err);
        localStorage.removeItem('hexWorldToken');
        setToken(null);
      }

      setLoading(false);
    };

    checkAuth();
  }, [token]);

  const login = useCallback(async (email: string, password: string) => {
    setLoading(true);
    setError(null);

    if (SERVER_CONFIG_ERROR) {
      setError(SERVER_CONFIG_ERROR);
      setLoading(false);
      return false;
    }

    try {
      const response = await fetch(`${SERVER_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Login failed');
        setLoading(false);
        return false;
      }

      localStorage.setItem('hexWorldToken', data.token);
      setToken(data.token);
      setUser(data.user);
      setLoading(false);
      return true;
    } catch (err) {
      setError('Network error. Please try again.');
      setLoading(false);
      return false;
    }
  }, []);

  const register = useCallback(async (email: string, password: string, username: string) => {
    setLoading(true);
    setError(null);

    if (SERVER_CONFIG_ERROR) {
      setError(SERVER_CONFIG_ERROR);
      setLoading(false);
      return false;
    }

    try {
      const response = await fetch(`${SERVER_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, username })
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Registration failed');
        setLoading(false);
        return false;
      }

      localStorage.setItem('hexWorldToken', data.token);
      setToken(data.token);
      setUser(data.user);
      setLoading(false);
      return true;
    } catch (err) {
      setError('Network error. Please try again.');
      setLoading(false);
      return false;
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('hexWorldToken');
    setToken(null);
    setUser(null);
    setError(null);
  }, []);

  const startGoogleSignIn = useCallback(() => {
    setError(null);

    if (!GOOGLE_AUTH_URL || SERVER_CONFIG_ERROR) {
      setError(SERVER_CONFIG_ERROR || 'Google sign-in is not configured.');
      return;
    }

    const redirect = typeof window !== 'undefined' ? window.location.origin : '';
    window.location.href = `${GOOGLE_AUTH_URL}?redirect=${encodeURIComponent(redirect)}`;
  }, []);

  return {
    user,
    token,
    loading,
    error,
    isAuthenticated: !!user,
    isAdmin: user?.isAdmin || false,
    login,
    register,
    logout,
    startGoogleSignIn,
  };
}
