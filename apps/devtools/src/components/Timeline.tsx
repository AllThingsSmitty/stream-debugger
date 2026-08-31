'use client';

import { useStreamPlayback } from '@/hooks/useStreamPlayback';
import type { StreamEvent } from '@stream-debugger/core';

export function Timeline() {
  const stream = useStreamPlayback((s) => s.stream);
  const currentIndex = useStreamPlayback((s) => s.currentIndex);
  const seek = useStreamPlayback((s) => s.seek);

  if (!stream || stream.events.length === 0) {
    return (
      <div className="p-8 text-center text-gray-500">
        <p>No stream loaded. Import a .stream file to begin.</p>
      </div>
    );
  }

  return (
    <div className="w-full border-l-4 border-blue-500 pl-6">
      <div className="grid grid-cols-1 gap-3">
        {stream.events.map((event, idx) => (
          <TimelineEvent
            key={idx}
            event={event}
            index={idx}
            isActive={idx === currentIndex}
            onClick={() => seek(idx)}
          />
        ))}
      </div>
    </div>
  );
}

interface TimelineEventProps {
  event: StreamEvent;
  index: number;
  isActive: boolean;
  onClick: () => void;
}

function TimelineEvent({ event, index, isActive, onClick }: TimelineEventProps) {
  const content = (event.data || '').toString();
  const preview = content.substring(0, 50) + (content.length > 50 ? '...' : '');

  return (
    <button
      onClick={onClick}
      className={`p-3 rounded-lg text-left transition-all ${
        isActive
          ? 'bg-blue-100 border-l-4 border-blue-500 shadow-md'
          : 'bg-gray-50 hover:bg-gray-100 border-l-4 border-gray-300'
      }`}
    >
      <div className="flex items-baseline gap-3">
        <span className="text-sm font-mono text-gray-500 min-w-12">{index + 1}</span>
        <div className="flex-1">
          <p className="font-mono text-sm text-gray-700">{preview}</p>
          <div className="flex gap-4 mt-1 text-xs text-gray-500">
            <span>@{event.offsetMs}ms</span>
            <span className="text-gray-400">{event.type}</span>
          </div>
        </div>
      </div>
    </button>
  );
}
