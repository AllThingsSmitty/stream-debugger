'use client';

import { useState } from 'react';
import { FileImporter } from '@/components/FileImporter';
import { Timeline } from '@/components/Timeline';
import { ReplayControls } from '@/components/ReplayControls';
import { StatsPanel } from '@/components/StatsPanel';
import { ExportButton } from '@/components/ExportButton';
import { useStreamPlayback } from '@/hooks/useStreamPlayback';

export default function Home() {
  const [showTimeline, setShowTimeline] = useState(false);
  const stream = useStreamPlayback((s) => s.stream);

  return (
    <main className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100">
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900">Stream Debugger</h1>
          <p className="text-gray-600 mt-2">Inspect and replay streaming LLM responses</p>
        </div>

        {!stream ? (
          /* Upload state */
          <div className="flex justify-center items-center py-12">
            <FileImporter />
          </div>
        ) : (
          /* Viewer state */
          <div className="space-y-6">
            {/* Stats bar */}
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">Statistics</h2>
                <ExportButton />
              </div>
              <StatsPanel />
            </div>

            {/* Main viewer layout */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Timeline */}
              <div className="lg:col-span-2 bg-white rounded-lg shadow p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold">Event Timeline</h2>
                  <button
                    onClick={() => setShowTimeline(!showTimeline)}
                    className="text-sm px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded"
                  >
                    {showTimeline ? 'Hide' : 'Show'}
                  </button>
                </div>
                {showTimeline && (
                  <div className="max-h-96 overflow-y-auto">
                    <Timeline />
                  </div>
                )}
              </div>

              {/* Detail pane */}
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-lg font-semibold mb-4">Current Event</h2>
                <DetailPane />
              </div>
            </div>

            {/* Replay controls */}
            <div className="bg-white rounded-lg shadow p-6">
              <ReplayControls />
            </div>

            {/* Reset button */}
            <div className="text-center">
              <button
                onClick={() => useStreamPlayback.setState({ stream: null })}
                className="px-4 py-2 bg-gray-300 hover:bg-gray-400 text-gray-800 rounded font-semibold"
              >
                ← Load Different File
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

function DetailPane() {
  const event = useStreamPlayback((s) => s.getCurrentEvent());

  if (!event) {
    return <p className="text-gray-500 text-sm">No event selected</p>;
  }

  return (
    <div className="space-y-3 font-mono text-sm">
      <div>
        <p className="font-semibold text-gray-600">Timestamp</p>
        <p className="text-gray-900">{event.timestamp}ms</p>
      </div>

      {event.duration !== undefined && (
        <div>
          <p className="font-semibold text-gray-600">Duration</p>
          <p className="text-gray-900">{event.duration}ms</p>
        </div>
      )}

      <div>
        <p className="font-semibold text-gray-600">Content</p>
        <p className="text-gray-900 break-words whitespace-pre-wrap">
          {event.data?.content || '(empty)'}
        </p>
      </div>

      {event.data?.finish_reason && (
        <div>
          <p className="font-semibold text-gray-600">Finish Reason</p>
          <p className="text-gray-900">{event.data.finish_reason}</p>
        </div>
      )}

      {event.data?.usage && (
        <div>
          <p className="font-semibold text-gray-600">Usage</p>
          <p className="text-gray-900">{event.data.usage.completion_tokens} tokens</p>
        </div>
      )}
    </div>
  );
}
