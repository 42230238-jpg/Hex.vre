# Hex World - Online Multiplayer Resource Management Game

A hexagonal tile-based resource management game built with React, TypeScript, Tailwind CSS, and Socket.io.

## Game Overview

Hex World is a multiplayer strategy game where you:
- **Register/Login** with your email to play
- **Buy land tiles** of different resource types (wheat, brick, ore, wood)
- **Collect resources** and sell them for copper
- **Open chests** to get characters that boost production
- **Chat** with other players in real-time
- **Upgrade storage** and manage your empire
- **Use auto-collect** with nickel currency

## Key Features

### Authentication
- **Email/Password Login**: Secure authentication with JWT tokens
- **Admin System**: First registered user becomes admin
- **Persistent Sessions**: Stay logged in across browser sessions

### Global Game State (Manual Refresh)
- **No Auto-Refresh**: Game time only advances when admin clicks refresh
- **Synchronized**: All players see the same game tick
- **Fair**: Everyone progresses at the same pace

### Multiplayer Chat
- **Real-time Chat**: Talk with all online players
- **Online Player List**: See who's playing
- **Persistent Chat**: Last 100 messages are saved

### Currencies
- **Copper**: Main currency for buying land
- **Star Tokens**: Earned by burning land, used for exclusive boxes
- **Nickel**: Earned from character boxes, used for auto-collect

## Setup Instructions

### Prerequisites
- Node.js 18+ and npm

### 1. Install Client Dependencies
```bash
npm install
```

### 2. Install Server Dependencies
```bash
cd server
npm install
```

### 3. Configure Environment Variables

**Client (.env)**
```bash
VITE_SERVER_URL=http://localhost:3002
```

**Server (.env)**
```bash
JWT_SECRET=your-secret-key-minimum-32-characters
ADMIN_EMAIL=admin@hex.world
PORT=3002
```

### 4. Start the Server
```bash
cd server
npm start
# Server runs on http://localhost:3002
```

### 5. Start the Client
```bash
npm run dev
# Client runs on http://localhost:5173
```

### 6. Open Browser
Visit `http://localhost:5173` and register your account!

## Game Mechanics

### Resources
- **Wheat** (Yellow): Base production 60s, cheap land
- **Brick** (Red): Base production 135s, medium value  
- **Ore** (Gray): Base production 180s, high value
- **Wood** (Green): Base production 90s, moderate value

### Characters
Characters boost production of their specialty resource:
- **Rarity Tiers**: Rare, Very Rare, Epic, Mythic, Legendary, Exclusive
- **Nickel Rewards**: Rare=1, Very Rare=2, Epic=3, Mythic=4, Legendary=5

**Exclusive Character Abilities:**
- Double/Triple production speed
- Auto-collect from single or adjacent tiles
- Daily copper generation

### Chests (8x Expensive)
- **Brown**: wheat 240 / wood 96
- **Gold**: wheat 480 / wood 240 / brick 144
- **Diamond**: wheat 960 / wood 480 / brick 280 / ore 160

### Auto-Collect System
- **Cost**: 5 nickels = 30 minutes
- **Effect**: Collects 1 material per tick from each owned tile
- **Stackable**: Can add more time with additional nickels

### Land Management
- **Buy**: Click hex to purchase with copper
- **Reposition**: Drag owned tiles to rearrange
- **Upgrade**: Increase storage capacity
- **Burn**: Sacrifice land for Star Tokens (1-10 based on level)

## Controls

| Action | Control |
|--------|---------|
| Select Hex | Click |
| Move Camera | Drag on empty space |
| Zoom | Mouse wheel |
| Reposition Tile | Drag owned hex |
| Refresh Game | Admin only: Click "🔄 Global Refresh" button |

## Admin Features

As the admin (first registered user), you can:
- Click **"🔄 Global Refresh"** to advance the game tick for all players
- See the current tick counter
- Manage the global game state

## Deploying Online

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed instructions on deploying to:
- Custom domain (e.g., hex.world)
- Railway/Render/Heroku for server
- Vercel/Netlify for client

Quick steps:
1. Buy domain
2. Deploy server to Railway/Render
3. Deploy client to Vercel/Netlify
4. Configure DNS
5. Set environment variables
6. Register as admin with your configured email

## Architecture

```
┌─────────────┐         ┌─────────────┐         ┌─────────────┐
│   Client    │◀──────▶│   Server    │◀──────▶│   Data      │
│  (React)    │  WS/HTTP│  (Node.js)  │         │  (JSON)     │
└─────────────┘         └─────────────┘         └─────────────┘
```

## Security

- Passwords hashed with bcrypt
- JWT tokens for authentication
- CORS configured for production
- Input validation on all endpoints

## Support

For issues:
1. Check server is running: `http://localhost:3002`
2. Check environment variables
3. Clear browser localStorage and re-login
4. Check browser console for errors

## License

MIT License - Feel free to use and modify!
