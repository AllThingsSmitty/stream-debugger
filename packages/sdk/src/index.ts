export const version = '0.1.0';

// Core re-exports (types and utilities)
export { serializeStream, deserializeStream } from '@stream-debugger/core';
export type {
  StreamDocument,
  StreamMetadata,
  StreamEvent,
  StreamSummary,
  WaterfallData,
} from '@stream-debugger/core';

// Adapter types
export type { StreamAdapter, StreamCapture, CaptureConfig } from './types/adapter';

// Adapters
export { OpenAIStreamAdapter } from './adapters/openai';
export { AnthropicStreamAdapter } from './adapters/anthropic';
export { GeminiStreamAdapter } from './adapters/gemini';
