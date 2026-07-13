# Midnight Fortune Casino

A responsive, virtual-credit casino built with Next.js, React, and TypeScript. The app includes three games that share one locally saved 10,000-credit balance:

- **Slots:** five reels, five paylines, wild substitutions, adjustable bets up to 1,000 credits, sound, and recent-spin history.
- **Blackjack:** hit, stand, double down, dealer stands on all 17, blackjack pays 3:2, and recent-hand history.
- **Craps:** Pass Line, Don't Pass, and Field bets with point-on/point-off play and recent-roll history.

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

Import this GitHub repository into Vercel. The framework preset will be detected as Next.js and no environment variables are required.

## Keyboard controls

- **Slots:** `Space` spins; left/right arrows change the wager.
- **Blackjack:** `H` hits, `S` stands, `D` doubles, and `Space` or `Enter` deals when the hand is settled.
- **Craps:** `Space` or `Enter` rolls; left/right arrows change the wager.

The project uses virtual credits only and does not support deposits, withdrawals, or real-money wagering.
