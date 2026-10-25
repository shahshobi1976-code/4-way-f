import { useStore } from '../state/store';
import { U } from './kit';

export function LoadingScreen() {
    const p = useStore((s) => s.loadProgress);
    return (
        <div className="circuit absolute inset-0 z-50 flex flex-col items-center justify-center">
            {/* Game artwork badge with Ludo Dethroned 3D logo */}
            <div
                className="relative mb-5 flex items-center justify-center rounded-2xl overflow-hidden border-2 border-amber-500/60 shadow-[0_0_40px_rgba(245,158,11,0.5)]"
                style={{ width: U(280), maxWidth: '85vw', aspectRatio: '16/9' }}
            >
                <img
                    src="/assets/aistudio/image_745468f3_92e66563.jpg"
                    alt="Ludo Dethroned Logo"
                    className="w-full h-full object-cover"
                />
            </div>

            <div className="glow-title text-center font-black text-amber-300" style={{ fontSize: U(46), lineHeight: 1.05 }}>
                LUDO<br />DETHRONED
            </div>
            <div className="font-black tracking-[0.35em] text-cyan-300" style={{ fontSize: U(24), marginTop: U(8) }}>3D</div>
            <div className="overflow-hidden rounded-full bg-white/10" style={{ width: U(380), height: U(16), marginTop: U(36) }}>
                <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-amber-300 to-emerald-400 transition-[width]" style={{ width: `${Math.round(p * 100)}%` }} />
            </div>
            <div className="text-white/70 font-semibold tracking-wider" style={{ fontSize: U(20), marginTop: U(10) }}>{Math.round(p * 100)}%</div>
        </div>
    );
}
