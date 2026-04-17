const rawServerUrl = import.meta.env.VITE_SERVER_URL?.trim();
const isLocalHost =
  typeof window !== 'undefined' &&
  ['localhost', '127.0.0.1'].includes(window.location.hostname);

export const SERVER_URL = rawServerUrl || (isLocalHost ? 'http://localhost:3001' : '');

export const SERVER_CONFIG_ERROR = SERVER_URL
  ? null
  : 'Server is not configured. Set VITE_SERVER_URL in Vercel to your public backend URL.';
