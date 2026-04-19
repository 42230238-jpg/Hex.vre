import React, { useState } from 'react';

type AuthProps = {
  onLogin: (email: string, password: string) => Promise<boolean>;
  onRegister: (email: string, password: string, username: string) => Promise<boolean>;
  onGoogleSignIn: () => void;
  error: string | null;
  loading: boolean;
};

export function Auth({ onLogin, onRegister, onGoogleSignIn, error, loading }: AuthProps) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLogin) {
      await onLogin(email, password);
    } else {
      await onRegister(email, password, username);
    }
  };

  return (
    <div className="min-h-screen bg-[#0b1020] flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Hex World</h1>
          <p className="text-slate-400">{isLogin ? 'Sign in to continue' : 'Create an account'}</p>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-900/50 border border-red-600 text-red-200 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {!isLogin && (
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required={!isLogin}
                minLength={2}
                maxLength={20}
                className="w-full rounded-xl bg-slate-800 px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter your username"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded-xl bg-slate-800 px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter your email"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Password</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full rounded-xl bg-slate-800 px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter your password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-blue-600 px-4 py-3 font-bold hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Please wait...' : isLogin ? 'Sign In' : 'Create Account'}
          </button>

          <button
            type="button"
            onClick={onGoogleSignIn}
            disabled={loading}
            className="w-full rounded-xl border border-slate-600 bg-white px-4 py-3 font-bold text-slate-900 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Continue with Google
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-slate-400">
            {isLogin ? "Don't have an account?" : 'Already have an account?'}{' '}
            <button
              type="button"
              onClick={() => {
                setIsLogin(!isLogin);
              }}
              className="text-blue-400 hover:text-blue-300 font-medium"
            >
              {isLogin ? 'Sign Up' : 'Sign In'}
            </button>
          </p>
        </div>

        <div className="mt-8 pt-6 border-t border-slate-800 text-center">
          <p className="text-xs text-slate-500">
            By using Hex World, you agree to our Terms of Service and Privacy Policy.
          </p>
        </div>
      </div>
    </div>
  );
}
