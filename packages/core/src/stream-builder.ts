import { crypto } from 'node:crypto';
import {
  StreamDocument,
  StreamMetadata,
  StreamEvent,
  StreamSummary,
  WaterfallData,
  STREAM_FORMAT_VERSION,
} from './types/stream';

/**
 * Builder for constructing .stream documents programmatically
 */
export class StreamBuilder {
  private streamId: string;
  private provider: string;
  private model: string;
  private startTime: Date;
  private events: StreamEvent[] = [];
  private tags: Record<string, string | number | boolean> = {};
  private requestContext?: {
    userId?: string;
    sessionId?: string;
    purpose?: string;
    promptPreview?: string;
    promptFull?: string;
    parameters?: Record<string, unknown>;
  };
  private responseContext?: {
    finishReason?: string;
    stopSequence?: string;
    inputTokens?: number;
    outputTokens?: number;
    error?: { code: string; message: string };
  };

  constructor(provider: string, model: string) {
    this.streamId = crypto.randomUUID();
    this.provider = provider;
    this.model = model;
    this.startTime = new Date();
  }

  /**
   * Add a token event
   */
  addToken(text: string, offsetMs: number, tokens: number = 1): this {
    this.events.push({
      type: 'token',
      offsetMs,
      data: text,
      tokens,
      metadata: {
        decodedToken: text,
      },
    });
    return this;
  }

  /**
   * Add a chunk event (multi-token)
   */
  addChunk(text: string, offsetMs: number, tokens: number, rawProvider?: Record<string, unknown>): this {
    this.events.push({
      type: 'chunk',
      offsetMs,
      data: text,
      tokens,
      metadata: {
        rawProvider,
      },
    });
    return this;
  }

  /**
   * Add a marker event (start, complete, first_token_latency, etc.)
   */
  addMarker(label: string, offsetMs: number): this {
    this.events.push({
      type: 'marker',
      offsetMs,
      metadata: {
        label,
      },
    });
    return this;
  }

  /**
   * Add an error event
   */
  addError(code: string, message: string, offsetMs: number): this {
    this.events.push({
      type: 'error',
      offsetMs,
      data: `${code}: ${message}`,
    });
    if (!this.responseContext) this.responseContext = {};
    this.responseContext.error = { code, message };
    return this;
  }

  /**
   * Set request context
   */
  setRequestContext(context: {
    userId?: string;
    sessionId?: string;
    purpose?: string;
    promptPreview?: string;
    promptFull?: string;
    parameters?: Record<string, unknown>;
  }): this {
    this.requestContext = context;
    return this;
  }

  /**
   * Set response context
   */
  setResponseContext(context: {
    finishReason?: string;
    stopSequence?: string;
    inputTokens?: number;
    outputTokens?: number;
  }): this {
    this.responseContext = { ...this.responseContext, ...context };
    return this;
  }

  /**
   * Add custom tags
   */
  addTags(tags: Record<string, string | number | boolean>): this {
    this.tags = { ...this.tags, ...tags };
    return this;
  }

