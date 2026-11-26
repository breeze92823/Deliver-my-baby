---
canDie: true
hasScore: true
rewards: true
clientDir: .
buildCommand: npm run build
distDir: dist
---

# Deliver My Baby — Bloxity integration notes

- **canDie**: yes. Another mom's Kill / Kill All knocks you out of the line; the knockout shows Boxity's
  death screen and you get up (at the room's entrance) when its countdown allows (`bloxity.deathScreen()`,
  `game.js` `knockedOut`).
- **hasScore**: yes. Leaderboards `babies` (Babies Delivered), `trips` (Hospital Trips) and `coins`
  (Richest Moms) are declared by the client (`LEADERBOARDS` in `src/config.js`) and submitted by the game
  server for verified accounts (`../Deliver-my-baby-backend/src/bloxity.ts`).
- **rewards**: yes. The Free Coins button plays a rewarded ad (`ADS.reward`); the game server verifies the
  reward token with Bloxity before the coins are granted.
- **Room size**: not set in the deploy (Bloxity's default seatCap of 50); the room's maxClients is the
  same 50 (`ROOM_MAX_CLIENTS` in the backend). Hosted on Bloxity Legion through the matchmaker
  (`Legion.SDK.net.resolveEndpoint`), so party play and Play with friends work.
- Every player in a room is drawn as a fellow mom, and the lines hold real players only; just the hospital
  staff are bots.
- No Gems: nothing in the game is bought with premium currency. Everything costs in-game coins.
- **Badges**: 7 milestone badges (`BADGES` in the backend `constants.ts`) are declared once and awarded by the
  game server from the tracked babies / trips / coins (`awardBadges` in `../Deliver-my-baby-backend/src/bloxity.ts`).
