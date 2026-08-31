'use client';

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

function generateMarkdown(stream: any): string {
  const metadata = stream.metadata || {};
  const events = stream.events || [];

  let md = '# Stream Export\n\n';

  // Metadata section
  md += '## Stream Information\n\n';
  if (metadata.model) md += `- **Model**: ${metadata.model}\n`;
  if (metadata.finish_reason) md += `- **Finish Reason**: ${metadata.finish_reason}\n`;
  if (metadata.cost_estimate) md += `- **Estimated Cost**: $${metadata.cost_estimate.toFixed(4)}\n`;
  md += '\n';

  // Events section
  md += '## Token Stream\n\n';
  md += '| # | Timestamp | Duration | Content |\n';
  md += '|---|-----------|----------|----------|\n';

  events.forEach((event, idx) => {
    const content = (event.data?.content || '')
      .replace(/\n/g, ' ')
      .substring(0, 50);
    const duration = event.duration ? `${event.duration}ms` : '-';
    md += `| ${idx + 1} | ${event.timestamp}ms | ${duration} | ${content} |\n`;
  });

  return md;
}
