'use client';

import { useState, useCallback } from 'react';
import type { StreamDocument } from '@stream-debugger/core';
import { useStreamPlayback } from '@/hooks/useStreamPlayback';

interface FileImporterProps {
  onImport?: (stream: StreamDocument) => void;
}

export function FileImporter({ onImport }: FileImporterProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setStream = useStreamPlayback((s) => s.setStream);

  const handleFile = useCallback(async (file: File) => {
    try {
      setError(null);
      const text = await file.text();
      const stream = JSON.parse(text) as StreamDocument;

      // Validate basic structure
      if (!stream.events || !Array.isArray(stream.events)) {
        throw new Error('Invalid .stream file: missing events array');
      }

      setStream(stream);
      onImport?.(stream);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to parse file';
      setError(message);
    }
  }, [setStream, onImport]);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFile(files[0]);
    }
  }, [handleFile]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      handleFile(e.target.files[0]);
    }
  }, [handleFile]);

  return (
    <div className="w-full max-w-2xl">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
          isDragging
            ? 'border-blue-400 bg-blue-50'
            : 'border-gray-300 hover:border-gray-400 bg-gray-50'
        }`}
      >
        <input
          type="file"
          accept=".stream,.json"
          onChange={handleChange}
          className="hidden"
          id="file-input"
        />
        <label htmlFor="file-input" className="cursor-pointer">
          <div className="text-4xl mb-2">📁</div>
          <p className="text-lg font-semibold text-gray-700">
            Drop your .stream file here
          </p>
          <p className="text-sm text-gray-500 mt-2">
            or click to browse
          </p>
        </label>
      </div>

      {error && (
        <div className="mt-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
          <p className="font-semibold">Error loading file:</p>
          <p className="text-sm">{error}</p>
        </div>
      )}
    </div>
  );
}
