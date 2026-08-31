import { create } from 'zustand';
import type { StreamDocument, StreamEvent } from '@stream-debugger/core';

interface PlaybackState {
  stream: StreamDocument | null;
  currentIndex: number;
  isPlaying: boolean;
  speed: number;
  duration: number;

  setStream: (stream: StreamDocument) => void;
  play: () => void;
  pause: () => void;
  seek: (index: number) => void;
  setSpeed: (speed: number) => void;
  reset: () => void;
  getCurrentEvent: () => StreamEvent | null;
  getProgress: () => number;
}

export const useStreamPlayback = create<PlaybackState>((set, get) => ({
  stream: null,
  currentIndex: 0,
  isPlaying: false,
  speed: 1,
  duration: 0,

  setStream: (stream) => {
    const duration = stream.events.length > 0
      ? Math.max(...stream.events.map(e => e.offsetMs))
      : 0;
    set({ stream, currentIndex: 0, duration, isPlaying: false });
  },

  play: () => set({ isPlaying: true }),
  pause: () => set({ isPlaying: false }),

  seek: (index) => {
    const state = get();
    const clamped = Math.max(0, Math.min(index, (state.stream?.events.length || 1) - 1));
    set({ currentIndex: clamped });
  },

  setSpeed: (speed) => set({ speed: Math.max(0.25, Math.min(4, speed)) }),

  reset: () => set({ currentIndex: 0, isPlaying: false }),

  getCurrentEvent: () => {
    const state = get();
    return state.stream?.events[state.currentIndex] || null;
  },

  getProgress: () => {
    const state = get();
    if (!state.stream || state.duration === 0) return 0;
    return (state.currentIndex / Math.max(1, state.stream.events.length - 1)) * 100;
  },
}));
