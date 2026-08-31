'use client';

import type { StreamDocument } from '@stream-debugger/core';
import { useStreamPlayback } from '@/hooks/useStreamPlayback';

export function ExportButton() {
  const stream = useStreamPlayback((s) => s.stream);

  const handleExport = () => {
    if (!stream) return;

    const markdown = generateMarkdown(stream);
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stream-${Date.now()}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <button
      onClick={handleExport}
      disabled={!stream}
      className={`px-4 py-2 rounded font-semibold transition-colors ${
        stream
          ? 'bg-green-500 text-white hover:bg-green-600'
          : 'bg-gray-300 text-gray-500 cursor-not-allowed'
      }`}
    >
      📥 Export as Markdown
    </button>
  );
}

function generateMarkdown(stream: StreamDocument): string {
  const metadata = stream.metadata || {};
  const events = stream.events || [];
  const summary = stream.summary || {};

  let md = '# Stream Export\n\n';

  // Metadata section
  md += '## Stream Information\n\n';
  if (metadata.model) md += `- **Model**: ${metadata.model}\n`;
  if (metadata.response?.finishReason) md += `- **Finish Reason**: ${metadata.response.finishReason}\n`;
  if (summary.estimatedCost) md += `- **Estimated Cost**: $${summary.estimatedCost.amount.toFixed(4)}\n`;
  if (summary.totalTokens) md += `- **Total Tokens**: ${summary.totalTokens}\n`;
  md += '\n';

  // Events section
  md += '## Token Stream\n\n';
  md += '| # | Offset (ms) | Type | Content |\n';
  md += '|---|------------|------|----------|\n';

  events.forEach((event, idx) => {
    const content = (event.data || '')
      .replace(/\n/g, ' ')
      .substring(0, 50);
    md += `| ${idx + 1} | ${event.offsetMs} | ${event.type} | ${content} |\n`;
  });

  return md;
}
