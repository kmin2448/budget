'use client';

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

// ── 내부 캔버스 해상도 (고정) ──────────────────────────────────────
const W = 600;
const H = 200;
const ASPECT = W / H;
const GROUND_Y = 155;
const DINO_X = 55;
const DINO_W = 48;
const DINO_H = 52;
const GRAVITY = 0.7;
const JUMP_VEL = -15;
const BASE_SPEED = 5;

type State = 'idle' | 'running' | 'over';

export function DinoGame({ onClose }: { onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  // ── 창 크기 (CSS 표시 크기만 변경, 내부 해상도 불변) ──────────
  const [dispW, setDispW] = useState(W);
  const dispH = Math.round(dispW / ASPECT);

  // ── 리사이즈 핸들 (오른쪽 하단 코너 드래그) ──────────────────
  const resizeRef = useRef<{ startX: number; startW: number } | null>(null);

  function onResizeDown(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    resizeRef.current = { startX: e.clientX, startW: dispW };

    function onMove(ev: MouseEvent) {
      if (!resizeRef.current) return;
      const newW = Math.max(320, Math.min(1100, resizeRef.current.startW + (ev.clientX - resizeRef.current.startX)));
      setDispW(Math.round(newW));
    }
    function onUp() {
      resizeRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  // ── 게임 루프 ─────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;

    // gomduri 이미지 로드
    const gom = new Image();
    gom.src = '/gomduri.png';
    let gomLoaded = false;
    gom.onload = () => { gomLoaded = true; };

    let state: State = 'idle';
    let score = 0;
    let hiScore = 0;
    let speed = BASE_SPEED;
    let dinoY = GROUND_Y - DINO_H;
    let dinoVY = 0;
    let onGround = true;
    let cacti: { x: number; h: number }[] = [];
    let clouds: { x: number; y: number; w: number }[] = [
      { x: 180, y: 32, w: 64 },
      { x: 420, y: 48, w: 80 },
    ];
    let frame = 0;
    let nextCactus = 90;
    let animId = 0;

    function drawGomduri() {
      const bounce = (state === 'running' && onGround) ? Math.sin(frame * 0.35) * 2.5 : 0;
      const x = DINO_X - 4;
      const y = dinoY + bounce - 4;
      const iw = DINO_W + 8;
      const ih = DINO_H + 8;
      if (gomLoaded) {
        ctx.drawImage(gom, x, y, iw, ih);
      } else {
        ctx.fillStyle = '#888';
        ctx.fillRect(DINO_X, dinoY, DINO_W, DINO_H);
      }
    }

    function drawCactus(cx: number, ch: number) {
      ctx.fillStyle = '#535353';
      const base = GROUND_Y;
      ctx.fillRect(cx + 8, base - ch, 10, ch);
      ctx.fillRect(cx, base - ch * 0.65, 12, 7);
      ctx.fillRect(cx, base - ch * 0.65 - 18, 7, 20);
      ctx.fillRect(cx + 18, base - ch * 0.55, 14, 7);
      ctx.fillRect(cx + 25, base - ch * 0.55 - 16, 7, 18);
    }

    function draw() {
      ctx.fillStyle = '#f9f9f4';
      ctx.fillRect(0, 0, W, H);

      // 구름
      ctx.fillStyle = '#e8e8e0';
      for (const c of clouds) {
        ctx.beginPath();
        ctx.ellipse(c.x, c.y, c.w / 2, 12, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(c.x - c.w / 4, c.y + 4, c.w / 3, 9, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(c.x + c.w / 4, c.y + 5, c.w / 3.5, 8, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      // 지면
      ctx.strokeStyle = '#535353';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, GROUND_Y);
      ctx.lineTo(W, GROUND_Y);
      ctx.stroke();
      ctx.fillStyle = '#c8c8c0';
      for (let i = 5; i < W; i += 28 + ((i * 7) % 22)) {
        ctx.fillRect(i, GROUND_Y + 3, 3, 2);
      }

      for (const c of cacti) drawCactus(c.x, c.h);
      drawGomduri();

      // 점수
      ctx.fillStyle = '#535353';
      ctx.font = 'bold 14px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(
        `HI ${String(Math.floor(hiScore)).padStart(5, '0')}  ${String(Math.floor(score)).padStart(5, '0')}`,
        W - 10, 22,
      );

      if (state === 'idle') {
        ctx.fillStyle = '#535353';
        ctx.font = 'bold 15px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('스페이스 / 클릭으로 시작', W / 2, H / 2 + 18);
      }
      if (state === 'over') {
        ctx.fillStyle = '#535353';
        ctx.font = 'bold 18px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('G A M E  O V E R', W / 2, H / 2 - 8);
        ctx.font = '13px monospace';
        ctx.fillText('스페이스 / 클릭으로 재시작', W / 2, H / 2 + 16);
      }
    }

    function reset() {
      state = 'running';
      score = 0;
      speed = BASE_SPEED;
      dinoY = GROUND_Y - DINO_H;
      dinoVY = 0;
      onGround = true;
      cacti = [];
      frame = 0;
      nextCactus = 90;
    }

    function handleInput() {
      if (state === 'idle' || state === 'over') {
        reset();
      } else if (state === 'running' && onGround) {
        dinoVY = JUMP_VEL;
        onGround = false;
      }
    }

    function loop() {
      if (state === 'running') {
        frame++;
        score += 0.12;
        speed = BASE_SPEED + Math.floor(score / 80) * 0.4;

        dinoVY += GRAVITY;
        dinoY += dinoVY;
        if (dinoY >= GROUND_Y - DINO_H) {
          dinoY = GROUND_Y - DINO_H;
          dinoVY = 0;
          onGround = true;
        }

        clouds = clouds.map((c) => ({ ...c, x: c.x - speed * 0.2 }));
        if (clouds[0].x < -80) clouds[0] = { x: W + 80, y: 20 + Math.random() * 40, w: 50 + Math.random() * 50 };
        if (clouds[1].x < -80) clouds[1] = { x: W + 80, y: 20 + Math.random() * 40, w: 50 + Math.random() * 50 };

        nextCactus--;
        if (nextCactus <= 0) {
          cacti.push({ x: W + 10, h: 38 + Math.random() * 32 });
          nextCactus = 55 + Math.random() * 75 - Math.min(speed * 3, 25);
        }
        cacti = cacti.map((c) => ({ ...c, x: c.x - speed })).filter((c) => c.x > -50);

        // 충돌 (gomduri 이미지 기준으로 톨러런스 적용)
        const dL = DINO_X + 8;
        const dR = DINO_X + DINO_W - 6;
        const dT = dinoY + 10;
        const dB = dinoY + DINO_H - 2;
        for (const c of cacti) {
          if (dR > c.x + 4 && dL < c.x + 24 && dB > GROUND_Y - c.h + 5) {
            state = 'over';
            if (score > hiScore) hiScore = score;
            draw();
            return;
          }
        }
      }

      draw();
      animId = requestAnimationFrame(loop);
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'ArrowUp') {
        e.preventDefault();
        handleInput();
      }
      if (e.code === 'Escape') onCloseRef.current();
    };

    canvas.addEventListener('click', handleInput);
    window.addEventListener('keydown', onKeyDown);
    animId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(animId);
      canvas.removeEventListener('click', handleInput);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative rounded-xl bg-white p-5 shadow-2xl select-none">
        <button
          onClick={onClose}
          className="absolute right-3 top-3 rounded p-1 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
        <p className="mb-2 text-center text-[11px] text-gray-400">
          스페이스바 / 클릭으로 점프 &nbsp;|&nbsp; ESC / 바깥 클릭으로 닫기 &nbsp;|&nbsp; 오른쪽 하단 드래그로 크기 조절
        </p>

        {/* 캔버스 + 리사이즈 핸들 컨테이너 */}
        <div className="relative" style={{ width: dispW, height: dispH }}>
          <canvas
            ref={canvasRef}
            width={W}
            height={H}
            className="block rounded-lg border border-gray-200"
            style={{ width: dispW, height: dispH, cursor: 'pointer' }}
          />

          {/* 오른쪽 하단 리사이즈 핸들 */}
          <div
            onMouseDown={onResizeDown}
            className="absolute bottom-0 right-0 h-5 w-5 cursor-se-resize rounded-br-lg"
            style={{
              background: 'linear-gradient(135deg, transparent 45%, #9ca3af 45%)',
            }}
          />
        </div>
      </div>
    </div>
  );
}
