import { randomUUID } from 'node:crypto';
import {
  StreamBuilder,
  StreamDocument,
  type RequestContext,
  type ResponseContext,
} from '@stream-debugger/core';
import type { CaptureConfig, StreamCapture } from '../types/adapter';

interface GeminiContent {
  text?: string;
  [key: string]: unknown;
}

interface GeminiCandidate {
  content?: GeminiContent;
  finishReason?: string;
  [key: string]: unknown;
}

interface GeminiUsageMetadata {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
}

interface GeminiStreamChunk {
  candidates?: GeminiCandidate[];
  usageMetadata?: GeminiUsageMetadata;
  [key: string]: unknown;
}

interface GeminiMessage {
  role: string;
  parts:
    | string
    | Array<{
        text?: string;
        [key: string]: unknown;
      }>;
}

interface GeminiClient {
  [key: string]: unknown;
  generateContentStream?: (params: Record<string, unknown>) => unknown;
}

/**
 * Gemini streaming response capture
 */
class GeminiCapture implements StreamCapture {
  streamId: string;
  private events: Array<{
    type: 'chunk' | 'error';
    data: unknown;
    timestamp: number;
  }>;
  private startTime: number;
  private cancelled: boolean;
  private model: string;
  private requestContext: RequestContext;
  private config: CaptureConfig;

  constructor(
    streamId: string,
    model: string,
    startTime: number,
    requestContext: RequestContext,
    config: CaptureConfig
  ) {
    this.streamId = streamId;
    this.model = model;
    this.startTime = startTime;
    this.requestContext = requestContext;
    this.config = config;
    this.events = [];
    this.cancelled = false;
  }

  addEvent(type: 'chunk' | 'error', data: unknown, timestamp: number): void {
    this.events.push({ type, data, timestamp });
  }

  cancel(): void {
    this.cancelled = true;
  }

  getCurrent(): StreamDocument {
    return this.buildDocument();
  }

  async finish(): Promise<StreamDocument> {
    return this.buildDocument();
  }

  private buildDocument(): StreamDocument {
    const builder = new StreamBuilder('gemini', this.model);

    builder.setRequestContext(this.requestContext);
    builder.addMarker('stream_start', 0);

    if (this.config.tags) {
      builder.addTags(this.config.tags);
    }

    let totalTokens = 0;
    let inputTokens = 0;
    let outputTokens = 0;
    let finishReason: string | undefined;
    let firstTokenOffset = -1;
    let error: { code: string; message: string } | undefined;

    // Process all captured events
    for (const event of this.events) {
      if (event.type === 'error') {
        const err = event.data as Record<string, unknown>;
        error = {
          code: (err.code as string) || 'UNKNOWN',
          message: (err.message as string) || String(err),
        };
        builder.addError(error.code, error.message, event.timestamp);
      } else if (event.type === 'chunk') {
        const chunk = event.data as GeminiStreamChunk;

        // Extract usage metadata
        if (chunk.usageMetadata) {
          inputTokens = chunk.usageMetadata.promptTokenCount || 0;
          outputTokens = chunk.usageMetadata.candidatesTokenCount || 0;
        }

        // Extract content chunks
        if (chunk.candidates?.[0]?.content?.text) {
          const content = chunk.candidates[0].content.text;
          const tokens = this.estimateTokens(content);

          if (firstTokenOffset === -1) {
            firstTokenOffset = event.timestamp;
          }

          totalTokens += tokens;

          builder.addChunk(content, event.timestamp, tokens, {
            candidate_index: 0,
          });
        }

        // Capture finish reason
        if (chunk.candidates?.[0]?.finishReason) {
          finishReason = chunk.candidates[0].finishReason;
        }
      }
    }

    // Set final response context
    const responseContext: ResponseContext = {
      finishReason: finishReason || 'unknown',
      inputTokens,
      outputTokens,
    };

    if (error) {
      responseContext.error = error;
    }

    builder.setResponseContext(responseContext);
    builder.addMarker('stream_complete', Date.now() - this.startTime);

    return builder.build();
  }

  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }
}

