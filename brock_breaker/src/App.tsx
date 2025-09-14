import React, { useEffect, useRef, useState } from "react";

// 修正版ポイント:
// - アニメーションループ内から常に最新の state を参照できるよう、running/paused/message/score/lives/level を refs で同期
// - Start/Restart/Space(Pause) が即時に反映され、"Press Start" が消えない不具合を解消
// - リサイズ時はレイアウトだけ再計算、スコア/ライフはリセットしない

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const withDPR = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
  const dpr = window.devicePixelRatio || 1;
  ctx.canvas.width = Math.floor(w * dpr);
  ctx.canvas.height = Math.floor(h * dpr);
  ctx.canvas.style.width = `${w}px`;
  ctx.canvas.style.height = `${h}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
};

type Brick = { x: number; y: number; w: number; h: number; alive: boolean; hp: number };

export default function BreakoutGame() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // 表示サイズ（CSS px）
  const [vw, setVw] = useState(720);
  const [vh, setVh] = useState(480);

  // 表示用 state
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [message, setMessage] = useState<string | null>("Press Start");
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [level, setLevel] = useState(1);

  // ループ用の最新値
  const runningRef = useRef(running);
  const pausedRef = useRef(paused);
  const messageRef = useRef<string | null>(message);
  const scoreRef = useRef(score);
  const livesRef = useRef(lives);
  const levelRef = useRef(level);

  useEffect(() => { runningRef.current = running; }, [running]);
  useEffect(() => { pausedRef.current = paused; }, [paused]);
  useEffect(() => { messageRef.current = message; }, [message]);
  useEffect(() => { scoreRef.current = score; }, [score]);
  useEffect(() => { livesRef.current = lives; }, [lives]);
  useEffect(() => { levelRef.current = level; }, [level]);

  // 可変ゲームオブジェクト
  const inputRef = useRef({ left: false, right: false });
  const paddleRef = useRef({ x: 0, y: 0, w: 120, h: 14, speed: 520 });
  const ballRef = useRef({ x: 0, y: 0, r: 8, vx: 260, vy: -260 });
  const bricksRef = useRef<Brick[]>([]);
  const rowsBase = 6; const cols = 10; const brickPad = 6; const brickTop = 60;

  // レイアウト計算
  useEffect(() => {
    const onResize = () => {
      const maxW = 900, minW = 320;
      const box = wrapRef.current?.getBoundingClientRect();
      const targetW = clamp((box?.width ?? 720), minW, maxW);
      const aspect = 3/2;
      setVw(Math.round(targetW));
      setVh(Math.round(targetW / aspect));
      // サイズ変更時は配置を再計算
      const ctx = canvasRef.current?.getContext("2d");
      if (!ctx) return;
      withDPR(ctx, Math.round(targetW), Math.round(targetW / aspect));
      layout(ctx);
    };
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const buildBricks = (W: number, H: number, levelNow: number) => {
    const rows = rowsBase + Math.min(levelNow - 1, 4);
    const brickAreaW = W - 40;
    const bw = Math.floor(brickAreaW / cols) - brickPad;
    const bh = 18;
    const bs: Brick[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = 20 + c * (bw + brickPad);
        const y = brickTop + r * (bh + brickPad);
        bs.push({ x, y, w: bw, h: bh, alive: true, hp: 1 });
      }
    }
    return bs;
  };

  const layout = (ctx: CanvasRenderingContext2D) => {
    const W = ctx.canvas.width / (window.devicePixelRatio || 1);
    const H = ctx.canvas.height / (window.devicePixelRatio || 1);

    paddleRef.current.w = Math.max(80, Math.min(160, Math.floor(W * 0.16)));
    paddleRef.current.h = 14;
    paddleRef.current.x = (W - paddleRef.current.w) / 2;
    paddleRef.current.y = H - 36;

    const angle = -Math.PI / 3 + Math.random() * (Math.PI / 3);
    const speed = 300 + Math.min(180, (levelRef.current - 1) * 40);
    ballRef.current.r = 8;
    ballRef.current.x = W / 2;
    ballRef.current.y = paddleRef.current.y - 20;
    ballRef.current.vx = Math.cos(angle) * speed;
    ballRef.current.vy = Math.sin(angle) * speed;

    bricksRef.current = buildBricks(W, H, levelRef.current);
  };

  // 初期レイアウト & ループ
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    withDPR(ctx, vw, vh);
    layout(ctx);

    let raf = 0; let last = performance.now();
    const loop = (t: number) => {
      const dt = Math.min(1/30, (t - last) / 1000);
      last = t;
      const W = ctx.canvas.width / (window.devicePixelRatio || 1);
      const H = ctx.canvas.height / (window.devicePixelRatio || 1);
      if (runningRef.current && !pausedRef.current) step(dt, W, H);
      draw(ctx, W, H);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [vw, vh]);

  const draw = (ctx: CanvasRenderingContext2D, W: number, H: number) => {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#0b1020"; ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = "white";
    ctx.font = "16px ui-sans-serif, system-ui, -apple-system, Segoe UI";
    ctx.textBaseline = "top";
    ctx.fillText(`Score: ${scoreRef.current}`, 12, 10);
    ctx.fillText(`Lives: ${livesRef.current}`, W - 90, 10);
    ctx.fillText(`Level: ${levelRef.current}`, W / 2 - 30, 10);

    for (const b of bricksRef.current) if (b.alive) {
      const g = ctx.createLinearGradient(b.x, b.y, b.x, b.y + b.h);
      g.addColorStop(0, "#3fb5ff"); g.addColorStop(1, "#2674ff");
      ctx.fillStyle = g; ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.strokeStyle = "rgba(255,255,255,0.15)"; ctx.strokeRect(b.x + .5, b.y + .5, b.w - 1, b.h - 1);
    }

    const p = paddleRef.current; ctx.fillStyle = "#f0f3f9"; ctx.fillRect(p.x, p.y, p.w, p.h);

    const ball = ballRef.current; ctx.beginPath(); ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2); ctx.closePath(); ctx.fillStyle = "#ffe066"; ctx.fill();

    if (messageRef.current) {
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.font = "24px ui-sans-serif, system-ui, -apple-system, Segoe UI";
      const m = messageRef.current; const metrics = ctx.measureText(m);
      ctx.fillText(m, (W - metrics.width) / 2, H / 2 - 16);
    }
  };

  const step = (dt: number, W: number, H: number) => {
    const p = paddleRef.current; const ball = ballRef.current; const input = inputRef.current;
    if (input.left) p.x -= p.speed * dt; if (input.right) p.x += p.speed * dt; p.x = clamp(p.x, 8, W - p.w - 8);
    ball.x += ball.vx * dt; ball.y += ball.vy * dt;
    if (ball.x < ball.r + 2) { ball.x = ball.r + 2; ball.vx *= -1; }
    if (ball.x > W - ball.r - 2) { ball.x = W - ball.r - 2; ball.vx *= -1; }
    if (ball.y < ball.r + 2) { ball.y = ball.r + 2; ball.vy *= -1; }

    if (ball.y + ball.r >= p.y && ball.y + ball.r <= p.y + p.h + 10 && ball.x >= p.x - ball.r && ball.x <= p.x + p.w + ball.r && ball.vy > 0) {
      ball.y = p.y - ball.r - 0.1;
      const hit = (ball.x - (p.x + p.w / 2)) / (p.w / 2);
      const speed = Math.hypot(ball.vx, ball.vy) * 1.02;
      const angle = (-Math.PI / 3) * hit;
      ball.vx = speed * Math.sin(angle);
      ball.vy = -Math.abs(speed * Math.cos(angle));
    }

    for (const b of bricksRef.current) {
      if (!b.alive) continue;
      const cx = clamp(ball.x, b.x, b.x + b.w); const cy = clamp(ball.y, b.y, b.y + b.h);
      const dx = ball.x - cx, dy = ball.y - cy;
      if (dx*dx + dy*dy <= ball.r*ball.r) {
        const overlapX = Math.min(Math.abs(ball.x - b.x), Math.abs(ball.x - (b.x + b.w)));
        const overlapY = Math.min(Math.abs(ball.y - b.y), Math.abs(ball.y - (b.y + b.h)));
        if (overlapX < overlapY) ball.vx *= -1; else ball.vy *= -1;
        b.hp -= 1; if (b.hp <= 0) b.alive = false;
        setScore(s => { const ns = s + 10; scoreRef.current = ns; return ns; });
        break;
      }
    }

    if (ball.y - ball.r > H) {
      setLives(l => { const nl = l - 1; livesRef.current = nl; return nl; });
      ball.x = W / 2; ball.y = p.y - 20;
      const angle = -Math.PI / 3 + Math.random() * (Math.PI / 3);
      const speed = 300 + Math.min(180, (levelRef.current - 1) * 40);
      ball.vx = Math.cos(angle) * speed; ball.vy = Math.sin(angle) * speed;
      setMessage(m => { messageRef.current = "Life -1"; return "Life -1"; });
      setTimeout(() => { setMessage(m => { messageRef.current = null; return null; }); }, 700);
    }

    if (bricksRef.current.every(b => !b.alive)) {
      setMessage(m => { messageRef.current = "Stage Clear!"; return "Stage Clear!"; });
      setPaused(pv => { pausedRef.current = true; return true; });
      setTimeout(() => {
        setLevel(lv => { const nl = lv + 1; levelRef.current = nl; return nl; });
        setPaused(pv => { pausedRef.current = false; return false; });
        const ctx = canvasRef.current?.getContext("2d"); if (ctx) layout(ctx);
      }, 800);
    }
  };

  // 入力
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const pressed = e.type === "keydown";
      if (["ArrowLeft", "a", "A"].includes(e.key)) inputRef.current.left = pressed;
      if (["ArrowRight", "d", "D"].includes(e.key)) inputRef.current.right = pressed;
      if (e.code === "Space" && pressed) {
        const next = !pausedRef.current;
        setPaused(next); pausedRef.current = next;
        setMessage(next ? "Paused" : null); messageRef.current = next ? "Paused" : null;
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("keyup", onKey); };
  }, []);

  // タッチ/マウス
  const onTouch = (clientX: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return; const p = paddleRef.current;
    const x = clientX - rect.left; p.x = clamp(x - p.w / 2, 8, rect.width - p.w - 8);
  };

  const startGame = () => {
    setRunning(true); runningRef.current = true;
    setPaused(false); pausedRef.current = false;
    setMessage(null); messageRef.current = null;
    setScore(0); scoreRef.current = 0;
    setLives(3); livesRef.current = 3;
    setLevel(1); levelRef.current = 1;
    const ctx = canvasRef.current?.getContext("2d"); if (ctx) { withDPR(ctx, vw, vh); layout(ctx); }
  };

  const restart = () => {
    setRunning(true); runningRef.current = true;
    setPaused(false); pausedRef.current = false;
    setMessage(null); messageRef.current = null;
    setScore(0); scoreRef.current = 0;
    setLives(3); livesRef.current = 3;
    const ctx = canvasRef.current?.getContext("2d"); if (ctx) { withDPR(ctx, vw, vh); layout(ctx); }
  };

  // ライフ尽きたらゲームオーバー
  useEffect(() => {
    if (lives <= 0) {
      setMessage("Game Over"); messageRef.current = "Game Over";
      setPaused(true); pausedRef.current = true;
      setRunning(false); runningRef.current = false;
    }
  }, [lives]);

  return (
    <div ref={wrapRef} className="w-full flex items-center justify-center p-4">
      <div className="w-full max-w-[980px]">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-xl font-semibold">Breakout (React + Canvas)</h1>
          <div className="flex items-center gap-2">
            {!running ? (
              <button className="px-3 py-1.5 rounded-2xl bg-blue-600 text-white shadow hover:opacity-90" onClick={startGame}>Start</button>
            ) : (
              <>
                <button
                  className="px-3 py-1.5 rounded-2xl bg-slate-700 text-white shadow hover:opacity-90"
                  onClick={() => {
                    const next = !pausedRef.current;
                    setPaused(next); pausedRef.current = next;
                    setMessage(next ? "Paused" : null); messageRef.current = next ? "Paused" : null;
                  }}
                >
                  {paused ? "Resume" : "Pause"}
                </button>
                <button className="px-3 py-1.5 rounded-2xl bg-blue-600 text-white shadow hover:opacity-90" onClick={restart}>Restart</button>
              </>
            )}
          </div>
        </div>

        <div className="rounded-2xl overflow-hidden shadow-lg ring-1 ring-black/10 bg-slate-900">
          <canvas ref={canvasRef} width={vw} height={vh} className="block w-full h-auto" />
          <div
            className="relative select-none"
            style={{ height: 40, touchAction: "none" }}
            onTouchStart={(e) => onTouch(e.touches[0].clientX)}
            onTouchMove={(e) => onTouch(e.touches[0].clientX)}
            onMouseDown={(e) => onTouch(e.clientX)}
            onMouseMove={(e) => { if (e.buttons) onTouch(e.clientX); }}
          >
            <div className="absolute inset-0 opacity-0" />
          </div>
        </div>

        <p className="mt-3 text-sm text-slate-600">操作: 左右キー/A・D でパドル移動、Space で一時停止/再開。レベル自動アップ。</p>
      </div>
    </div>
  );
}