  /**
   * Build the final StreamDocument
   */
  build(): StreamDocument {
    const endTime = new Date();
    const durationMs = endTime.getTime() - this.startTime.getTime();

    // Compute summary stats
    const totalTokens = this.events.reduce((sum, e) => sum + (e.tokens || 0), 0);
    const fullText = this.events
      .filter((e) => e.type === 'token' || e.type === 'chunk')
      .map((e) => e.data || '')
      .join('');

    // Find time to first token
    const firstTokenEvent = this.events.find((e) => e.type === 'token' || e.type === 'chunk');
    const timeToFirstTokenMs = firstTokenEvent?.offsetMs ?? 0;

    // Compute throughput metrics
    let peakThroughputTokensPerSec = 0;
    let minThroughputTokensPerSec = Infinity;
    let totalLatency = 0;
    let latencyCount = 0;

    for (let i = 1; i < this.events.length; i++) {
      const prev = this.events[i - 1];
      const curr = this.events[i];
      const deltaMs = curr.offsetMs - prev.offsetMs;
      const tokens = curr.tokens || 0;

      if (deltaMs > 0 && tokens > 0) {
        const throughput = (tokens / deltaMs) * 1000; // tokens per second
        peakThroughputTokensPerSec = Math.max(peakThroughputTokensPerSec, throughput);
        minThroughputTokensPerSec = Math.min(minThroughputTokensPerSec, throughput);
      }

      if (deltaMs > 0) {
        totalLatency += deltaMs;
        latencyCount++;
      }
    }

    const averageLatencyMs = latencyCount > 0 ? totalLatency / latencyCount : 0;
    if (!isFinite(minThroughputTokensPerSec)) minThroughputTokensPerSec = 0;

    // Build waterfall with simple timeline
    const timeline = this.buildTimeline();

    const metadata: StreamMetadata = {
      streamId: this.streamId,
      provider: this.provider,
      model: this.model,
      startTime: this.startTime.toISOString(),
      endTime: endTime.toISOString(),
      durationMs,
      request: this.requestContext,
      response: this.responseContext,
      tags: Object.keys(this.tags).length > 0 ? this.tags : undefined,
    };

    const summary: StreamSummary = {
      totalEvents: this.events.length,
      totalTokens,
      inputTokens: this.responseContext?.inputTokens,
      averageLatencyMs,
      peakThroughputTokensPerSec: isFinite(peakThroughputTokensPerSec) ? peakThroughputTokensPerSec : 0,
      minThroughputTokensPerSec: isFinite(minThroughputTokensPerSec) ? minThroughputTokensPerSec : 0,
      fullText,
      exportedAt: new Date().toISOString(),
      exportedBy: '@stream-debugger/core',
    };

    return {
      version: STREAM_FORMAT_VERSION,
      metadata,
      events: this.events,
      waterfall: timeline,
      summary,
    };
  }

  /**
   * Build timeline segments and keyframes from events
   */
  private buildTimeline(): WaterfallData {
    const firstTokenEvent = this.events.find((e) => e.type === 'token' || e.type === 'chunk');
    const timeToFirstTokenMs = firstTokenEvent?.offsetMs ?? 0;

    // Simple timeline: 500ms segments
    const segmentDuration = 500;
    const maxOffset = Math.max(...this.events.map((e) => e.offsetMs), 100);
    const segments = [];

    for (let start = 0; start < maxOffset; start += segmentDuration) {
      const end = Math.min(start + segmentDuration, maxOffset);
      const eventIndices = this.events
        .map((e, i) => (e.offsetMs >= start && e.offsetMs < end ? i : -1))
        .filter((i) => i >= 0);

      if (eventIndices.length > 0) {
        const tokenCount = eventIndices.reduce((sum, i) => sum + (this.events[i].tokens || 0), 0);
        const segmentDurationSec = (end - start) / 1000;
        const throughput = segmentDurationSec > 0 ? tokenCount / segmentDurationSec : 0;

        segments.push({
          startMs: start,
          endMs: end,
          tokenCount,
          throughputTokensPerSec: throughput,
          eventIndices,
        });
      }
    }

    // Build keyframes
    const keyframes = [
      {
        offsetMs: 0,
        label: 'Start',
        eventIndex: 0,
        progress: 0,
      },
    ];

    if (firstTokenEvent) {
      keyframes.push({
        offsetMs: timeToFirstTokenMs,
        label: 'First token',
        eventIndex: this.events.indexOf(firstTokenEvent),
        progress: 5,
      });
    }

    if (this.events.length > 0) {
      keyframes.push({
        offsetMs: this.events[this.events.length - 1].offsetMs,
        label: 'Complete',
        eventIndex: this.events.length - 1,
        progress: 100,
      });
    }

    return {
      timeToFirstTokenMs,
      timeline: segments,
      keyframes,
    };
  }
}

/**
 * Serialize a StreamDocument to JSON string
 */
export function serializeStream(doc: StreamDocument): string {
  return JSON.stringify(doc, null, 2);
}

/**
 * Deserialize a StreamDocument from JSON string
 */
export function deserializeStream(json: string): StreamDocument {
  return JSON.parse(json) as StreamDocument;
}
