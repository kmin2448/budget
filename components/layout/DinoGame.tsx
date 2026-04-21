'use client';

import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

const W = 600;
const H = 200;
const GROUND_Y = 155;
const DINO_X = 55;
const DINO_W = 32;
const DINO_H = 42;
const GRAVITY = 0.7;
const JUMP_VEL = -15;
const BASE_SPEED = 5;

type State = 'idle' | 'running' | 'over';

export function DinoGame({ onClose }: { onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;

    let state: State = 'idle';
    let score = 0;
    let hiScore = 0;
    let speed = BASE_SPEED;
    let dinoY = GROUND_Y - DINO_H;
    let dinoVY = 0;
    let onGround = true;
    let cacti: { x: number; h: number }[] = [];
    let clouds: { x: number; y: number; w: number }[] = [
      { x: 150, y: 30, w: 60 },
      { x: 380, y: 45, w: 80 },
    ];
    let frame = 0;
    let nextCactus = 90;
    let animId = 0;

    function drawDino() {
      const x = DINO_X;
      const y = dinoY;
      const leg = onGround ? Math.floor(frame / 7) % 2 : 0;
      ctx.fillStyle = '#535353';

      // tail
      ctx.beginPath();
      ctx.moveTo(x, y + 14);
      ctx.lineTo(x - 10, y + 22);
      ctx.lineTo(x - 4, y + 22);
      ctx.lineTo(x, y + 18);
      ctx.fill();

      // body
      ctx.fillRect(x, y + 10, DINO_W - 4, DINO_H - 18);

      // neck + head
      ctx.fillRect(x + 10, y, DINO_W - 8, 18);
      ctx.fillRect(x + DINO_W - 8, y - 4, 16, 20);

      // eye
      ctx.fillStyle = '#f9f9f4';
      ctx.fillRect(x + DINO_W + 2, y - 1, 5, 5);
      ctx.fillStyle = '#535353';
      ctx.fillRect(x + DINO_W + 4, y, 3, 3);

      // mouth
      ctx.fillRect(x + DINO_W + 6, y + 10, 6, 3);

      // arms
      ctx.fillRect(x + DINO_W - 12, y + 18, 10, 5);

      // legs
      ctx.fillStyle = '#535353';
      if (!onGround) {
        ctx.fillRect(x + 4, y + DINO_H - 8, 9, 14);
        ctx.fillRect(x + 16, y + DINO_H - 12, 9, 10);
      } else if (leg === 0) {
        ctx.fillRect(x + 4, y + DINO_H - 8, 9, 14);
        ctx.fillRect(x + 16, y + DINO_H - 4, 9, 10);
      } else {
        ctx.fillRect(x + 4, y + DINO_H - 4, 9, 10);
        ctx.fillRect(x + 16, y + DINO_H - 8, 9, 14);
      }
    }

    function drawCactus(cx: number, ch: number) {
      ctx.fillStyle = '#535353';
      const base = GROUND_Y;
      const stemX = cx + 8;
      // stem
      ctx.fillRect(stemX, base - ch, 10, ch);
      // left arm
      ctx.fillRect(cx, base - ch * 0.65, stemX - cx, 7);
      ctx.fillRect(cx, base - ch * 0.65 - 18, 7, 20);
      // right arm
      ctx.fillRect(stemX + 10, base - ch * 0.55, 14, 7);
      ctx.fillRect(stemX + 17, base - ch * 0.55 - 16, 7, 18);
    }

    function draw() {
      ctx.fillStyle = '#f9f9f4';
      ctx.fillRect(0, 0, W, H);

      // clouds
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

      // ground
      ctx.strokeStyle = '#535353';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, GROUND_Y);
      ctx.lineTo(W, GROUND_Y);
      ctx.stroke();

      // ground dots
      ctx.fillStyle = '#c0c0b8';
      for (let i = 0; i < W; i += 30 + ((i * 7) % 25)) {
        ctx.fillRect(i, GROUND_Y + 3, 3, 2);
      }

      for (const c of cacti) drawCactus(c.x, c.h);
      drawDino();

      // score
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
        ctx.fillText('스페이스 / 클릭으로 시작', W / 2, H / 2 + 20);
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

        // physics
        dinoVY += GRAVITY;
        dinoY += dinoVY;
        if (dinoY >= GROUND_Y - DINO_H) {
          dinoY = GROUND_Y - DINO_H;
          dinoVY = 0;
          onGround = true;
        }

        // clouds
        clouds = clouds.map((c) => ({ ...c, x: c.x - speed * 0.2 }));
        if (clouds[0].x + clouds[0].w / 2 < 0) clouds[0] = { x: W + 60, y: 20 + Math.random() * 40, w: 50 + Math.random() * 50 };
        if (clouds[1].x + clouds[1].w / 2 < 0) clouds[1] = { x: W + 60, y: 20 + Math.random() * 40, w: 50 + Math.random() * 50 };

        // spawn cactus
        nextCactus--;
        if (nextCactus <= 0) {
          cacti.push({ x: W + 10, h: 38 + Math.random() * 32 });
          nextCactus = 55 + Math.random() * 75 - Math.min(speed * 3, 25);
        }

        cacti = cacti.map((c) => ({ ...c, x: c.x - speed })).filter((c) => c.x > -40);

        // collision
        const dL = DINO_X + 5;
        const dR = DINO_X + DINO_W + 8;
        const dT = dinoY + 5;
        const dB = dinoY + DINO_H;
        for (const c of cacti) {
          if (dR > c.x + 3 && dL < c.x + 24 && dB > GROUND_Y - c.h + 5) {
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
      <div className="relative rounded-xl bg-white p-5 shadow-2xl">
        <button
          onClick={onClose}
          className="absolute right-3 top-3 rounded p-1 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
        <p className="mb-2 text-center text-[11px] text-gray-400">
          스페이스바 또는 클릭으로 점프 &nbsp;|&nbsp; ESC / 바깥 클릭으로 닫기
        </p>
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          className="block rounded-lg border border-gray-200"
          style={{ cursor: 'pointer', imageRendering: 'pixelated' }}
        />
      </div>
    </div>
  );
}
