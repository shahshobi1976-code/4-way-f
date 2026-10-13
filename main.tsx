// Boot sequence: the ORDER matters.
//  1 SDK init  2 save load  3 React mount  4 lift boot cover  5 warm assets  6 go to menu  7 lifecycles  8 analytics
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/app.css';
import { initSdk, registerLifecycles, log } from './sdk/runSdk';
import { store, hydrateSettings } from './state/store';
import { warmAssets } from './assets/preload';
import { preloadSounds } from './game/sfx';
import { stopMusic, startMusic } from './game/music';
import { App } from './ui/App';

// 1) SDK (never throws; local dev without the host runs SDK-less)
await initSdk();

// 1b) online play: install the room bridges, and auto-join the room when the page
//     was opened from a shared invite link (?room=CODE)

// 2) load saved progress: browser storage is read synchronously inside the
//    store module; the host-backed copy (RUN deviceCache) is merged in here.
await hydrateSettings();

// 3) mount React
createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <App />
    </StrictMode>,
);

// 4) lift the black boot cover
requestAnimationFrame(() => document.getElementById('boot-cover')?.classList.add('hidden'));

// 5) warm assets, with progress for the loading bar
const t0 = performance.now();
await warmAssets((p) => store.patch({ loadProgress: p }));
// keep the loading bar visible long enough to read (and let the fonts settle)
const wait = Math.max(0, 700 - (performance.now() - t0));
await new Promise((r) => setTimeout(r, wait));
preloadSounds();

// 6) menu
store.patch({ phase: 'menu', loadProgress: 1 });
const urlRoom = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('room') : null;
if (urlRoom) {
    store.patch({ modal: 'multiplayer' });
}

// 7) lifecycles: pause/resume freeze the ticker; sleep/quit would flush saves (settings already persist on change)
registerLifecycles({
    onPause: () => {
        store.patch({ paused: true });
        stopMusic();
    },
    onResume: () => {
        store.patch({ paused: false });
        if (store.get().settings.music) startMusic();
    },
    onSleep: () => {
        /* settings are persisted as they change */
    },
    onQuit: () => {
        /* last-chance flush: nothing extra to write */
    },
});

// 8) fire-and-forget analytics
log('Ludo Emperor booted');
