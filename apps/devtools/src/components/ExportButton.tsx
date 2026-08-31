'use client';

import { useState } from 'react';
import type { StreamDocument } from '@stream-debugger/core';
import { useStreamPlayback } from '@/hooks/useStreamPlayback';

export function ExportButton() {
  const stream = useStreamPlayback((s) => s.stream);
  const [isOpen, setIsOpen] = useState(false);

  const exportFormats = [
    { label: 'Markdown', type: 'md', icon: '📄' },
    { label: 'CSV', type: 'csv', icon: '📊' },
    { label: 'HTML', type: 'html', icon: '🌐' },
  ];

  const handleExport = (format: string) => {
    if (!stream) return;

    let content = '';
    let mimeType = '';
    let ext = '';

    switch (format) {
      case 'md':
        content = generateMarkdown(stream);
        mimeType = 'text/markdown';
        ext = 'md';
        break;
      case 'csv':
        content = generateCSV(stream);
        mimeType = 'text/csv';
        ext = 'csv';
        break;
      case 'html':
        content = generateHTML(stream);
        mimeType = 'text/html';
        ext = 'html';
        break;
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stream-${Date.now()}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setIsOpen(false);
  };

  return (
    <div className="relative inline-block">
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={!stream}
        className={`px-4 py-2 rounded font-semibold transition-colors ${
          stream
            ? 'bg-green-500 text-white hover:bg-green-600'
            : 'bg-gray-300 text-gray-500 cursor-not-allowed'
        }`}
      >
        📥 Export
      </button>

      {isOpen && (
        <div className="absolute top-full mt-2 w-40 bg-white border border-gray-300 rounded shadow-lg z-10">
          {exportFormats.map((fmt) => (
            <button
              key={fmt.type}
              onClick={() => handleExport(fmt.type)}
              className="w-full px-4 py-2 text-left hover:bg-gray-100 transition-colors text-sm text-gray-700 first:rounded-t last:rounded-b"
            >
              {fmt.icon} {fmt.label}
            </button>
          ))}
        </div>
      )}
    </div>
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

function generateCSV(stream: StreamDocument): string {
  const metadata = stream.metadata || {};
  const events = stream.events || [];
  const summary = stream.summary || {};

  let csv = 'Stream Export\n\n';

  // Metadata section
  csv += 'Stream Information\n';
  csv += 'Property,Value\n';
  if (metadata.model) csv += `Model,"${metadata.model}"\n`;
  if (metadata.provider) csv += `Provider,"${metadata.provider}"\n`;
  if (metadata.response?.finishReason) csv += `Finish Reason,"${metadata.response.finishReason}"\n`;
  if (summary.estimatedCost) csv += `Estimated Cost,$${summary.estimatedCost.amount.toFixed(4)}\n`;
  if (summary.totalTokens) csv += `Total Tokens,${summary.totalTokens}\n`;
  if (summary.totalEvents) csv += `Total Events,${summary.totalEvents}\n`;
  csv += '\n';

  // Events section
  csv += 'Token Stream\n';
  csv += 'Index,Offset (ms),Type,Content\n';

  events.forEach((event, idx) => {
    const content = (event.data || '')
      .replace(/"/g, '""')
      .replace(/\n/g, ' ');
    csv += `${idx + 1},${event.offsetMs},"${event.type}","${content}"\n`;
  });

  return csv;
}

function generateHTML(stream: StreamDocument): string {
  const metadata = stream.metadata || {};
  const events = stream.events || [];
  const summary = stream.summary || {};

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Stream Export</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 1200px;
      margin: 0 auto;
      padding: 20px;
      background: #f5f5f5;
    }
    h1 { color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 10px; }
    h2 { color: #34495e; margin-top: 30px; }
    .info-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 15px;
      margin: 15px 0;
    }
    .info-card {
      background: white;
      padding: 15px;
      border-radius: 8px;
      border-left: 4px solid #3498db;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .info-card strong { color: #2c3e50; }
    table {
      width: 100%;
      border-collapse: collapse;
      background: white;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      margin: 15px 0;
    }
    th {
      background: #34495e;
      color: white;
      padding: 12px;
      text-align: left;
      font-weight: 600;
    }
    td {
      padding: 10px 12px;
      border-bottom: 1px solid #ecf0f1;
    }
    tr:hover { background: #f8f9fa; }
    .event-chunk { background: #e8f4f8; }
    .event-error { background: #fadbd8; }
    .event-marker { background: #fef5e7; }
    .footer {
      margin-top: 30px;
      padding-top: 15px;
      border-top: 1px solid #ecf0f1;
      color: #7f8c8d;
      font-size: 0.9em;
    }
  </style>
</head>
<body>
  <h1>📊 Stream Export Report</h1>

  <h2>Stream Information</h2>
  <div class="info-grid">
    ${metadata.model ? `<div class="info-card"><strong>Model:</strong> ${escapeHtml(metadata.model)}</div>` : ''}
    ${metadata.provider ? `<div class="info-card"><strong>Provider:</strong> ${escapeHtml(metadata.provider)}</div>` : ''}
    ${metadata.response?.finishReason ? `<div class="info-card"><strong>Finish Reason:</strong> ${escapeHtml(metadata.response.finishReason)}</div>` : ''}
    ${summary.totalTokens ? `<div class="info-card"><strong>Total Tokens:</strong> ${summary.totalTokens}</div>` : ''}
    ${summary.totalEvents ? `<div class="info-card"><strong>Total Events:</strong> ${summary.totalEvents}</div>` : ''}
    ${summary.estimatedCost ? `<div class="info-card"><strong>Estimated Cost:</strong> $${summary.estimatedCost.amount.toFixed(4)}</div>` : ''}
  </div>

  <h2>Token Stream</h2>
  <table>
    <thead>
      <tr>
        <th style="width: 50px;">#</th>
        <th style="width: 100px;">Offset (ms)</th>
        <th style="width: 80px;">Type</th>
        <th>Content</th>
      </tr>
    </thead>
    <tbody>
      ${events.map((event, idx) => {
        const content = (event.data || '').toString().substring(0, 100);
        const rowClass = event.type === 'chunk' ? 'event-chunk' : event.type === 'error' ? 'event-error' : 'event-marker';
        return `<tr class="${rowClass}">
          <td>${idx + 1}</td>
          <td>${event.offsetMs}</td>
          <td><strong>${escapeHtml(event.type)}</strong></td>
          <td><code>${escapeHtml(content)}</code></td>
        </tr>`;
      }).join('')}
    </tbody>
  </table>

  <div class="footer">
    <p>Generated by Stream Debugger on ${new Date().toISOString()}</p>
  </div>
</body>
</html>`;
}

function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}
