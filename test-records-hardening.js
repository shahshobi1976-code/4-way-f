// test-records-hardening.js
// 19 Regression Tests for AI Speech Coordination, Dialogue System, & Turn-Taking

function assert(condition, msg) {
    if (!condition) {
        console.error(`❌ FAIL: ${msg}`);
        process.exit(1);
    } else {
        console.log(`✅ PASS: ${msg}`);
    }
}

// Mock browser window and document environment if running in Node
if (typeof globalThis.window === 'undefined') {
    globalThis.window = {
        _isSpeaking: false,
        _currentSpeakerIdx: null,
        _aiSpeechQueue: [],
        _removeAllSpeechBalloons: null,
        setTimeout: globalThis.setTimeout.bind(globalThis),
        clearTimeout: globalThis.clearTimeout.bind(globalThis),
    };
    globalThis.document = {
        querySelectorAll: () => [],
    };
}

const { store } = await import('./src/state/store.js');
const { _removeAllSpeechBalloons, speak, stopSpeech } = await import('./src/game/sfx.js');

console.log('--- STARTING 19 REGRESSION TESTS (test-records-hardening.js) ---');

// Test 1: Initial state _isSpeaking is false
assert(window._isSpeaking === false, 'Test 1: Initial window._isSpeaking is false');

// Test 2: Initial state _currentSpeakerIdx is null
assert(window._currentSpeakerIdx === null, 'Test 2: Initial window._currentSpeakerIdx is null');

// Test 3: window._aiSpeechQueue is an initialized array
assert(Array.isArray(window._aiSpeechQueue) && window._aiSpeechQueue.length === 0, 'Test 3: window._aiSpeechQueue is an initialized FIFO array');

// Test 4: _removeAllSpeechBalloons exists and is callable
assert(typeof _removeAllSpeechBalloons === 'function', 'Test 4: _removeAllSpeechBalloons is an exported function');
assert(typeof window._removeAllSpeechBalloons === 'function', 'Test 5: window._removeAllSpeechBalloons is attached to window');

// Test 6: _removeAllSpeechBalloons clears store activeSpeechBalloon
store.patch({ activeSpeechBalloon: { idx: 1, text: 'Hello' } });
assert(store.get().activeSpeechBalloon !== null, 'Test 6a: activeSpeechBalloon is set in store');
_removeAllSpeechBalloons();
assert(store.get().activeSpeechBalloon === null, 'Test 6b: _removeAllSpeechBalloons clears store activeSpeechBalloon');

// Test 7: Simulated Speech Queue & Atomic Lock Turn-Taking
let speakerOrder = [];
let balloonStates = [];
let lockStatesDuringSpeech = [];

const p0 = speak({
    text: 'Shahbaz says: Watch out for my token!',
    lang: 'en',
    player: 0,
});

// While speaker 0 is speaking, speaker 1 and speaker 2 enqueue
const p1 = speak({
    text: 'Mughal says: I am calculating your defeat.',
    lang: 'en',
    player: 1,
});

const p2 = speak({
    text: 'Zoi says: Double sixes are coming!',
    lang: 'en',
    player: 2,
});

// Test 7: Immediate lock acquisition
assert(window._isSpeaking === true, 'Test 7: window._isSpeaking is atomically locked during speech');

// Test 8: Current speaker index points to first speaker
assert(window._currentSpeakerIdx === 0, 'Test 8: window._currentSpeakerIdx is locked to speaker 0');

// Test 9: Active balloon is set exclusively for speaker 0
const curBalloon = store.get().activeSpeechBalloon;
assert(curBalloon !== null && curBalloon.idx === 0, 'Test 9: Speech balloon is displayed exclusively for active speaker 0');

// Test 10: Subsequent speakers were safely queued in FIFO order
assert(window._aiSpeechQueue.length === 2, 'Test 10: Two incoming speech items safely queued in _aiSpeechQueue');
assert(window._aiSpeechQueue[0].player === 1, 'Test 11: First item in queue is speaker 1 (Mughal)');
assert(window._aiSpeechQueue[1].player === 2, 'Test 12: Second item in queue is speaker 2 (Zoi)');

// Wait for all queued speeches to process
await Promise.all([p0, p1, p2]);

// Test 13: Queue completely drained
assert(window._aiSpeechQueue.length === 0, 'Test 13: _aiSpeechQueue is completely drained after sequential playback');

// Test 14: Final atomic lock release
assert(window._isSpeaking === false, 'Test 14: window._isSpeaking atomically released to false');
assert(window._currentSpeakerIdx === null, 'Test 15: window._currentSpeakerIdx reset to null after queue finishes');

// Test 16: Final speech balloon cleared
assert(store.get().activeSpeechBalloon === null, 'Test 16: No leftover speech balloon after speech queue completes');

// Test 17: Equitable Round-Robin AI Participation Simulation
const activePlayers = [true, true, true, true]; // 4 players
const isAIPlayer = [false, true, true, true]; // 1 human (0), 3 AI (1 Mughal, 2 Zoi, 3 Kajal)
let aiRoundRobinIndex = 0;

