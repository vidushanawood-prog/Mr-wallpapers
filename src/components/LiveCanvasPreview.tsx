import React, { useEffect, useRef } from 'react';
import { drawProceduralFrame } from '../utils/mediaEngine';

interface LiveCanvasPreviewProps {
  presetId: string;
  animate?: boolean;
  className?: string;
}

export const LiveCanvasPreview: React.FC<LiveCanvasPreviewProps> = ({
  presetId,
  animate = true,
  className = 'w-full h-full object-cover',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;
    const start = performance.now();

    const render = (now: number) => {
      const elapsed = (now - start) / 1000;
      drawProceduralFrame(ctx, canvas.width, canvas.height, presetId, elapsed);
      if (animate) {
        rafId = requestAnimationFrame(render);
      }
    };

    rafId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafId);
  }, [presetId, animate]);

  return (
    <canvas
      ref={canvasRef}
      width={640}
      height={360}
      className={className}
    />
  );
};
