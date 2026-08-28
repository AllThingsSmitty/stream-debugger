import type { StreamDocument } from '@stream-debugger/core';

/**
 * Configuration for stream capture
 */
export interface CaptureConfig {
  /** User ID for tracking */
  userId?: string;

  /** Session ID to group related streams */
  sessionId?: string;

  /** Purpose/category (chat, code_gen, analysis, etc.) */
  purpose?: string;

  /** Whether to include the full prompt in the stream */
  includePrompt?: boolean;

  /** Whether to include the full response in the stream */
  includeResponse?: boolean;

  /** Custom tags */
  tags?: Record<string, string | number | boolean>;
}

/**
 * Active stream capture session
 */
export interface StreamCapture {
  /** Unique stream ID */
  streamId: string;

  /** Finish the capture and return the .stream document */
  finish(): Promise<StreamDocument>;

  /** Get current document (may be incomplete) */
  getCurrent(): StreamDocument;

  /** Cancel capture */
  cancel(): void;
}

/**
 * Adapter interface for LLM providers
 */
export interface StreamAdapter {
  /**
   * Provider name (openai, anthropic, gemini, etc.)
   */
  provider: string;

  /**
   * Capture a streaming response
   */
  captureStream(
    params: Record<string, unknown>,
    config?: CaptureConfig
  ): Promise<StreamCapture>;
}
