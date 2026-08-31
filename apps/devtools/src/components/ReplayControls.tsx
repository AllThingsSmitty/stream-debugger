'use client';

import { useEffect, useRef } from 'react';
import { useStreamPlayback } from '@/hooks/useStreamPlayback';

export function ReplayControls() {
  const animationRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const isPlaying = useStreamPlayback((s) => s.isPlaying);
  const speed = useStreamPlayback((s) => s.speed);
  const progress = useStreamPlayback((s) => s.getProgress());
  const currentIndex = useStreamPlayback((s) => s.currentIndex);
  const stream = useStreamPlayback((s) => s.stream);

  const play = useStreamPlayback((s) => s.play);
  const pause = useStreamPlayback((s) => s.pause);
  const seek = useStreamPlayback((s) => s.seek);
  const setSpeed = useStreamPlayback((s) => s.setSpeed);

  const totalEvents = stream?.events.length || 0;
  const eventNum = currentIndex + 1;

  useEffect(() => {
    if (!isPlaying || !stream || stream.events.length === 0) {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      startTimeRef.current = null;
      return;
    }

    if (startTimeRef.current === null) {
      startTimeRef.current = performance.now();
    }

    const animate = (now: number) => {
      const elapsed = (now - startTimeRef.current!) * speed;
      const events = stream.events;
      const currentIdx = useStreamPlayback.getState().currentIndex;
      let nextIndex = currentIdx;

      for (let i = currentIdx; i < events.length; i++) {
        const event = events[i];
        if (event && typeof event.offsetMs === 'number' && event.offsetMs <= elapsed) {
          nextIndex = i;
        } else {
          break;
        }
      }

      if (nextIndex >= events.length - 1) {
        pause();
        seek(events.length - 1);
        startTimeRef.current = null;
      } else {
        if (nextIndex !== currentIdx) {
          seek(nextIndex);
        }
        animationRef.current = requestAnimationFrame(animate);
      }
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [isPlaying, stream, speed, pause, seek]);

  return (
    <div className="w-full border-t pt-4 mt-4">
      {/* Progress bar */}
      <div className="mb-4">
        <input
          type="range"
          min="0"
          max="100"
          value={progress}
          onChange={(e) => {
            const percent = parseFloat(e.target.value);
            const index = Math.round((percent / 100) * Math.max(0, totalEvents - 1));
            seek(index);
          }}
          className="w-full h-2 bg-gray-200 rounded cursor-pointer accent-blue-500"
        />
        <p className="text-xs text-gray-500 mt-1 text-center">
          {eventNum} / {totalEvents}
        </p>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-4 justify-center">
        <button
          onClick={() => seek(0)}
          className="px-3 py-2 text-sm font-mono bg-gray-100 hover:bg-gray-200 rounded"
          title="Go to start"
        >
          ⏮
        </button>

        <button
          onClick={() => isPlaying ? pause() : play()}
          className="px-4 py-2 text-sm font-mono bg-blue-500 text-white hover:bg-blue-600 rounded"
        >
          {isPlaying ? '⏸ Pause' : '▶ Play'}
        </button>

        <button
          onClick={() => seek(Math.max(0, currentIndex - 1))}
          className="px-3 py-2 text-sm font-mono bg-gray-100 hover:bg-gray-200 rounded"
          title="Previous event"
        >
          ⏪
        </button>

        <button
          onClick={() => seek(Math.min(totalEvents - 1, currentIndex + 1))}
          className="px-3 py-2 text-sm font-mono bg-gray-100 hover:bg-gray-200 rounded"
          title="Next event"
        >
          ⏩
        </button>

        {/* Speed control */}
        <div className="flex items-center gap-2">
          <label htmlFor="speed" className="text-sm text-gray-600">
            Speed:
          </label>
          <select
            id="speed"
            value={speed}
            onChange={(e) => setSpeed(parseFloat(e.target.value))}
            className="px-2 py-1 text-sm bg-white border border-gray-300 rounded"
          >
            <option value={0.25}>0.25x</option>
            <option value={0.5}>0.5x</option>
            <option value={1}>1x</option>
            <option value={1.5}>1.5x</option>
            <option value={2}>2x</option>
            <option value={4}>4x</option>
          </select>
        </div>
      </div>
    </div>
  );
}
