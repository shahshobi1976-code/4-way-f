import { store, useStore } from '../state/store';
import { tr } from '../i18n';
import { U } from './kit';

export function MainMenu() {
    const lang = useStore((s) => s.settings.lang);
    const mode = useStore((s) => s.mode);
    const T = (k: string) => tr(lang, k);

    const items: { icon: string; label: string; sub: string; on: () => void }[] = [
        { icon: '👥', label: T('pass'), sub: T('passD'), on: () => store.patch({ phase: 'setup' }) },
        { icon: '🏆', label: T('tour'), sub: T('tourD'), on: () => store.patch({ modal: 'tournament' }) },
        { icon: '🌐', label: T('invite'), sub: T('inviteD'), on: () => store.patch({ modal: 'invite' }) },
        { icon: '📖', label: T('how'), sub: T('howD'), on: () => store.patch({ modal: 'howto' }) },
        { icon: '⚙️', label: T('settings'), sub: T('settingsD'), on: () => store.patch({ modal: 'settings' }) },
    ];

    return (
        <div className="menu circuit absolute inset-0 flex flex-col items-center overflow-y-auto" style={{ padding: `${U(60)} ${U(30)} ${U(120)}` }}>
            <h1 className="glow-title text-center font-black leading-none text-cyan-300" style={{ fontSize: U(74) }}>
                LUDO<br />EMPEROR
            </h1>
            <div className="font-black tracking-[0.35em] text-white" style={{ fontSize: U(34), marginTop: U(8) }}>4 WAY</div>
            <div className="font-semibold text-cyan-100/90" style={{ fontSize: U(26), marginTop: U(14) }}>{T('subtitle')}</div>
            <div className="text-center font-black text-red-500" style={{ fontSize: U(24), marginTop: U(8), textShadow: '0 0 12px rgba(255,40,40,0.8)' }}>{T('tagline')}</div>

            <div className="flex flex-wrap justify-center" style={{ gap: U(10), marginTop: U(24) }}>
                {[`🎲🎲 ${T('badge2')}`, `👥 ${T('badge4')}`, `✨7 ${T('badge7')}`].map((b) => (
                    <span key={b} className="rounded-full border border-cyan-300/60 bg-cyan-400/10 font-bold text-cyan-100" style={{ padding: `${U(8)} ${U(16)}`, fontSize: U(21) }}>{b}</span>
                ))}
            </div>

            <div className="flex" style={{ gap: U(10), marginTop: U(28) }}>
                {([4, 2] as const).map((m) => (
                    <button
                        key={m}
                        onClick={() => store.patch({ mode: m })}
                        className={`rounded-xl font-bold ${mode === m ? 'bg-cyan-400 text-black' : 'bg-white/10 text-white'}`}
                        style={{ padding: `${U(8)} ${U(18)}`, fontSize: U(21) }}
                    >
                        {m === 4 ? T('four') : T('two')}
                    </button>
                ))}
            </div>

            <div className="flex w-full flex-col" style={{ gap: U(14), marginTop: U(22), maxWidth: U(560) }}>
                {items.map((it) => (
                    <button
                        key={it.label}
                        onClick={it.on}
                        className="flex items-center rounded-2xl border border-cyan-300/30 bg-black/55 text-left backdrop-blur active:scale-[0.98]"
                        style={{ padding: `${U(14)} ${U(20)}`, gap: U(18) }}
                    >
                        <span className="flex items-center justify-center rounded-xl bg-cyan-400/15" style={{ width: U(64), height: U(64), fontSize: U(36) }}>{it.icon}</span>
                        <span>
                            <span className="block font-black tracking-wide text-white" style={{ fontSize: U(30) }}>{it.label}</span>
                            <span className="block text-white/60" style={{ fontSize: U(20) }}>{it.sub}</span>
                        </span>
                    </button>
                ))}
            </div>
        </div>
    );
}
