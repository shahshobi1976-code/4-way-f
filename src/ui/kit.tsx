import type { CSSProperties, PointerEventHandler, ReactNode } from 'react';

/** Size in design units: scales with the device frame (see --u in app.css). */
export const U = (n: number) => `calc(var(--u) * ${n})`;

export function Modal({
    title,
    onClose,
    children,
    wide,
    slim,
}: {
    title: string;
    onClose: () => void;
    children: ReactNode;
    wide?: boolean;
    slim?: boolean;
}) {
    return (
        <div
            className="absolute inset-0 z-40 flex items-center justify-center bg-black/80 p-1.5 sm:p-3 overflow-hidden backdrop-blur-sm"
            onPointerDown={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
        >
            <div
                className="pop flex max-h-[96vh] max-h-[96dvh] w-full flex-col overflow-hidden rounded-2xl border border-cyan-400/50 bg-[#0c122e] shadow-[0_0_35px_rgba(24,224,255,0.25)]"
                style={{
                    maxWidth: slim
                        ? 'min(96vw, 480px)'
                        : wide
                        ? 'min(98vw, 760px)'
                        : 'min(96vw, 580px)',
                }}
            >
                {/* Slim Header Bar with explicit Back Button + Title + Close Button */}
                <div className="flex items-center justify-between border-b border-cyan-400/30 px-3 py-2 bg-slate-950/70 shrink-0 gap-2">
                    <button
                        onClick={onClose}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-cyan-300 hover:text-white font-extrabold text-xs transition-colors shrink-0 cursor-pointer"
                        title="Return to Main Menu"
                        aria-label="Back to Main Menu"
                    >
                        <span>←</span>
                        <span className="hidden xs:inline sm:inline">Main Menu</span>
                    </button>
                    <h2 className="font-extrabold tracking-wide text-cyan-200 text-center truncate text-xs sm:text-sm flex-1">
                        {title}
                    </h2>
                    <button
                        onClick={onClose}
                        className="rounded-full bg-white/10 hover:bg-white/20 font-bold text-white transition-colors flex items-center justify-center shrink-0 cursor-pointer w-7 h-7 text-xs"
                        aria-label="Close"
                    >
                        ✕
                    </button>
                </div>
                <div className={`overflow-y-auto text-xs sm:text-sm ${slim ? 'p-1.5 sm:p-2' : 'p-2.5 sm:p-3'}`}>
                    {children}
                </div>
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

export function RoundBtn({
    id,
    children,
    onClick,
    onPointerDown,
    onPointerUp,
    onPointerCancel,
    size = 48,
    label,
    className = '',
    style,
    title,
}: {
    id?: string;
    children: ReactNode;
    onClick?: () => void;
    onPointerDown?: PointerEventHandler<HTMLButtonElement>;
    onPointerUp?: PointerEventHandler<HTMLButtonElement>;
    onPointerCancel?: PointerEventHandler<HTMLButtonElement>;
    size?: number;
    label: string;
    className?: string;
    style?: CSSProperties;
    title?: string;
}) {
    return (
        <button
            id={id}
            type="button"
            aria-label={label}
            title={title || label}
            onClick={onClick}
            onPointerDown={onPointerDown}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerCancel}
            className={`flex items-center justify-center rounded-full border border-cyan-300/60 bg-[#0b1230]/85 text-white shadow-[0_0_10px_rgba(24,224,255,0.35)] active:scale-95 cursor-pointer ${className}`}
            style={{ width: U(size), height: U(size), fontSize: U(size * 0.48), ...style }}
        >
            {children}
        </button>
    );
}
