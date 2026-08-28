# @stream-debugger/sdk

SDK for integrating stream-debugger with LLM providers.

## Overview

The SDK provides adapters that capture streaming LLM responses and convert them to `.stream` documents.

**Supported providers:**
- ✅ OpenAI (GPT-4, GPT-4 Turbo, etc.)
- 🔜 Anthropic (Claude)
- 🔜 Google Gemini
- 🔜 Custom providers

## Installation

```bash
pnpm add @stream-debugger/sdk openai
```

## Quick Start

### OpenAI

```typescript
import OpenAI from 'openai';
import { OpenAIStreamAdapter, serializeStream } from '@stream-debugger/sdk';
import fs from 'fs';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const adapter = new OpenAIStreamAdapter(client);

// Capture a streaming response
const capture = await adapter.captureStream({
  model: 'gpt-4-turbo',
  messages: [{ role: 'user', content: 'Hello, Claude!' }],
  temperature: 0.7,
  max_tokens: 2000,
});

// Get the .stream document
const streamDoc = await capture.finish();

// Export to file
const json = serializeStream(streamDoc);
fs.writeFileSync('capture.stream', json);

// Display stats
console.log(`Total tokens: ${streamDoc.summary.totalTokens}`);
console.log(`Time to first token: ${streamDoc.waterfall.timeToFirstTokenMs}ms`);
```

## API Reference

### OpenAIStreamAdapter

```typescript
class OpenAIStreamAdapter {
  constructor(client: OpenAI);

  async captureStream(
    params: ChatCompletionCreateParams,
    config?: CaptureConfig
  ): Promise<StreamCapture>;
}
```

**Parameters:**

- `client` — OpenAI client instance (or compatible API)
- `params` — OpenAI chat completion parameters (model, messages, temperature, etc.)
- `config` — Capture configuration (optional)

**Returns:** `StreamCapture` object to finish and get the `.stream` document

### CaptureConfig

```typescript
interface CaptureConfig {
  userId?: string;           // User identifier
  sessionId?: string;        // Session for grouping related streams
  purpose?: string;          // Purpose/category (chat, code_gen, analysis)
  includePrompt?: boolean;   // Include full prompt in .stream (default: false)
  includeResponse?: boolean; // Include full response in .stream (default: true)
  tags?: Record<string, ...> // Custom metadata
}
```

### StreamCapture

```typescript
interface StreamCapture {
  streamId: string;
  finish(): Promise<StreamDocument>;
  getCurrent(): StreamDocument;  // Incomplete document
  cancel(): void;
}
```

## Usage Patterns

### 1. Capture & Save

```typescript
const capture = await adapter.captureStream(params, { userId: 'user_123' });
const doc = await capture.finish();
const json = serializeStream(doc);
fs.writeFileSync(`${doc.metadata.streamId}.stream`, json);
```

### 2. Capture & Log

```typescript
const capture = await adapter.captureStream(params);
const doc = await capture.finish();

console.log(`Tokens: ${doc.summary.totalTokens}`);
console.log(`Cost: $${doc.summary.estimatedCost?.amount}`);
console.log(`Throughput: ${doc.summary.peakThroughputTokensPerSec} tokens/sec`);
```

### 3. Compare Streams

```typescript
const streamA = await adapter.captureStream(
  { model: 'gpt-4-turbo', messages, temperature: 0.7 },
  { tags: { variant: 'A' } }
);

const streamB = await adapter.captureStream(
  { model: 'gpt-4-turbo', messages, temperature: 1.0 },
  { tags: { variant: 'B' } }
);

const docA = await streamA.finish();
const docB = await streamB.finish();

// Compare latency, cost, quality
console.log(`Variant A throughput: ${docA.summary.peakThroughputTokensPerSec}`);
console.log(`Variant B throughput: ${docB.summary.peakThroughputTokensPerSec}`);
```

### 4. Progress Tracking

```typescript
const capture = await adapter.captureStream(params);

// Poll for progress
while (!capture._cancelled) {
  const current = capture.getCurrent();
  console.log(`Tokens so far: ${current.summary.totalTokens}`);
  await new Promise(r => setTimeout(r, 100));
}

const doc = await capture.finish();
```

## .stream Document

After finishing a capture, you get a `StreamDocument`:

```typescript
interface StreamDocument {
  version: string;
  metadata: {
    streamId: string;
    provider: 'openai';
    model: string;
    startTime: string;      // ISO 8601
    endTime: string;
    durationMs: number;
    request: {
      userId?: string;
      sessionId?: string;
      purpose?: string;
      promptPreview?: string;
      parameters: { temperature, top_p, max_tokens, ... };
    };
    response: {
      finishReason: string;
      outputTokens: number;
    };
    tags?: Record<string, ...>;
  };

  events: Array<{
    type: 'token' | 'chunk' | 'marker';
    offsetMs: number;        // Milliseconds since stream start
    data?: string;
    tokens?: number;
  }>;

  waterfall: {
    timeToFirstTokenMs: number;
    timeline: Array<{
      startMs, endMs, tokenCount, throughputTokensPerSec, eventIndices
    }>;
    keyframes: Array<{
      offsetMs, label, eventIndex, progress
    }>;
  };

  summary: {
    totalEvents: number;
    totalTokens: number;
    averageLatencyMs: number;
    peakThroughputTokensPerSec: number;
    fullText: string;         // Complete response
    estimatedCost: { currency, amount };
  };
}
```

See [STREAM_FORMAT.md](../../STREAM_FORMAT.md) for complete documentation.

## Serialization

```typescript
import { serializeStream, deserializeStream } from '@stream-debugger/core';

// Save to file
const json = serializeStream(streamDoc);
fs.writeFileSync('capture.stream', json);

// Load from file
const json = fs.readFileSync('capture.stream', 'utf-8');
const doc = deserializeStream(json);
```

## Error Handling

```typescript
try {
  const capture = await adapter.captureStream(params);
  const doc = await capture.finish();
} catch (error) {
  // Handle OpenAI errors (auth, rate limit, timeout, etc.)
  console.error('Capture failed:', error.message);
  // The .stream document will contain error details in response.error
}
```

## Cost Estimation

The adapter estimates costs based on token counts and provider rates:

```typescript
// OpenAI rates (example; verify current rates)
const doc = await capture.finish();
console.log(`Estimated cost: $${doc.summary.estimatedCost?.amount}`);

// Breakdown: input tokens × $0.03/1M + output tokens × $0.06/1M
```

⚠️ This is an estimate only. Check your OpenAI billing for exact costs.

## Performance Notes

- **Timing precision:** ±1ms (OS dependent)
- **Token estimation:** ≈4 characters per token (rough estimate)
- **Memory:** Proportional to stream length (all events buffered in memory)
- **Network:** Depends on OpenAI response time and your connection

## Examples

See [examples/](../../examples/) for full working examples.

```bash
cd examples/basic-sse
export OPENAI_API_KEY=sk_test_...
pnpm dev
```

## Security & Privacy

⚠️ `.stream` documents may contain prompts and responses. Be careful with:
- Storing production data
- Sharing captures
- Committing to version control

See [STREAM_FORMAT.md](../../STREAM_FORMAT.md#security--privacy) for security best practices.

## Roadmap

- [ ] Anthropic adapter
- [ ] Google Gemini adapter
- [ ] Streaming middleware for Express/Fastify
- [ ] Cost optimization suggestions
- [ ] Analytics dashboard
