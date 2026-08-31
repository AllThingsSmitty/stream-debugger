import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GeminiStreamAdapter } from './gemini';

/**
 * Test Gemini adapter with mock data (no real API key needed)
 */

interface MockGeminiClient {
  model?: string;
  generateContentStream: ReturnType<typeof vi.fn>;
}

describe('GeminiStreamAdapter', () => {
  let adapter: GeminiStreamAdapter;
  let mockClient: MockGeminiClient;

  beforeEach(() => {
    // Create mock Gemini client that simulates streaming
    mockClient = {
      model: 'gemini-2.0-flash',
      generateContentStream: vi.fn(),
    };

    adapter = new GeminiStreamAdapter(mockClient);
  });

  it('should capture a streaming generation and build a .stream document', async () => {
    // Mock Gemini stream chunks
    const mockChunks = [
      {
        candidates: [
          {
            content: {
              parts: [
                {
                  text: 'function',
                },
              ],
              role: 'model',
            },
            finishReason: undefined,
          },
        ],
        usageMetadata: {
          promptTokenCount: 50,
          candidatesTokenCount: 0,
        },
      },
      {
        candidates: [
          {
            content: {
              parts: [
                {
                  text: ' validate',
                },
              ],
              role: 'model',
            },
            finishReason: undefined,
          },
        ],
      },
      {
        candidates: [
          {
            content: {
              parts: [
                {
                  text: 'Email',
                },
              ],
              role: 'model',
            },
            finishReason: undefined,
          },
        ],
      },
      {
        candidates: [
          {
            content: {
              parts: [
                {
                  text: '(email: string): boolean {\n  const regex = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;\n  return regex.test(email);\n}',
                },
              ],
              role: 'model',
            },
            finishReason: undefined,
          },
        ],
      },
      {
        candidates: [
          {
            content: {
              parts: [
                {
                  text: '',
                },
              ],
              role: 'model',
            },
            finishReason: 'STOP',
          },
        ],
        usageMetadata: {
          promptTokenCount: 50,
          candidatesTokenCount: 87,
          totalTokenCount: 137,
        },
      },
    ];

    // Setup mock to return async iterator of chunks
    mockClient.generateContentStream.mockResolvedValue({
      [Symbol.asyncIterator]: async function* () {
        for (const chunk of mockChunks) {
          await new Promise((r) => setTimeout(r, 50));
          yield chunk;
        }
      },
    });

    // Capture the stream
    const capture = await adapter.captureStream(
      {
        contents: [
          {
            role: 'user',
            parts: ['Write a function to validate email'],
          },
        ],
        temperature: 0.7,
        max_output_tokens: 500,
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
    expect(doc.metadata.provider).toBe('gemini');
    expect(doc.metadata.model).toBe('gemini-2.0-flash');
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

    console.log('✓ Mock Gemini capture test passed');
    console.log(`  Total tokens: ${doc.summary.totalTokens}`);
    console.log(`  Events: ${doc.summary.totalEvents}`);
    console.log(`  Response preview: ${doc.summary.fullText.substring(0, 50)}...`);
  });

  it('should handle response context correctly', async () => {
    const mockChunks = [
      {
        candidates: [
          {
            content: {
              parts: [{ text: 'Hello' }],
              role: 'model',
            },
            finishReason: undefined,
          },
        ],
        usageMetadata: {
          promptTokenCount: 20,
          candidatesTokenCount: 0,
        },
      },
      {
        candidates: [
          {
            content: {
              parts: [{ text: '' }],
              role: 'model',
            },
            finishReason: 'STOP',
          },
        ],
        usageMetadata: {
          promptTokenCount: 20,
          candidatesTokenCount: 5,
          totalTokenCount: 25,
        },
      },
    ];

    mockClient.generateContentStream.mockResolvedValue({
      [Symbol.asyncIterator]: async function* () {
        for (const chunk of mockChunks) {
          yield chunk;
        }
      },
    });

    const capture = await adapter.captureStream({
      contents: [
        {
          role: 'user',
          parts: ['Hi'],
        },
      ],
    });

    await new Promise((r) => setTimeout(r, 100));
    const doc = await capture.finish();

    expect(doc.metadata.response?.finishReason).toBe('STOP');
    expect(doc.summary.fullText).toBe('Hello');
    expect(doc.metadata.response?.inputTokens).toBe(20);
  });

  it('should calculate throughput metrics', async () => {
    const mockChunks = [
      {
        candidates: [
          {
            content: { parts: [{ text: 'token1' }], role: 'model' },
            finishReason: undefined,
          },
        ],
        usageMetadata: {
          promptTokenCount: 10,
          candidatesTokenCount: 0,
        },
      },
      {
        candidates: [
          {
            content: { parts: [{ text: 'token2' }], role: 'model' },
            finishReason: undefined,
          },
        ],
      },
      {
        candidates: [
          {
            content: { parts: [{ text: 'token3' }], role: 'model' },
            finishReason: undefined,
          },
        ],
      },
      {
        candidates: [
          {
            content: { parts: [{ text: '' }], role: 'model' },
            finishReason: 'STOP',
          },
        ],
        usageMetadata: {
          promptTokenCount: 10,
          candidatesTokenCount: 3,
          totalTokenCount: 13,
        },
      },
    ];

    mockClient.generateContentStream.mockResolvedValue({
      [Symbol.asyncIterator]: async function* () {
        for (const chunk of mockChunks) {
          yield chunk;
        }
      },
    });

    const capture = await adapter.captureStream({
      contents: [
        {
          role: 'user',
          parts: ['test'],
        },
      ],
    });

    await new Promise((r) => setTimeout(r, 100));
    const doc = await capture.finish();

    expect(doc.waterfall.timeline.length).toBeGreaterThan(0);
    expect(doc.summary.peakThroughputTokensPerSec).toBeGreaterThan(0);
    expect(doc.summary.totalEvents).toBeGreaterThan(0);
  });
});
