import { randomUUID } from 'node:crypto';
import {
  StreamBuilder,
  StreamDocument,
  type RequestContext,
  type ResponseContext,
} from '@stream-debugger/core';
import type { CaptureConfig, StreamCapture } from '../types/adapter';

interface AnthropicContentBlockDelta {
  type: 'content_block_delta';
  content_block: { type: string; text?: string };
  delta: { type: 'text_delta'; text: string };
  index: number;
}

interface AnthropicMessageStart {
  type: 'message_start';
  message: {
    id: string;
    type: string;
    role: string;
    content: Array<{ type: string }>;
    model: string;
    stop_reason: string | null;
    stop_sequence: string | null;
    usage: { input_tokens: number; output_tokens: number };
  };
}

interface AnthropicMessageDelta {
  type: 'message_delta';
  delta: { stop_reason: string; stop_sequence: string | null };
  usage: { output_tokens: number };
}

type AnthropicEvent =
  | AnthropicMessageStart
  | AnthropicContentBlockDelta
  | AnthropicMessageDelta
  | { type: string; [key: string]: unknown };

interface AnthropicMessage {
  role: string;
  content: string | Array<{ type?: string; text?: string }>;
}


/**
 * Anthropic streaming response capture
 */
class AnthropicCapture implements StreamCapture {
  streamId: string;
  private events: Array<{
    type: 'event' | 'error';
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

  addEvent(type: 'event' | 'error', data: unknown, timestamp: number): void {
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
    const builder = new StreamBuilder('anthropic', this.model);

    builder.setRequestContext(this.requestContext);
    builder.addMarker('stream_start', 0);

    if (this.config.tags) {
      builder.addTags(this.config.tags);
    }

    let inputTokens = 0;
    let outputTokens = 0;
    let finishReason: string | undefined;
    let error: { code: string; message: string } | undefined;

    // Process all captured events
    for (const event of this.events) {
      if (event.type === 'error') {
        const err = event.data as Record<string, unknown>;
        const errorObj = err.error as Record<string, unknown> | undefined;
        error = {
          code: (errorObj?.type as string) || 'UNKNOWN',
          message: (errorObj?.message as string) || String(err),
        };
        builder.addError(error.code, error.message, event.timestamp);
      } else if (event.type === 'event') {
        const evt = event.data as AnthropicEvent;

        if (evt.type === 'message_start') {
          const msgStart = evt as AnthropicMessageStart;
          inputTokens = msgStart.message.usage.input_tokens;
        }

        if (evt.type === 'content_block_delta') {
          const delta = evt as AnthropicContentBlockDelta;
          if (delta.delta.type === 'text_delta' && delta.delta.text) {
            const content = delta.delta.text;
            const tokens = this.estimateTokens(content);

            builder.addChunk(content, event.timestamp, tokens, {
              block_index: delta.index,
            });
          }
        }

        if (evt.type === 'message_delta') {
          const msgDelta = evt as AnthropicMessageDelta;
          finishReason = msgDelta.delta.stop_reason;
          outputTokens = msgDelta.usage.output_tokens;
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
 * Anthropic Streaming Adapter
 *
 * Captures Anthropic message streams and converts them to .stream documents.
 *
 * Usage:
 * ```typescript
 * import Anthropic from '@anthropic-ai/sdk';
 * import { AnthropicStreamAdapter } from '@stream-debugger/sdk';
 *
 * const client = new Anthropic();
 * const adapter = new AnthropicStreamAdapter(client);
 *
 * const capture = await adapter.captureStream({
 *   model: 'claude-3-5-sonnet-20241022',
 *   max_tokens: 1024,
 *   messages: [{ role: 'user', content: 'Hello!' }],
 * });
 *
 * const stream = await capture.finish();
 * ```
 */
export class AnthropicStreamAdapter {
  provider = 'anthropic';

  /**
   * @param client Anthropic client instance (or compatible)
   */
  constructor(private client: unknown) {}

  /**
   * Capture a streaming message creation
   */
  async captureStream(
    params: Record<string, unknown>,
    config: CaptureConfig = {}
  ): Promise<StreamCapture> {
    const streamId = this.generateId();
    const startTime = Date.now();

    // Extract model and build context
    const model = (params.model as string) || 'unknown';
    const messages = (params.messages as AnthropicMessage[]) || [];

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
    const capture = new AnthropicCapture(
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
        const messages_api = client.messages as Record<string, unknown>;
        const create = messages_api.create as (params: Record<string, unknown>) => Promise<unknown>;
        const stream = await create({
          ...params,
          stream: true,
        }) as AsyncIterable<unknown>;

        // Process stream events
        for await (const event of stream) {
          if (capture.cancel.toString() === 'true') break;
          const timestamp = Date.now() - startTime;
          capture.addEvent('event', event, timestamp);
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
  private extractPromptPreview(messages: AnthropicMessage[]): string {
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
  private extractPromptFull(messages: AnthropicMessage[]): string {
    return messages
      .map((m) => {
        const role = m.role.toUpperCase();
        const content =
          typeof m.content === 'string'
            ? m.content
            : Array.isArray(m.content)
                ? m.content
                    .map((c) =>
                      typeof c === 'string' ? c : (c as Record<string, unknown>).text || ''
                    )
                    .join('\n')
                : '';
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
