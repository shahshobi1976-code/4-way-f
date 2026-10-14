import { useStore } from '../state/store';
import { U } from './kit';
import thumbnailImg from '../assets/thumbnail.jpg';

export function LoadingScreen() {
    const p = useStore((s) => s.loadProgress);
    return (
        <div className="circuit absolute inset-0 z-50 flex flex-col items-center justify-center">
            {/* Game artwork badge with coordinated #0a0d26 background */}
            <div
                className="game-image-wrap relative mb-4 border border-cyan-400/50 shadow-[0_0_35px_rgba(0,240,255,0.35)]"
                style={{ width: U(150), height: U(150), borderRadius: U(26) }}
            >
                <img src={thumbnailImg} alt="Ludo Emperor Artwork" className="w-full h-full object-cover rounded-[inherit]" />
                <div className="game-image-vignette" />
                <div className="absolute inset-0 rounded-[inherit] ring-1 ring-cyan-400/50 pointer-events-none" />
            </div>

            <div className="glow-title text-center font-black text-cyan-300" style={{ fontSize: U(60), lineHeight: 1.05 }}>
                LUDO<br />EMPEROR
            </div>
            <div className="font-bold tracking-[0.3em] text-white/80" style={{ fontSize: U(26), marginTop: U(8) }}>4 WAY</div>
            <div className="overflow-hidden rounded-full bg-white/10" style={{ width: U(380), height: U(16), marginTop: U(36) }}>
                <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-amber-300 to-emerald-400 transition-[width]" style={{ width: `${Math.round(p * 100)}%` }} />
            </div>
            <div className="text-white/70 font-semibold tracking-wider" style={{ fontSize: U(20), marginTop: U(10) }}>{Math.round(p * 100)}%</div>
        </div>
    );
}
