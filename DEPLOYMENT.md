# Hex World Deployment Guide

Hex World is now set up for:

- Shared online multiplayer
- Email/password accounts
- SQLite persistence for users, world state, and player inventories
- Separate frontend and backend deployment

## Recommended Setup

- Frontend: Vercel
- Backend: Render
- Database file: SQLite stored on a persistent Render disk

This is the simplest path to get a public link people can open from anywhere.

## 1. Push The Project

Push this folder to GitHub first. Both Vercel and Render will deploy from that repo.

## 2. Deploy The Backend On Render

This repo includes a [render.yaml](/C:/Users/j.shaer/OneDrive/Desktop/Fadel%20game/render.yaml) file, so Render can read most settings automatically.

Create a new Render Blueprint or Web Service from your GitHub repo, then set these environment variables:

```env
JWT_SECRET=replace-with-a-long-random-secret
ADMIN_EMAIL=42230238@students.liu.edu.lb
CORS_ORIGIN=https://your-frontend-domain.vercel.app
PORT=3001
```

Important notes:

- The backend uses SQLite at the directory in `DATA_DIR`.
- For local development, `DATA_DIR` defaults to `server/data`.
- On Render, `DATA_DIR` should point at a mounted persistent disk so restarts and redeploys keep the same SQLite database.
- The included `render.yaml` sets `DATA_DIR=/var/data/hex-world` and mounts the persistent disk at `/var/data/hex-world`.

After deploy, your backend URL will look something like:

```txt
https://hex-world-api.onrender.com
```

## 3. Deploy The Frontend On Vercel

Create a new Vercel project from the same GitHub repo.

Set this environment variable in Vercel:

```env
VITE_SERVER_URL=https://your-render-backend.onrender.com
```

The included [vercel.json](/C:/Users/j.shaer/OneDrive/Desktop/Fadel%20game/vercel.json) is enough for the Vite frontend build.

After deploy, your frontend URL will look something like:

```txt
https://your-project-name.vercel.app
```

## 4. Connect Frontend And Backend

Once Vercel gives you the frontend URL:

1. Copy that full URL.
2. Put it into Render as `CORS_ORIGIN`.
3. Redeploy the backend if Render does not redeploy automatically.

This allows:

- login/register requests
- game actions
- Socket.IO real-time multiplayer traffic

## 5. Admin Account

The email in `ADMIN_EMAIL` automatically becomes admin when that user logs in.

For your current setup, use:

```txt
42230238@students.liu.edu.lb
```

That account will keep access to:

- global refresh/reset controls
- other admin-only actions already in the game

## 6. Data Migration Notes

On startup, the server now migrates old local JSON data into SQLite if needed:

- `server/data/users.json`
- `server/data/gameState.json`
- `server/data/players/*.json`

After the migration, the live server reads from SQLite instead of those JSON files.

## 7. Local Environment Examples

Backend example:

```env
JWT_SECRET=hex-world-secret-key-2024
ADMIN_EMAIL=42230238@students.liu.edu.lb
CORS_ORIGIN=http://localhost:5173
PORT=3002
```

Frontend example:

```env
VITE_SERVER_URL=http://localhost:3002
```

## 8. Troubleshooting

If the frontend loads but login fails:

- Check `VITE_SERVER_URL`
- Check `CORS_ORIGIN`
- Confirm the backend is running

If the site opens but multiplayer does not connect:

- Make sure the backend URL is `https://...`, not `http://...`
- Confirm Render is not sleeping on a free plan
- Check browser console errors for Socket.IO or CORS failures

If data disappears after deploy:

- Confirm the Render persistent disk is attached
- Confirm the disk mount path is `/var/data/hex-world`
- Confirm the `DATA_DIR` environment variable is also `/var/data/hex-world`

If the server restarts after downtime:

- The backend now reloads the latest persisted SQLite world state on boot
- The server replays missed world ticks based on the persisted `lastTickAt` timestamp
- Land timers, auto-collect countdowns, market updates, world expansion, and player progress continue from persisted state instead of starting over

## 9. What This Does Not Do Automatically

This repo is now prepared for deployment, but it does not publish itself automatically from your local machine. To get a real public link, the remaining step is:

- push to GitHub
- connect repo to Render and Vercel
- set the environment variables above

Once that is done, people outside your computer will be able to join.
