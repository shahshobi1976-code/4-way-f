# ▶ HOW TO PLAY — read this first

## Two builds. Pick the one for your device — both just double-click.

| Your device | Open this file |
| --- | --- |
| **Phone / tablet** | **`PLAY-MOBILE.html`** |
| **PC / laptop browser** | **`PLAY-WEB.html`** |

Each one is the whole game inside a single file: no install, no internet, no
console window, no Node.js. They are the same game — only the device setup
differs:

| | `PLAY-MOBILE.html` | `PLAY-WEB.html` |
| --- | --- | --- |
| Viewport | locked: no pinch-zoom, no scrolling | normal browser behaviour |
| Notches / rounded corners | fits, via `viewport-fit=cover` + safe-area padding | n/a |
| Add to home screen | supported | n/a |
| Long-press menu / text select | disabled, so drags never fight the board | left enabled |
| Touch / tap handling | pointer events, tuned for fingers | same engine, mouse or touch |
| Layout | portrait first; turn the phone sideways for the wide board | adapts to the window (wide window = wide board) |

Either file also works on the other kind of device — they are the same engine,
so use whichever you have to hand.

**Do not click `index.html`, `index.web.html` or `index.mobile.html`.** Those are
the *source* entry points for developers and need a running dev server, so
double-clicking them does nothing useful.
**Do not open `dist\index.html` either** — browsers block the separate chunk files
that build needs when opened from disk, which gives a black screen. Only the
`PLAY-*.html` files are built to run from disk.

If Windows asks what to open a file with, choose **Chrome** or **Edge**.

---

# Web + mobile served over Wi-Fi (optional)

Want the game on several devices at once, or a real `http://` link?

**Double-click `PLAY.cmd`.** The console prints two addresses:

```
  Ludo Emperor 4 Way is running at http://127.0.0.1:8080/
  On your phone (same Wi-Fi):      http://192.168.100.228:8080/
```

| Device | Address |
| --- | --- |
| **Web** — this PC | `http://127.0.0.1:8080/` |
| **Mobile** — phone/tablet on the same Wi-Fi | `http://192.168.100.228:8080/` |

Always use the numbers the console prints — if your router gives this PC a new
address, the console shows the current one.

## Serving each build separately

The server can serve either build, on its own port, so you can have both open at
once. From the **`Run with local server`** folder:

```bash
node serve.mjs 8080 web      # the multi-file WEB build   -> http://127.0.0.1:8080/
node serve.mjs 8081 mobile   # the single-file MOBILE build -> http://127.0.0.1:8081/
node serve.mjs 8082 single   # the single-file WEB build
node serve.mjs 5173 dev      # the Vite dev server (needs npm install first)
```

Only the port is required; `web` is the default. Each one prints both its local
address and its Wi-Fi address for phones.

### If the phone can't connect

Windows Firewall blocks the port by default. Fix it once:

**Double-click `ALLOW-PHONE-ACCESS.cmd`** and accept the Administrator prompt.

It opens TCP port 8080 for **private networks, local subnet only** — nothing is
exposed to the internet. Then confirm the phone is on the **same Wi-Fi**.

If you serve the mobile build on **8081** instead, that port needs its own rule —
run the same helper with `-LocalPort 8081`, or simply use port 8080.

---

## How a turn works — two taps, with a guiding hand

Your turn is always **two taps**, and a hand pointing down shows you where to tap
next:

1. **Tap a number** — the hand hovers above the die to use, fingertip pointing
   down at it, and the dice pulse. This is also how you start your roll.
2. **Tap a glowing piece** — the hand moves to the piece to move and points down
   at it, following the board as it turns. Only pieces that can move with the
   number you chose glow and bounce.

Taps are never silently ignored: tapping a piece before choosing a number flashes
the dice and says **"Tap a number to use"**; tapping a piece that needs the other
number says **"That piece needs the other number"**. Nothing is chosen for you.

## The capture rule (and how doubled dice work)

If your roll can capture opponents, you **must take every capture it allows**. The
penalty is your piece going back to base, applied at the end of the turn if a
capture the roll allowed was left on the table.

**You can capture two different opponents in one turn** — one with each die. If
both are available and you take only one, you are penalised for the one you left.

**With a doubled roll (5 + 5, 6 + 6, …) the obligation belongs to the number, not
to one single die.** So with 5 and 5, if a capture is available, moving something
else with the **first** 5 is **not** penalised while the **second** 5 is still
there to take it. You only lose the piece once **both** 5s have been used and the
capture was still never taken.

Worked example — **6 and 2**, with the opponent only reachable by the 6:

- Spend the **6** on the capture → nothing owed, **no penalty**.
- Spend the **2** first while the 6 could still capture → **penalised**, because
  the capture was there for the taking.
