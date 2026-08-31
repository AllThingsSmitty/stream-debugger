import { randomUUID } from 'node:crypto';
import {
  StreamBuilder,
  StreamDocument,
  type RequestContext,
  type ResponseContext,
} from '@stream-debugger/core';
import type { CaptureConfig, StreamCapture } from '../types/adapter';

interface OpenAIChunk {
  choices?: Array<{
    delta?: { content?: string };
    finish_reason?: string | null;
    index?: number;
  }>;
  usage?: { completion_tokens?: number; prompt_tokens?: number };
}

interface OpenAIError {
  code?: string;
  message?: string;
}

/**
 * OpenAI streaming response capture
 */
class OpenAICapture implements StreamCapture {
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
    const builder = new StreamBuilder('openai', this.model);

    builder.setRequestContext(this.requestContext);
    builder.addMarker('stream_start', 0);

    if (this.config.tags) {
      builder.addTags(this.config.tags);
    }

    let totalTokens = 0;
    let finishReason: string | undefined;
    let firstTokenOffset = -1;
    let error: { code: string; message: string } | undefined;

    // Process all captured events
    for (const event of this.events) {
      if (event.type === 'error') {
        const err = event.data as OpenAIError;
        error = {
          code: err.code || 'UNKNOWN',
          message: err.message || String(err),
        };
        builder.addError(error.code, error.message, event.timestamp);
      } else if (event.type === 'chunk') {
        const chunk = event.data as OpenAIChunk;

        // Extract choice delta
        if (chunk.choices?.[0]?.delta?.content) {
          const content = chunk.choices[0].delta.content;
          const tokens = this.estimateTokens(content);

          if (firstTokenOffset === -1) {
            firstTokenOffset = event.timestamp;
          }

          totalTokens += tokens;

          builder.addChunk(content, event.timestamp, tokens, {
            choice_index: chunk.choices[0].index,
            finish_reason: chunk.choices[0].finish_reason,
          });
        }

        // Capture finish reason
        if (chunk.choices?.[0]?.finish_reason) {
          finishReason = chunk.choices[0].finish_reason;
        }

        // Extract usage if available (usually in the last chunk)
        if (chunk.usage) {
          builder.setResponseContext({
            finishReason,
            inputTokens: chunk.usage.prompt_tokens,
            outputTokens: chunk.usage.completion_tokens,
          });
        }
      }
    }

    // Set final response context
    const responseContext: ResponseContext = {
      finishReason: finishReason || 'unknown',
      outputTokens: totalTokens,
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
 * OpenAI Streaming Adapter
 *
 * Captures OpenAI chat completion streams and converts them to .stream documents.
 *
 * Usage:
 * ```typescript
 * import OpenAI from 'openai';
 * import { OpenAIStreamAdapter } from '@stream-debugger/sdk';
 *
 * const client = new OpenAI();
 * const adapter = new OpenAIStreamAdapter(client);
 *
 * const capture = await adapter.captureStream({
 *   model: 'gpt-4-turbo',
 *   messages: [{ role: 'user', content: 'Hello!' }],
 * });
 *
 * const stream = await capture.finish();
 * ```
 */
export class OpenAIStreamAdapter {
  provider = 'openai';

  /**
   * @param client OpenAI client instance (or compatible)
   */
  constructor(private client: unknown) {}

  /**
   * Capture a streaming chat completion
   */
  async captureStream(
    params: Record<string, unknown>,
    config: CaptureConfig = {}
  ): Promise<StreamCapture> {
    const streamId = this.generateId();
    const startTime = Date.now();

    // Extract model and build context
    const model = (params.model as string) || 'unknown';
    const messages = (params.messages as unknown[]) || [];

    const requestContext: RequestContext = {
      userId: config.userId,
      sessionId: config.sessionId,
      purpose: config.purpose,
      parameters: {
        temperature: params.temperature,
        top_p: params.top_p,
        max_tokens: params.max_tokens,
      },
    };

    if (config.includePrompt && messages.length > 0) {
      requestContext.promptPreview = this.extractPromptPreview(messages);
      requestContext.promptFull = this.extractPromptFull(messages);
    }

    // Create capture object
    const capture = new OpenAICapture(streamId, model, startTime, requestContext, config);

    // Execute streaming request in background
    (async () => {
      try {
        const stream = await this.client.chat.completions.create({
          ...params,
          stream: true,
        });

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
   * Extract preview text from messages (first 100 chars of last user message)
   */
  private extractPromptPreview(messages: unknown[]): string {
    const userMessages = messages.filter((m) => m.role === 'user');
    if (userMessages.length === 0) return '';

    const lastUserMessage = userMessages[userMessages.length - 1];
    const content =
      typeof lastUserMessage.content === 'string'
        ? lastUserMessage.content
        : lastUserMessage.content?.[0]?.text || '';

    return content.substring(0, 100);
  }

  /**
   * Extract full prompt from messages
   */
  private extractPromptFull(messages: unknown[]): string {
    return messages
      .map((m) => {
        const role = m.role.toUpperCase();
        const content =
          typeof m.content === 'string'
            ? m.content
            : m.content
                ?.map((c: unknown) => (typeof c === 'string' ? c : (c as Record<string, unknown>).text || ''))
                .join('\n') || '';
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