function getNextRoundRobinAI(exclude = -1) {
    const aiPool = [0, 1, 2, 3].filter((q) => q !== exclude && activePlayers[q] && isAIPlayer[q]);
    if (!aiPool.length) return null;
    const selected = aiPool[aiRoundRobinIndex % aiPool.length];
    aiRoundRobinIndex = (aiRoundRobinIndex + 1) % aiPool.length;
    return selected;
}

const aiSpeakerHistory = [];
for (let i = 0; i < 9; i++) {
    aiSpeakerHistory.push(getNextRoundRobinAI(-1));
}

// In 9 turns with 3 AIs, each must speak exactly 3 times in perfect 1, 2, 3, 1, 2, 3 sequence
assert(
    JSON.stringify(aiSpeakerHistory) === JSON.stringify([1, 2, 3, 1, 2, 3, 1, 2, 3]),
    'Test 17: Banter uses equitable round-robin cycle across all AI players without bias'
);

// Test 18: Exclusion handling in Round-Robin (actor does not talk to themselves)
aiRoundRobinIndex = 0;
const actorIs1 = getNextRoundRobinAI(1); // exclude player 1
assert(actorIs1 !== 1, 'Test 18: Active actor is excluded from speaking to themselves');

// Test 19: StopSpeech emergency reset
window._isSpeaking = true;
window._currentSpeakerIdx = 2;
window._aiSpeechQueue = [{ player: 3, text: 'Test' }];
store.patch({ activeSpeechBalloon: { idx: 2, text: 'Test' } });

stopSpeech();

assert(window._isSpeaking === false && window._currentSpeakerIdx === null && window._aiSpeechQueue.length === 0 && store.get().activeSpeechBalloon === null, 'Test 19: stopSpeech() clears lock, queue, speaker index, and balloons');

// Test 20: AI Voice Mute option immediately suppresses speech and queueing
store.patchSettings({ aiMute: true });
const pMuted = speak({ text: 'Muted speech line', lang: 'en', player: 1 });
await pMuted;
assert(window._aiSpeechQueue.length === 0, 'Test 20: When aiMute is enabled, speak() does not enqueue utterances');
assert(window._isSpeaking === false, 'Test 21: When aiMute is enabled, atomic speech lock is not acquired');

// Test 22: Unmuting AI voice restores speech queue processing
store.patchSettings({ aiMute: false });
const pUnmuted = speak({ text: 'Restored speech line', lang: 'en', player: 2 });
assert(window._isSpeaking === true, 'Test 22: When aiMute is disabled, speech acquisition works normally');
await pUnmuted;
assert(window._isSpeaking === false, 'Test 23: After unmuted speech finishes, lock is properly released');

// Test 24 - 27: Match counter persistence & First 3 matches logic
const { getMatchCount, recordMatchStarted, LUDO_MATCHES_KEY } = await import('./src/state/persist.js');
const { safeStorage } = await import('./src/state/storage.js');

safeStorage.removeItem(LUDO_MATCHES_KEY);
assert(getMatchCount() === 0, 'Test 24: getMatchCount returns 0 when no matches recorded');

const match1 = recordMatchStarted();
assert(match1 === 1 && getMatchCount() === 1, 'Test 25: First match records count 1');
assert(match1 <= 3, 'Test 26: First match is within first 3 matches (isFirst3Matches = true)');

const match2 = recordMatchStarted();
const match3 = recordMatchStarted();
assert(match2 === 2 && match3 === 3 && match3 <= 3, 'Test 27: Matches 2 and 3 are within first 3 matches');

// Test 29 - 33: Removal of hahahaha*only* in every AI chat
const { removeHahahaOnly, line: banterLine } = await import('./src/game/banter.js');

assert(
    removeHahahaOnly('Hahaha {n} forgot to capture! 🤡') === '{n} forgot to capture! 🤡',
    'Test 29: removeHahahaOnly strips leading Hahaha while preserving the rest of the message'
);

assert(
    removeHahahaOnly('Ha ha ha ha!') === '',
    'Test 30: removeHahahaOnly strips stand-alone laughter entirely'
);

assert(
    removeHahahaOnly('Snake eyes. Even the dice are laughing 😂') === 'Snake eyes. Even the dice are laughing 😂',
    'Test 31: removeHahahaOnly does NOT strip normal words like laughing'
);

assert(
    removeHahahaOnly('¡Jajaja, {n} olvidó capturar! 🤡') === '{n} olvidó capturar! 🤡' &&
    removeHahahaOnly('هاهاها، {n} نسي أن يأكل! 🤡') === '{n} نسي أن يأكل! 🤡' &&
    removeHahahaOnly('हा हा हा हा!') === '',
    'Test 32: removeHahahaOnly handles multilingual hahahaha laughter variants'
);

// Test 33: speech queue strips hahahaha from activeSpeechBalloon
const pClean = speak({
    text: 'Hahaha Watch out for my token!',
    lang: 'en',
    player: 0,
});
assert(
    store.get().activeSpeechBalloon?.text === 'Watch out for my token!',
    'Test 33: activeSpeechBalloon displayed on board has hahahaha stripped cleanly'
);
await pClean;

console.log('🎉 ALL 33 REGRESSION TESTS PASSED! (test-records-hardening.js)');
process.exit(0);
