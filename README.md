# Ludo Emperor 4 Way

Pixi.js v8 + React 19 + Tailwind v4 + Vite + TypeScript, on the RUN.game template.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-checks, then builds
```

## Previewing the built game locally

```bash
npm run build:bundled   # standalone build: React is bundled in, not fetched from the host CDN
npm run preview         # http://localhost:4173
```

Use `build:bundled` for a local preview. The plain `npm run build` is the RUN
deploy artifact: it externalizes React/react-dom and loads them from
`https://venus-static-01293ak.web.app/libs`, which the RUN host provides. Serve
that build without the host (or with the CDN unreachable) and the page stays on
the black boot cover, because React never arrives.

Optional: drop your own car clip at `public/audio/car.mp3` and it replaces the synthesised engine sound for token moves.

## Where things live
- `src/game/rules.ts` – board, moves, Lucky Seven, win/progress, computer-player brain (pure logic)
- `src/game/ludoScene.ts` – tilted/rotating board, pawns, dice, turn flow, penalties, chat + voices
- `src/game/draw.ts` – pawns, dice, 10 table backgrounds
- `src/game/sfx.ts`, `music.ts`, `banter.ts` – sounds, 10 instruments, talkative AI lines
- `src/ui/` – menu, setup, HUD (combined progress bar), settings/music/profile windows
- `src/state/persist.ts` – settings storage: SDK `deviceCache` under the host, guarded `localStorage` otherwise
- `src/sdk/runSdk.ts` – SDK init, guarded by a timeout so a missing host can never stall the boot
- `src/i18n.ts` – interface text in 10 languages

This code was written without being able to install packages or run it, so expect to fix small things on first run.
