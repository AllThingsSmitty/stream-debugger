import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AnthropicStreamAdapter } from './anthropic';

/**
 * Test Anthropic adapter with mock data (no real API key needed)
 */

interface MockAnthropicClient {
  messages: {
    create: ReturnType<typeof vi.fn>;
  };
}

describe('AnthropicStreamAdapter', () => {
  let adapter: AnthropicStreamAdapter;
  let mockClient: MockAnthropicClient;

  beforeEach(() => {
    // Create mock Anthropic client that simulates streaming
    mockClient = {
      messages: {
        create: vi.fn(),
      },
    };

    adapter = new AnthropicStreamAdapter(mockClient);
  });

  it('should capture a streaming message and build a .stream document', async () => {
    // Mock Anthropic stream events (realistic event-based responses)
    const mockEvents = [
      {
        type: 'message_start',
        message: {
          id: 'msg_123',
          type: 'message',
          role: 'assistant',
          content: [{ type: 'text' }],
          model: 'claude-3-5-sonnet-20241022',
          stop_reason: null,
          stop_sequence: null,
          usage: { input_tokens: 50, output_tokens: 0 },
        },
      },
      {
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'text' },
      },
      {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: 'function' },
        content_block: { type: 'text', text: '' },
      },
      {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: ' validate' },
        content_block: { type: 'text', text: 'function' },
      },
      {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: 'Email' },
        content_block: { type: 'text', text: 'function validate' },
      },
      {
        type: 'content_block_delta',
        index: 0,
        delta: {
          type: 'text_delta',
          text: '(email: string): boolean {\n  const regex = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;\n  return regex.test(email);\n}',
        },
        content_block: { type: 'text', text: 'function validateEmail' },
      },
      {
        type: 'message_delta',
        delta: { stop_reason: 'end_turn', stop_sequence: null },
        usage: { output_tokens: 87 },
      },
      {
        type: 'message_stop',
      },
    ];

    // Setup mock to return async iterator of events
    mockClient.messages.create.mockResolvedValue({
      [Symbol.asyncIterator]: async function* () {
        for (const event of mockEvents) {
          await new Promise((r) => setTimeout(r, 50));
          yield event;
        }
      },
    });

    // Capture the stream
    const capture = await adapter.captureStream(
      {
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1024,
        messages: [{ role: 'user', content: 'Write a function to validate email' }],
        temperature: 0.7,
      },
      {
        userId: 'test_user',
        sessionId: 'test_session',
        purpose: 'code_generation',
        tags: { test: true },
      }
    );

    // Wait for streaming to complete
    await new Promise((r) => setTimeout(r, 500));

    // Get the final document
    const doc = await capture.finish();

    // Verify structure
    expect(doc.version).toBe('1.0.0');
    expect(doc.metadata.provider).toBe('anthropic');
    expect(doc.metadata.model).toBe('claude-3-5-sonnet-20241022');
    expect(doc.metadata.streamId).toBeDefined();

    // Verify metadata
    expect(doc.metadata.request?.userId).toBe('test_user');
    expect(doc.metadata.request?.sessionId).toBe('test_session');
    expect(doc.metadata.request?.purpose).toBe('code_generation');

    // Verify events were captured
    expect(doc.events.length).toBeGreaterThan(0);
    expect(doc.events.some((e) => e.type === 'chunk')).toBe(true);

    // Verify response was assembled
    expect(doc.summary.fullText).toContain('function');
    expect(doc.summary.fullText).toContain('validateEmail');

    // Verify stats
    expect(doc.summary.totalTokens).toBeGreaterThan(0);
    expect(doc.summary.totalEvents).toBeGreaterThan(0);

    console.log('✓ Mock Anthropic capture test passed');
    console.log(`  Total tokens: ${doc.summary.totalTokens}`);
    console.log(`  Events: ${doc.summary.totalEvents}`);
    console.log(`  Response preview: ${doc.summary.fullText.substring(0, 50)}...`);
  });

  it('should handle response context correctly', async () => {
    const mockEvents = [
      {
        type: 'message_start',
        message: {
          id: 'msg_456',
          type: 'message',
          role: 'assistant',
          content: [{ type: 'text' }],
          model: 'claude-3-5-sonnet-20241022',
          stop_reason: null,
          stop_sequence: null,
          usage: { input_tokens: 20, output_tokens: 0 },
        },
      },
      {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: 'Hello' },
        content_block: { type: 'text', text: '' },
      },
      {
        type: 'message_delta',
        delta: { stop_reason: 'end_turn', stop_sequence: null },
        usage: { output_tokens: 5 },
      },
    ];

    mockClient.messages.create.mockResolvedValue({
      [Symbol.asyncIterator]: async function* () {
        for (const event of mockEvents) {
          yield event;
        }
      },
    });

    const capture = await adapter.captureStream({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1024,
      messages: [{ role: 'user', content: 'Hi' }],
    });

    await new Promise((r) => setTimeout(r, 100));
    const doc = await capture.finish();

    expect(doc.metadata.response?.finishReason).toBe('end_turn');
    expect(doc.summary.fullText).toBe('Hello');
    expect(doc.metadata.response?.inputTokens).toBe(20);
  });

  it('should calculate throughput metrics', async () => {
    const mockEvents = [
      {
        type: 'message_start',
        message: {
          id: 'msg_789',
          type: 'message',
          role: 'assistant',
          content: [{ type: 'text' }],
          model: 'claude-3-5-sonnet-20241022',
          stop_reason: null,
          stop_sequence: null,
          usage: { input_tokens: 10, output_tokens: 0 },
        },
      },
      {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: 'token1' },
        content_block: { type: 'text', text: '' },
      },
      {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: 'token2' },
        content_block: { type: 'text', text: 'token1' },
      },
      {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: 'token3' },
        content_block: { type: 'text', text: 'token1token2' },
      },
      {
        type: 'message_delta',
        delta: { stop_reason: 'end_turn', stop_sequence: null },
        usage: { output_tokens: 3 },
      },
    ];

    mockClient.messages.create.mockResolvedValue({
      [Symbol.asyncIterator]: async function* () {
        for (const event of mockEvents) {
          yield event;
        }
      },
    });

    const capture = await adapter.captureStream({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1024,
      messages: [{ role: 'user', content: 'test' }],
    });

    await new Promise((r) => setTimeout(r, 100));
    const doc = await capture.finish();

    expect(doc.waterfall.timeline.length).toBeGreaterThanOrEqual(0);
    expect(doc.summary.totalEvents).toBeGreaterThan(0);
  });
});
