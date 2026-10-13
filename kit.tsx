import type { CSSProperties, ReactNode } from 'react';

/** Size in design units: scales with the device frame (see --u in app.css). */
export const U = (n: number) => `calc(var(--u) * ${n})`;

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
    return (
        <div
            className="absolute inset-0 z-40 flex items-center justify-center bg-black/70"
            style={{ padding: U(20) }}
            onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div
                className="pop flex max-h-full w-full flex-col overflow-hidden rounded-2xl border border-cyan-400/50 bg-[#0e1530] shadow-[0_0_40px_rgba(24,224,255,0.25)]"
                style={{ maxWidth: U(wide ? 680 : 600) }}
            >
                <div className="flex items-center justify-between border-b border-cyan-400/30" style={{ padding: `${U(14)} ${U(20)}` }}>
                    <h2 className="font-extrabold tracking-wide text-cyan-300" style={{ fontSize: U(30) }}>{title}</h2>
                    <button onClick={onClose} className="rounded-full bg-white/10 font-bold text-white" style={{ width: U(48), height: U(48), fontSize: U(26) }} aria-label="Close">✕</button>
                </div>
                <div className="overflow-y-auto" style={{ padding: U(20), fontSize: U(24) }}>{children}</div>
            </div>
        </div>
    );
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
    return (
        <button onClick={() => onChange(!on)} className="flex w-full items-center justify-between rounded-xl bg-white/5" style={{ padding: `${U(12)} ${U(16)}`, marginBottom: U(10) }}>
            <span className="font-semibold">{label}</span>
            <span className={`relative rounded-full transition-colors ${on ? 'bg-cyan-400' : 'bg-gray-600'}`} style={{ width: U(76), height: U(40) }}>
                <span className="absolute rounded-full bg-white transition-all" style={{ top: U(4), left: on ? U(40) : U(4), width: U(32), height: U(32) }} />
            </span>
        </button>
    );
}

export function Chip({ active, children, onClick, style }: { active?: boolean; children: ReactNode; onClick: () => void; style?: CSSProperties }) {
    return (
        <button
            onClick={onClick}
            className={`rounded-xl font-semibold ${active ? 'bg-cyan-400 text-black shadow-[0_0_14px_rgba(24,224,255,0.7)]' : 'bg-white/10 text-white'}`}
            style={{ padding: `${U(10)} ${U(12)}`, fontSize: U(21), ...style }}
        >
            {children}
        </button>
    );
}

export function RoundBtn({ children, onClick, size = 64, label, className = '', style }: { children: ReactNode; onClick: () => void; size?: number; label: string; className?: string; style?: CSSProperties }) {
    return (
        <button
            aria-label={label}
            onClick={onClick}
            className={`flex items-center justify-center rounded-full border border-cyan-300/60 bg-[#0b1230]/85 text-white shadow-[0_0_14px_rgba(24,224,255,0.35)] active:scale-95 ${className}`}
            style={{ width: U(size), height: U(size), fontSize: U(size * 0.46), ...style }}
        >
            {children}
        </button>
    );
}
