import { useEffect, useRef } from 'react';

interface Particle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    size: number;
    color: string;
    rotation: number;
    rotationSpeed: number;
    wobble: number;
    wobbleSpeed: number;
    shape: 'rect' | 'circle' | 'star';
    alpha: number;
    decay: number;
}

const COLORS = [
    '#ffd700', // Gold
    '#ff3b5c', // Coral Red
    '#00f0ff', // Electric Cyan
    '#22c55e', // Emerald Green
    '#f59e0b', // Amber Orange
    '#ec4899', // Pink
    '#a855f7', // Purple
    '#ffffff', // Sparkle White
];

export function CelebrationCanvas() {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let width = (canvas.width = window.innerWidth);
        let height = (canvas.height = window.innerHeight);

        const handleResize = () => {
            if (!canvas) return;
            width = canvas.width = window.innerWidth;
            height = canvas.height = window.innerHeight;
        };
        window.addEventListener('resize', handleResize);

        const particles: Particle[] = [];

        function spawnBurst(cx: number, cy: number, count = 45) {
            for (let i = 0; i < count; i++) {
                const angle = Math.random() * Math.PI * 2;
                const speed = 3 + Math.random() * 9;
                const color = COLORS[Math.floor(Math.random() * COLORS.length)];
                const shape = Math.random() < 0.4 ? 'rect' : Math.random() < 0.7 ? 'star' : 'circle';
                particles.push({
                    x: cx,
                    y: cy,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed - 2,
                    size: 5 + Math.random() * 9,
                    color,
                    rotation: Math.random() * Math.PI * 2,
                    rotationSpeed: (Math.random() - 0.5) * 0.2,
                    wobble: Math.random() * Math.PI * 2,
                    wobbleSpeed: 0.05 + Math.random() * 0.08,
                    shape,
                    alpha: 1,
                    decay: 0.003 + Math.random() * 0.005,
                });
            }
        }

        function spawnConfettiRain(count = 35) {
            for (let i = 0; i < count; i++) {
                const x = Math.random() * width;
                const y = -20 - Math.random() * 50;
                const color = COLORS[Math.floor(Math.random() * COLORS.length)];
                particles.push({
                    x,
                    y,
                    vx: (Math.random() - 0.5) * 3,
                    vy: 2 + Math.random() * 4,
                    size: 6 + Math.random() * 8,
                    color,
                    rotation: Math.random() * Math.PI * 2,
                    rotationSpeed: (Math.random() - 0.5) * 0.15,
                    wobble: Math.random() * Math.PI * 2,
                    wobbleSpeed: 0.04 + Math.random() * 0.06,
                    shape: Math.random() < 0.6 ? 'rect' : 'circle',
                    alpha: 1,
                    decay: 0.001 + Math.random() * 0.003,
                });
            }
        }

        // Initial celebration barrage: 3 firework bursts + continuous confetti shower
        spawnBurst(width * 0.25, height * 0.35, 55);
        spawnBurst(width * 0.75, height * 0.35, 55);
        spawnBurst(width * 0.5, height * 0.25, 70);

        const interval = setInterval(() => {
            spawnConfettiRain(15);
            if (Math.random() < 0.35) {
                spawnBurst(width * (0.2 + Math.random() * 0.6), height * (0.2 + Math.random() * 0.35), 40);
            }
        }, 800);

        const handleLaunchJashan = () => {
            spawnBurst(width * 0.3, height * 0.4, 60);
            spawnBurst(width * 0.7, height * 0.4, 60);
            spawnBurst(width * 0.5, height * 0.3, 75);
            spawnConfettiRain(40);
        };
        window.addEventListener('launch-jashan', handleLaunchJashan);

        let animId: number;
        const render = () => {
            ctx.clearRect(0, 0, width, height);

            for (let i = particles.length - 1; i >= 0; i--) {
                const p = particles[i];
                p.x += p.vx + Math.sin(p.wobble) * 1.2;
                p.y += p.vy;
                p.vy += 0.08; // gravity
                p.vx *= 0.985; // drag
                p.rotation += p.rotationSpeed;
                p.wobble += p.wobbleSpeed;
                p.alpha -= p.decay;

                if (p.alpha <= 0 || p.y > height + 30) {
                    particles.splice(i, 1);
                    continue;
                }

                ctx.save();
                ctx.translate(p.x, p.y);
                ctx.rotate(p.rotation);
                ctx.globalAlpha = Math.max(0, p.alpha);
                ctx.fillStyle = p.color;

                if (p.shape === 'rect') {
                    const widthScale = Math.cos(p.wobble);
                    ctx.fillRect(-p.size / 2, (-p.size * widthScale) / 2, p.size, p.size * widthScale);
                } else if (p.shape === 'circle') {
                    ctx.beginPath();
                    ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
                    ctx.fill();
                } else if (p.shape === 'star') {
                    ctx.beginPath();
                    const spikes = 5;
                    const outerRadius = p.size;
                    const innerRadius = p.size / 2;
                    let rot = (Math.PI / 2) * 3;
                    let x = 0;
                    let y = 0;
                    const step = Math.PI / spikes;

                    ctx.moveTo(0, -outerRadius);
                    for (let s = 0; s < spikes; s++) {
                        x = Math.cos(rot) * outerRadius;
                        y = Math.sin(rot) * outerRadius;
                        ctx.lineTo(x, y);
                        rot += step;
                        x = Math.cos(rot) * innerRadius;
                        y = Math.sin(rot) * innerRadius;
                        ctx.lineTo(x, y);
                        rot += step;
                    }
                    ctx.lineTo(0, -outerRadius);
                    ctx.closePath();
                    ctx.fill();
                }
                ctx.restore();
            }

            animId = requestAnimationFrame(render);
        };
        animId = requestAnimationFrame(render);

        return () => {
            cancelAnimationFrame(animId);
            clearInterval(interval);
            window.removeEventListener('resize', handleResize);
            window.removeEventListener('launch-jashan', handleLaunchJashan);
        };
    }, []);

    return <canvas ref={canvasRef} className="fixed inset-0 pointer-events-none z-30" />;
}
