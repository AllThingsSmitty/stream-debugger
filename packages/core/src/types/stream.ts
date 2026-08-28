/**
 * .stream format specification
 *
 * A .stream file captures a single streaming LLM response or real-time data stream.
 * Format: single-file JSON, optimized for replay and analysis.
 */

export const STREAM_FORMAT_VERSION = '1.0.0';

/**
 * Root stream document
 */
export interface StreamDocument {
  /** Format version (semver) */
  version: string;

  /** Stream metadata */
  metadata: StreamMetadata;

  /** Chronological events (tokens, chunks, errors, markers) */
  events: StreamEvent[];

  /** Timing and waterfall data for replay UI */
  waterfall: WaterfallData;

  /** Summary stats and export info */
  summary: StreamSummary;
}

/**
 * Stream metadata: provider, model, timing, context
 */
export interface StreamMetadata {
  /** Unique stream ID (crypto.randomUUID) */
  streamId: string;

  /** LLM provider (openai, anthropic, gemini, custom) */
  provider: 'openai' | 'anthropic' | 'gemini' | string;

  /** Model name (e.g., gpt-4, claude-3-opus, gemini-pro) */
  model: string;

  /** ISO 8601 start time */
  startTime: string;

  /** ISO 8601 end time (when stream completed or errored) */
  endTime: string;

  /** Total duration in milliseconds */
  durationMs: number;

  /** Request context (user, session, tags for organization) */
  request?: RequestContext;

  /** Response context (finish_reason, stop_sequence, etc.) */
  response?: ResponseContext;

  /** Custom metadata (extensible key-value pairs) */
  tags?: Record<string, string | number | boolean>;
}

/**
 * Request context: who/what triggered this stream
 */
export interface RequestContext {
  /** User or session identifier */
  userId?: string;

  /** Session ID (links multiple streams) */
  sessionId?: string;

  /** Request purpose/label (e.g., "chat", "code_generation", "analysis") */
  purpose?: string;

  /** First N characters of the prompt (for context, not sensitive data) */
  promptPreview?: string;

  /** Full prompt if storing locally is OK (optional, sanitize if needed) */
  promptFull?: string;

  /** Temperature, top_p, max_tokens, etc. (provider-specific) */
  parameters?: Record<string, unknown>;
}

/**
 * Response context: how the stream ended and what was produced
 */
export interface ResponseContext {
  /** Why the stream stopped: stop, length, error, user_interrupt, content_filter */
  finishReason?: 'stop' | 'length' | 'error' | 'user_interrupt' | 'content_filter' | string;

  /** Stop sequence that triggered completion (if any) */
  stopSequence?: string;

  /** Total input tokens (if available from API) */
  inputTokens?: number;

  /** Total output tokens (sum of all events, or from API) */
  outputTokens?: number;

  /** Error details if stream failed */
  error?: {
    code: string;
    message: string;
  };
}

/**
 * Individual stream event (token, chunk, marker, error, metadata)
 */
export interface StreamEvent {
  /** Event type */
  type: 'token' | 'chunk' | 'marker' | 'error' | 'metadata';

  /** Milliseconds since stream start */
  offsetMs: number;

  /** The actual data (token text, chunk bytes/text, etc.) */
  data?: string;

  /** Token count for this event (1 for most tokens, N for multi-token chunks) */
  tokens?: number;

  /** Event-specific metadata */
  metadata?: {
    /** For tokens: the decoded token value if available */
    decodedToken?: string;

    /** For API chunks: raw provider response fields (choice, delta, etc.) */
    rawProvider?: Record<string, unknown>;

    /** For markers: human-readable label (e.g., "first_token_latency") */
    label?: string;

    /** Custom key-value pairs */
    [key: string]: unknown;
  };
}

/**
 * Waterfall data for replay and visualization
 */
export interface WaterfallData {
  /** Time to first token (TTFT) in milliseconds */
  timeToFirstTokenMs: number;

  /** Events grouped by latency buckets for timeline visualization */
  timeline: TimelineSegment[];

  /** Critical moments for replay scrubbing */
  keyframes: Keyframe[];
}

/**
 * Timeline segment: a bucket of events within a time range
 */
export interface TimelineSegment {
  /** Start offset from stream beginning (ms) */
  startMs: number;

  /** End offset from stream beginning (ms) */
  endMs: number;

  /** Number of tokens generated in this segment */
  tokenCount: number;

  /** Average throughput (tokens/second) in this segment */
  throughputTokensPerSec: number;

  /** Event indices in the events array that fall in this segment */
  eventIndices: number[];
}

/**
 * Keyframe: a specific point in time for scrubbing the replay
 */
export interface Keyframe {
  /** Offset from stream start (ms) */
  offsetMs: number;

  /** Human-readable label for scrubbing UI */
  label: string;

  /** Event index (where to jump to in events array) */
  eventIndex: number;

  /** Optional percentage progress (0-100) */
  progress?: number;
}

/**
 * Summary: stats, counts, and export info
 */
export interface StreamSummary {
  /** Total events recorded */
  totalEvents: number;

  /** Total tokens generated */
  totalTokens: number;

  /** Total input tokens (from metadata.response if available) */
  inputTokens?: number;

  /** Average latency between events (ms) */
  averageLatencyMs: number;

  /** Peak throughput (tokens/second) during stream */
  peakThroughputTokensPerSec: number;

  /** Minimum throughput (tokens/second) during stream */
  minThroughputTokensPerSec: number;

  /** Full response text (concatenation of all token events) */
  fullText: string;

  /** Estimated cost (provider + model dependent) */
  estimatedCost?: {
    currency: string;
    amount: number;
  };

  /** Export timestamp */
  exportedAt: string;

  /** SDK version that exported this stream */
  exportedBy?: string;
}

/**
 * Provider-specific event envelope (internal use)
 */
export interface ProviderEvent {
  provider: 'openai' | 'anthropic' | 'gemini' | string;
  timestamp: number;
  raw: unknown; // Raw provider response object
}