/**
 * Gemini Streaming Adapter
 *
 * Captures Google Gemini content streams and converts them to .stream documents.
 *
 * Usage:
 * ```typescript
 * import { GoogleGenerativeAI } from '@google/generative-ai';
 * import { GeminiStreamAdapter } from '@stream-debugger/sdk';
 *
 * const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
 * const client = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
 * const adapter = new GeminiStreamAdapter(client);
 *
 * const capture = await adapter.captureStream({
 *   contents: [{ role: 'user', parts: [{ text: 'Hello!' }] }],
 * });
 *
 * const stream = await capture.finish();
 * ```
 */
export class GeminiStreamAdapter {
  provider = 'gemini';

  /**
   * @param client Gemini GenerativeModel instance (or compatible)
   */
  constructor(private client: unknown) {}

  /**
   * Capture a streaming content generation
   */
  async captureStream(
    params: Record<string, unknown>,
    config: CaptureConfig = {}
  ): Promise<StreamCapture> {
    const streamId = this.generateId();
    const startTime = Date.now();

    // Extract model name - varies by client implementation
    const model = this.extractModel() || 'unknown';

    // Extract contents/messages for context
    const contents = (params.contents as GeminiMessage[]) || [];

    const requestContext: RequestContext = {
      userId: config.userId,
      sessionId: config.sessionId,
      purpose: config.purpose,
      parameters: {
        temperature: params.temperature,
        top_p: params.top_p,
        max_output_tokens: params.max_output_tokens,
      },
    };

    if (config.includePrompt && contents.length > 0) {
      requestContext.promptPreview = this.extractPromptPreview(contents);
      requestContext.promptFull = this.extractPromptFull(contents);
    }

    // Create capture object
    const capture = new GeminiCapture(
      streamId,
      model,
      startTime,
      requestContext,
      config
    );

    // Execute streaming request in background
    (async () => {
      try {
        const client = this.client as Record<string, unknown>;
        const generateContentStream =
          client.generateContentStream as Function;
        const stream = await generateContentStream(params);

        // Process stream events
        for await (const chunk of stream) {
          if (capture.cancel.toString() === 'true') break;
          const timestamp = Date.now() - startTime;
          capture.addEvent('chunk', chunk, timestamp);
        }
      } catch (error) {
        const timestamp = Date.now() - startTime;
        capture.addEvent('error', error, timestamp);
      }
    })();

    return capture;
  }

  /**
   * Extract model name from client (implementation varies)
   */
  private extractModel(): string {
    const client = this.client as Record<string, unknown>;
    // Try common property names for model info
    if (typeof client.model === 'string') return client.model;
    if (typeof (client as Record<string, Record<string, unknown>>).model?.model === 'string') {
      return (client as Record<string, Record<string, unknown>>).model.model;
    }
    return '';
  }

  /**
   * Extract preview text from contents (first 100 chars of last user message)
   */
  private extractPromptPreview(contents: GeminiMessage[]): string {
    const userMessages = contents.filter((m) => m.role === 'user');
    if (userMessages.length === 0) return '';

    const lastUserMessage = userMessages[userMessages.length - 1];
    const parts = lastUserMessage.parts;

    let text = '';
    if (typeof parts === 'string') {
      text = parts;
    } else if (Array.isArray(parts)) {
      const textPart = parts.find((p) => p.text);
      text = textPart?.text || '';
    }

    return text.substring(0, 100);
  }

  /**
   * Extract full prompt from contents
   */
  private extractPromptFull(contents: GeminiMessage[]): string {
    return contents
      .map((m) => {
        const role = m.role.toUpperCase();
        let content = '';

        if (typeof m.parts === 'string') {
          content = m.parts;
        } else if (Array.isArray(m.parts)) {
          content = m.parts
            .map((p) =>
              typeof p === 'string' ? p : p.text || ''
            )
            .join('\n');
        }

        return `[${role}]\n${content}`;
      })
      .join('\n\n');
  }

  /**
   * Rough token estimate (4 chars ≈ 1 token)
   */
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /**
   * Generate a unique stream ID
   */
  private generateId(): string {
    return randomUUID();
  }
}
