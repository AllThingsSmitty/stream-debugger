import {
  StreamBuilder,
  StreamDocument,
  type RequestContext,
  type ResponseContext,
} from '@stream-debugger/core';
import type { CaptureConfig, StreamCapture } from '../types/adapter';

/**
 * OpenAI streaming response capture
 */
interface OpenAICapture extends StreamCapture {
  _events: Array<{
    type: 'chunk' | 'error';
    data: unknown;
    timestamp: number;
  }>;
  _startTime: number;
  _cancelled: boolean;
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
  constructor(private client: any) {}

  /**
   * Capture a streaming chat completion
   */
  async captureStream(
    params: Record<string, unknown>,
    config: CaptureConfig = {}
  ): Promise<OpenAICapture> {
    const streamId = this.generateId();
    const startTime = Date.now();
    const events: Array<{ type: 'chunk' | 'error'; data: unknown; timestamp: number }> = [];
    let cancelled = false;

    // Extract model and build context
    const model = (params.model as string) || 'unknown';
    const messages = (params.messages as any[]) || [];

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

    // Execute streaming request
    try {
      const stream = await this.client.chat.completions.create({
        ...params,
        stream: true,
      });

      // Process stream events
      for await (const chunk of stream) {
        if (cancelled) break;

        const timestamp = Date.now() - startTime;
        events.push({
          type: 'chunk',
          data: chunk,
          timestamp,
        });
      }
    } catch (error) {
      const timestamp = Date.now() - startTime;
      events.push({
        type: 'error',
        data: error,
        timestamp,
      });
    }

    // Build the capture object
    const capture: OpenAICapture = {
      streamId,
      _events: events,
      _startTime: startTime,
      _cancelled: cancelled,

      cancel() {
        this._cancelled = true;
      },

      getCurrent(): StreamDocument {
        return this._buildDocument(
          streamId,
          model,
          startTime,
          events,
          requestContext,
          config
        );
      },

      async finish(): Promise<StreamDocument> {
        return this._buildDocument(
          streamId,
          model,
          startTime,
          events,
          requestContext,
          config
        );
      },

      _buildDocument(
        streamId: string,
        model: string,
        startTime: number,
        events: Array<{ type: 'chunk' | 'error'; data: unknown; timestamp: number }>,
        requestContext: RequestContext,
        config: CaptureConfig
      ): StreamDocument {
        const builder = new StreamBuilder('openai', model);

        builder.setRequestContext(requestContext);
        builder.addMarker('stream_start', 0);

        if (config.tags) {
          builder.addTags(config.tags);
        }

        let totalTokens = 0;
        let finishReason: string | undefined;
        let fullText = '';
        let firstTokenOffset = -1;
        let error: { code: string; message: string } | undefined;

        // Process all captured events
        for (const event of events) {
          if (event.type === 'error') {
            const err = event.data as any;
            error = {
              code: err.code || 'UNKNOWN',
              message: err.message || String(err),
            };
            builder.addError(error.code, error.message, event.timestamp);
          } else if (event.type === 'chunk') {
            const chunk = event.data as any;

            // Extract choice delta
            if (chunk.choices?.[0]?.delta?.content) {
              const content = chunk.choices[0].delta.content;
              const tokens = this.estimateTokens(content);

              if (firstTokenOffset === -1) {
                firstTokenOffset = event.timestamp;
              }

              totalTokens += tokens;
              fullText += content;

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
        builder.addMarker('stream_complete', Date.now() - startTime);

        return builder.build();
      },
    };

    return capture;
  }

  /**
   * Extract preview text from messages (first 100 chars of last user message)
   */
  private extractPromptPreview(messages: any[]): string {
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
  private extractPromptFull(messages: any[]): string {
    return messages
      .map((m) => {
        const role = m.role.toUpperCase();
        const content =
          typeof m.content === 'string'
            ? m.content
            : m.content
                ?.map((c: any) => (typeof c === 'string' ? c : c.text || ''))
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
    return `stream_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }
}
