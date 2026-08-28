import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OpenAIStreamAdapter } from './openai';

/**
 * Test OpenAI adapter with mock data (no real API key needed)
 */

describe('OpenAIStreamAdapter', () => {
  let adapter: OpenAIStreamAdapter;
  let mockClient: any;

  beforeEach(() => {
    // Create mock OpenAI client that simulates streaming
    mockClient = {
      chat: {
        completions: {
          create: vi.fn(),
        },
      },
    };

    adapter = new OpenAIStreamAdapter(mockClient);
  });

  it('should capture a streaming response and build a .stream document', async () => {
    // Mock OpenAI stream chunks (realistic SSE-style responses)
    const mockChunks = [
      {
        choices: [
          {
            index: 0,
            delta: { content: 'function' },
            finish_reason: null,
          },
        ],
      },
      {
        choices: [
          {
            index: 0,
            delta: { content: ' validate' },
            finish_reason: null,
          },
        ],
      },
      {
        choices: [
          {
            index: 0,
            delta: { content: 'Email' },
            finish_reason: null,
          },
        ],
      },
      {
        choices: [
          {
            index: 0,
            delta: { content: '(email: string): boolean {\n  const regex = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;\n  return regex.test(email);\n}' },
            finish_reason: null,
          },
        ],
        usage: {
          prompt_tokens: 50,
          completion_tokens: 87,
          total_tokens: 137,
        },
      },
      {
        choices: [
          {
            index: 0,
            delta: {},
            finish_reason: 'stop',
          },
        ],
      },
    ];

    // Setup mock to return async iterator of chunks
    mockClient.chat.completions.create.mockResolvedValue({
      [Symbol.asyncIterator]: async function* () {
        for (const chunk of mockChunks) {
          await new Promise((r) => setTimeout(r, 50)); // Simulate network latency
          yield chunk;
        }
      },
    });

    // Capture the stream
    const capture = await adapter.captureStream(
      {
        model: 'gpt-4-turbo',
        messages: [{ role: 'user', content: 'Write a function to validate email' }],
        temperature: 0.7,
        max_tokens: 500,
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
    expect(doc.metadata.provider).toBe('openai');
    expect(doc.metadata.model).toBe('gpt-4-turbo');
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
    expect(doc.waterfall.timeToFirstTokenMs).toBeGreaterThanOrEqual(0);

    // Verify cost estimation
    expect(doc.summary.estimatedCost).toBeDefined();
    expect(doc.summary.estimatedCost?.amount).toBeGreaterThan(0);

    console.log('✓ Mock capture test passed');
    console.log(`  Total tokens: ${doc.summary.totalTokens}`);
    console.log(`  Events: ${doc.summary.totalEvents}`);
    console.log(`  Time to first token: ${doc.waterfall.timeToFirstTokenMs}ms`);
    console.log(`  Estimated cost: $${doc.summary.estimatedCost?.amount.toFixed(5)}`);
    console.log(`  Response preview: ${doc.summary.fullText.substring(0, 50)}...`);
  });

  it('should handle response context correctly', async () => {
    const mockChunks = [
      {
        choices: [
          {
            index: 0,
            delta: { content: 'Hello' },
            finish_reason: null,
          },
        ],
      },
      {
        choices: [
          {
            index: 0,
            delta: {},
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 20,
          completion_tokens: 5,
          total_tokens: 25,
        },
      },
    ];

    mockClient.chat.completions.create.mockResolvedValue({
      [Symbol.asyncIterator]: async function* () {
        for (const chunk of mockChunks) {
          yield chunk;
        }
      },
    });

    const capture = await adapter.captureStream({
      model: 'gpt-4-turbo',
      messages: [{ role: 'user', content: 'Hi' }],
    });

    await new Promise((r) => setTimeout(r, 100));
    const doc = await capture.finish();

    expect(doc.metadata.response?.finishReason).toBe('stop');
    expect(doc.summary.fullText).toBe('Hello');
  });

  it('should calculate throughput metrics', async () => {
    const mockChunks = [
      { choices: [{ index: 0, delta: { content: 'token1' }, finish_reason: null }] },
      { choices: [{ index: 0, delta: { content: 'token2' }, finish_reason: null }] },
      { choices: [{ index: 0, delta: { content: 'token3' }, finish_reason: null }] },
      {
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 3, total_tokens: 13 },
      },
    ];

    mockClient.chat.completions.create.mockResolvedValue({
      [Symbol.asyncIterator]: async function* () {
        for (const chunk of mockChunks) {
          yield chunk;
        }
      },
    });

    const capture = await adapter.captureStream({
      model: 'gpt-4-turbo',
      messages: [{ role: 'user', content: 'test' }],
    });

    await new Promise((r) => setTimeout(r, 100));
    const doc = await capture.finish();

    expect(doc.waterfall.timeline.length).toBeGreaterThan(0);
    expect(doc.summary.peakThroughputTokensPerSec).toBeGreaterThan(0);
    expect(doc.summary.totalEvents).toBeGreaterThan(0);
  });
});
