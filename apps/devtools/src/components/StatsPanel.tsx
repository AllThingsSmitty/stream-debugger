'use client';

import { useMemo } from 'react';
import { useStreamPlayback } from '@/hooks/useStreamPlayback';

export function StatsPanel() {
  const stream = useStreamPlayback((s) => s.stream);

  const stats = useMemo(() => {
    if (!stream) return null;

    const events = stream.events;
    if (events.length === 0) return null;

    const totalTime = Math.max(...events.map(e => e.offsetMs)) - Math.min(...events.map(e => e.offsetMs));
    const tokenCount = events.length;
    const ttft = events[0]?.offsetMs || 0;
    const throughput = totalTime > 0 ? ((tokenCount / totalTime) * 1000).toFixed(2) : '0.00';

    // Extract metadata if available
    const metadata = stream.metadata || {};
    const summary = stream.summary || {};
    const model = metadata.model || 'Unknown';
    const finishReason = metadata.response?.finishReason || '-';
    const cost = summary.estimatedCost?.amount || null;

    return {
      tokenCount,
      ttft,
      totalTime,
      throughput,
      model,
      finishReason,
      cost,
    };
  }, [stream]);

  if (!stream || !stats) {
    return (
      <div className="p-4 text-center text-gray-500">
        <p>Load a stream to see statistics</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
      <StatBox label="Tokens" value={stats.tokenCount.toString()} />
      <StatBox label="TTFT" value={`${stats.ttft}ms`} />
      <StatBox label="Duration" value={`${stats.totalTime.toFixed(0)}ms`} />
      <StatBox label="Throughput" value={`${stats.throughput} tok/s`} />
      <StatBox label="Model" value={stats.model} />
      <StatBox label="Finish Reason" value={stats.finishReason} />
      {stats.cost !== null && (
        <StatBox
          label="Estimated Cost"
          value={`$${stats.cost.toFixed(4)}`}
        />
      )}
    </div>
  );
}

interface StatBoxProps {
  label: string;
  value: string;
}

function StatBox({ label, value }: StatBoxProps) {
  return (
    <div className="p-3 bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-lg">
      <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
        {label}
      </p>
      <p className="text-lg font-mono font-bold text-blue-900 mt-1">
        {value}
      </p>
    </div>
  );
}