- Spend both on other things → **penalised once**.

In short:

- Take **all** the captures the roll allows, not just one.
- You are never punished twice for one number.
- You are never punished for missing a capture you could still make.

---

## Landscape

The game runs in both orientations on both builds. It picks the wide layout
automatically whenever the screen is wider than it is tall — a desktop window, a
laptop, a tablet, or a phone turned sideways. Nothing to configure.

The **menu and player-name screens** always keep their original centred portrait
column, so they stay readable on a wide screen. Only the board uses the wide
layout.

On a phone:

- **Turn the phone sideways** (or tap the **⛶** fullscreen button) for the wide
  board: board on the left, dice, turn indicator and player plates on the right.
- A small **"Rotate for full board"** pill appears in portrait on touch devices.
  It is only a suggestion — portrait is fully playable, with the board above the
  dice. Tap it to dismiss.
- The fullscreen button also asks the browser to lock landscape. Some browsers
  (notably iOS Safari) refuse that; turning the phone does the same job.

---

## Rebuilding, if you change the code

```bash
npm install

# the served multi-file web build
npm run build:bundled                                  # -> dist/

# the two single-file builds
SINGLE_TARGET=web    npx vite build --config vite.single.config.ts   # -> dist-web/index.web.html
SINGLE_TARGET=mobile npx vite build --config vite.single.config.ts   # -> dist-mobile/index.mobile.html
```

On Windows PowerShell, set the variable first:
`$env:SINGLE_TARGET="mobile"; npx vite build --config vite.single.config.ts`

Both type-check first, so a build failure is a real type error.

**Use `build:bundled`, not plain `build`.** Plain `npm run build` is the
RUN.game deploy artifact: it deliberately leaves React out of the bundle and loads
it from the RUN host's CDN. Served without the RUN host, that build sits on the
black boot cover forever. `build:bundled` embeds React and works anywhere. The
single-file builds also need `RUNDOT_GAME_DISABLE_EMBEDDED_LIBS=true` so the RUN
plugin does not externalize React.

---

## Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| Black screen | You opened one of the `index*.html` files. Open `PLAY-MOBILE.html` or `PLAY-WEB.html`. |
| Nothing happens when opening the HTML | The file may be blocked: right-click → **Properties** → tick **Unblock** → OK. |
| Opens in a text editor | Right-click → **Open with** → your browser. |
| Phone can't reach the address | Run `ALLOW-PHONE-ACCESS.cmd` (needs Administrator), check both devices are on the same Wi-Fi, use the address from the console. |
| `PLAY.cmd` says Node.js not found | Install Node.js from [nodejs.org](https://nodejs.org), or just use the `PLAY-*.html` files. |
| Port already in use | The server tries the next port; use the address it prints. |
| `npm install` fails with `EPERM`/`EBUSY` | Antivirus or a file lock. Close editors and retry; last resort, run as Administrator. |

---

## What is in here

| Item | What it is |
| --- | --- |
| `PLAY-MOBILE.html` | **the whole game**, tuned for phones — one self-contained file |
| `PLAY-WEB.html` | **the whole game**, tuned for desktop browsers — one self-contained file |
| `PLAY.cmd` | starts the shared web + mobile server |
| `ALLOW-PHONE-ACCESS.cmd` | one-time firewall rule so phones can connect |
| `Run with local server\serve.cmd` | the same server, launched directly |
| `Run with local server\serve.mjs` | the dependency-free server |
| `dist\` | multi-file web build (what the server serves) |
| `dist-web\`, `dist-mobile\` | output of the two single-file builds |
| `src\`, `public\` | full source code |
| `index*.html`, `vite*.config.ts`, `tsconfig.json` | project config |

### Where the important code lives

| File | Contents |
| --- | --- |
| `src/game/rules.ts` | board, moves, captures, Lucky Seven, win logic, AI, **the capture obligation** (`maxCaptures`) |
| `src/game/ludoScene.ts` | tilted/rotating 3D board, pawns, dice, turn flow, **two-tap input, the penalty check (`captureDebt`) and the pointing hand**, landscape layout |
| `src/game/draw.ts` | pawns, dice, 10 table backgrounds |
| `src/ui/App.tsx` | phase router; decides portrait vs landscape from the viewport |
| `src/ui/Hud.tsx` | progress bar, player labels, popups |
| `src/ui/MainMenu.tsx`, `src/ui/SetupScreen.tsx` | menu and the player-name screen |
| `src/ui/FloatingControls.tsx` | fullscreen + landscape lock, rotate hint |
| `src/styles/app.css` | frame sizing, landscape frame width |
| `src/state/persist.ts` | settings storage (host cache, or browser storage) |
| `src/sdk/runSdk.ts` | SDK init, timeout-guarded so a missing host can't stall boot |
