import { useStore } from '../state/store';
import { U } from './kit';

export function LoadingScreen() {
    const p = useStore((s) => s.loadProgress);
    return (
        <div className="circuit absolute inset-0 z-50 flex flex-col items-center justify-center">
            <div className="glow-title text-center font-black text-cyan-300" style={{ fontSize: U(64), lineHeight: 1.05 }}>
                LUDO<br />EMPEROR
            </div>
            <div className="font-bold tracking-[0.3em] text-white/80" style={{ fontSize: U(28), marginTop: U(10) }}>4 WAY</div>
            <div className="overflow-hidden rounded-full bg-white/10" style={{ width: U(420), height: U(18), marginTop: U(60) }}>
                <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-fuchsia-500 transition-[width]" style={{ width: `${Math.round(p * 100)}%` }} />
            </div>
            <div className="text-white/60" style={{ fontSize: U(22), marginTop: U(12) }}>{Math.round(p * 100)}%</div>
        </div>
    );
}
