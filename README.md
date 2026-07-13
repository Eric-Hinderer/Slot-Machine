# Midnight Fortune Casino

A responsive virtual-credit casino built with Next.js, React, and TypeScript.

## Games

- **Slots:** five animated reels, five paylines, wild substitutions, seven bet levels, recent-spin history, sound, and keyboard controls.
- **Blackjack:** hit, stand, double down, dealer stands on 17, natural blackjack pays 3:2, and recent-hand history.
- **Craps:** a full chip-on-table layout with simultaneous Pass/Don't Pass, Come/Don't Come, true odds, place bets, hardways, Field bets, and center proposition bets.

All games use one shared virtual-credit wallet saved in local storage. There are no deposits, withdrawals, purchases, or real-money rewards.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Production build

```bash
npm run build
npm start
```

## Deploy on Vercel

Import this GitHub repository into Vercel. The framework preset is Next.js and no environment variables are required.

## Controls

### Slots

- `Space`: spin
- `Left` / `Right`: change bet

### Blackjack

- `H`: hit
- `S`: stand
- `D`: double down
- `Space` / `Enter`: deal

### Craps

- Select a chip and click table spots to place bets.
- Switch to **Remove** and click permitted bets to take chips down.
- `Space` / `Enter`: roll
- `Left` / `Right`: change chip
- `R`: toggle place/remove mode
