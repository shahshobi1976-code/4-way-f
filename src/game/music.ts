// Background music using the 7 bundled MP3 soundtracks, plus optional user-chosen device song.
import { audio } from './sfx';
import { store } from '../state/store';

export interface BgmTrack {
    id: string;
    label: string;
    url: string;
}

export const BGM_TRACKS: BgmTrack[] = [
    { id: 'afro-reggaeton', label: 'Afro Reggaeton', url: '/audio/bgm-afro-reggaeton.mp3' },
    { id: 'downtempo', label: 'Downtempo Chill', url: '/audio/bgm-downtempo.mp3' },
    { id: 'guitar-v5', label: 'Acoustic Guitar 1', url: '/audio/bgm-guitar-v5.mp3' },
    { id: 'guitar-v9', label: 'Acoustic Guitar 2', url: '/audio/bgm-guitar-v9.mp3' },
    { id: 'latin', label: 'Latin Groove', url: '/audio/bgm-latin.mp3' },
    { id: 'nature', label: 'Nature Ambient', url: '/audio/bgm-nature.mp3' },
    { id: 'rap', label: 'Urban Beat', url: '/audio/bgm-rap.mp3' },
];

export const DEFAULT_BGM_TRACK = BGM_TRACKS[0].id;

let file: HTMLAudioElement | null = null;
let fileUrl: string | null = null;
let bgmAudio: HTMLAudioElement | null = null;
let currentBgmTrackId: string | null = null;

export function startMusic() {
    stopMusic();
    const s = store.get().settings;
    if (!s.music) return;
    audio();
    if (file) {
        file.volume = 0.6;
        void file.play().catch(() => {});
        return;
    }
    const desiredId = s.bgmTrack || DEFAULT_BGM_TRACK;
    const track = BGM_TRACKS.find((t) => t.id === desiredId) || BGM_TRACKS[0];
    if (!bgmAudio || currentBgmTrackId !== track.id) {
        bgmAudio?.pause();
        bgmAudio = new Audio(track.url);
        bgmAudio.loop = true;
        currentBgmTrackId = track.id;
    }
    bgmAudio.volume = 0.45;
    void bgmAudio.play().catch(() => {});
}

export function stopMusic() {
    file?.pause();
    bgmAudio?.pause();
}

export function setBgmTrack(trackId: string) {
    if (file) clearSong(false);
    const valid = BGM_TRACKS.some((t) => t.id === trackId) ? trackId : DEFAULT_BGM_TRACK;
    store.patchSettings({ bgmTrack: valid, music: true, songName: null });
    startMusic();
}

export function setSong(f: File) {
    clearSong(false);
    bgmAudio?.pause();
    currentBgmTrackId = null;
    fileUrl = URL.createObjectURL(f);
    file = new Audio(fileUrl);
    file.loop = true;
    file.volume = 0.6;
    store.patchSettings({ songName: f.name, music: true });
    startMusic();
}

export function clearSong(restart = true) {
    file?.pause();
    file = null;
    if (fileUrl) URL.revokeObjectURL(fileUrl);
    fileUrl = null;
    store.patchSettings({ songName: null });
    if (restart) startMusic();
}

export function setMusicOn(on: boolean) {
    store.patchSettings({ music: on });
    if (on) startMusic();
    else stopMusic();
}
