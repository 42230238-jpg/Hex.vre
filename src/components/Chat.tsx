import React, { useState, useRef, useEffect } from 'react';

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

type ChatProps = {
  isConnected: boolean;
  username: string;
  messages: ChatMessage[];
  onlinePlayers: Player[];
  error: string | null;
  onJoin: (username: string) => void;
  onSendMessage: (message: string) => void;
  onTradeInvite?: (player: Player) => void;
};

export function Chat({
  isConnected,
  username,
  messages,
  onlinePlayers,
  error,
  onJoin,
  onSendMessage,
  onTradeInvite
}: ChatProps) {
  const [inputUsername, setInputUsername] = useState('');
  const [inputMessage, setInputMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputUsername.trim()) {
      onJoin(inputUsername.trim());
    }
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputMessage.trim()) {
      onSendMessage(inputMessage);
      setInputMessage('');
    }
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Login screen
  if (!username) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
        <h2 className="mb-3 text-lg font-semibold">Global Chat</h2>
        <div className="text-sm text-slate-400 mb-4">
          {!isConnected ? (
            <span className="text-red-400">⚠ Connecting to server...</span>
          ) : (
            'Enter a username to join'
          )}
        </div>
        <form onSubmit={handleJoin} className="space-y-3">
          <input
            type="text"
            value={inputUsername}
            onChange={(e) => setInputUsername(e.target.value)}
            placeholder="Enter username..."
            maxLength={20}
            disabled={!isConnected}
            className="w-full rounded-xl bg-slate-800 px-4 py-2 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
          />
          {error && <div className="text-xs text-red-400">{error}</div>}
          <button
            type="submit"
            disabled={!isConnected || inputUsername.trim().length < 2}
            className="w-full rounded-xl bg-blue-600 px-4 py-2 font-bold hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Join Chat
          </button>
        </form>
      </div>
    );
  }

  // Chat interface
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
      <div className="flex justify-between items-center mb-3">
        <h2 className="text-lg font-semibold">Global Chat</h2>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">Online:</span>
          <span className="rounded-full bg-green-600 px-2 py-0.5 text-xs font-bold">{onlinePlayers.length}</span>
        </div>
      </div>

      <div className="grid grid-cols-[1fr_120px] gap-3">
        {/* Messages */}
        <div className="flex flex-col">
          <div className="h-[200px] overflow-y-auto rounded-xl bg-slate-950 p-3 space-y-2">
            {messages.length === 0 && (
              <div className="text-center text-sm text-slate-500 py-8">No messages yet. Say hello! 👋</div>
            )}
            {messages.map((msg) => (
              <div key={msg.id} className="text-sm">
                <span className="text-slate-500 text-xs">[{formatTime(msg.timestamp)}]</span>{' '}
                <span className="font-bold text-blue-400">{msg.username}:</span>{' '}
                <span className="text-slate-200">{msg.message}</span>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          <form onSubmit={handleSendMessage} className="mt-3 flex gap-2">
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder="Type a message..."
              maxLength={500}
              className="flex-1 rounded-xl bg-slate-800 px-4 py-2 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="submit"
              disabled={!inputMessage.trim()}
              className="rounded-xl bg-blue-600 px-4 py-2 font-bold hover:bg-blue-500 disabled:opacity-50"
            >
              Send
            </button>
          </form>
        </div>

        {/* Online players */}
        <div className="rounded-xl bg-slate-950 p-2">
          <div className="text-xs font-bold text-slate-400 mb-2 uppercase tracking-wide">Online</div>
          <div className="space-y-1 max-h-[180px] overflow-y-auto">
            {onlinePlayers.map((player) => (
              <button
                key={player.id}
                type="button"
                onClick={() => {
                  if (player.username !== username) {
                    onTradeInvite?.(player);
                  }
                }}
                className="flex w-full items-center gap-1 text-left text-xs"
              >
                <span className="w-2 h-2 rounded-full bg-green-500"></span>
                <span className={player.username === username ? 'text-blue-400 font-bold' : 'text-slate-300 hover:text-white'}>
                  {player.username}
                </span>
              </button>
            ))}
          </div>
          <div className="mt-2 text-[10px] text-slate-500">Click a player name to invite them to trade.</div>
        </div>
      </div>
    </div>
  );
}
