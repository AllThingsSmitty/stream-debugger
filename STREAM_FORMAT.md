# .stream Format Specification v1.0.0

## Overview

The `.stream` file format captures a single streaming LLM response or real-time data stream. It's a single JSON document that includes:

- **Metadata:** provider, model, timestamps, request/response context
- **Events:** chronological tokens, chunks, errors, and markers
- **Waterfall:** timing data for replay visualization
- **Summary:** pre-computed stats, full text, cost estimate

## Design Goals

✅ **Single-file portability** — One `.stream` file = one complete capture  
✅ **Replay-friendly** — Waterfall data enables scrubbing and speed control  
✅ **Provider-agnostic** — OpenAI, Anthropic, Gemini (+ custom)  
✅ **Privacy-conscious** — Optional prompt/response storage  
✅ **Extensible** — Custom metadata and provider-specific fields  

## File Format

```
Filename: <streamId>.stream (or custom name)
MIME type: application/json
Encoding: UTF-8
```

## Schema

```typescript
{
  version: "1.0.0",
  
  metadata: {
    streamId: string (UUID),
    provider: "openai" | "anthropic" | "gemini" | string,
    model: string,
    startTime: ISO 8601,
    endTime: ISO 8601,
    durationMs: number,
    request?: {
      userId?: string,
      sessionId?: string,
      purpose?: string,
      promptPreview?: string,
      promptFull?: string,
      parameters?: { [key]: any }
    },
    response?: {
      finishReason?: string,
      stopSequence?: string,
      inputTokens?: number,
      outputTokens?: number,
      error?: { code, message }
    },
    tags?: { [key]: string | number | boolean }
  },
  
  events: [
    {
      type: "token" | "chunk" | "marker" | "error" | "metadata",
      offsetMs: number,
      data?: string,
      tokens?: number,
      metadata?: { [key]: any }
    },
    ...
  ],
  
  waterfall: {
    timeToFirstTokenMs: number,
    timeline: [
      {
        startMs: number,
        endMs: number,
        tokenCount: number,
        throughputTokensPerSec: number,
        eventIndices: number[]
      },
      ...
    ],
    keyframes: [
      {
        offsetMs: number,
        label: string,
        eventIndex: number,
        progress?: number (0-100)
      },
      ...
    ]
  },
  
  summary: {
    totalEvents: number,
    totalTokens: number,
    inputTokens?: number,
    averageLatencyMs: number,
    peakThroughputTokensPerSec: number,
    minThroughputTokensPerSec: number,
    fullText: string,
    estimatedCost?: {
      currency: string,
      amount: number
    },
    exportedAt: ISO 8601,
    exportedBy?: string
  }
}
```

## Quick Start

### Using the StreamBuilder (TypeScript)

```typescript
import { StreamBuilder, serializeStream } from '@stream-debugger/core';

const builder = new StreamBuilder('openai', 'gpt-4-turbo');

builder
  .setRequestContext({
    userId: 'user_123',
    sessionId: 'session_456',
    purpose: 'code_generation',
  })
  .addMarker('stream_start', 0)
  .addToken('function', 142)
  .addToken(' parse', 156)
  .addChunk('CSV(input: string)', 171, 3)
  .setResponseContext({
    finishReason: 'stop',
    outputTokens: 356,
  })
  .addMarker('stream_complete', 3200);

const stream = builder.build();
const json = serializeStream(stream);
fs.writeFileSync('capture_001.stream', json);
```

### Loading in DevTools

```typescript
import { deserializeStream } from '@stream-debugger/core';

const json = fs.readFileSync('capture_001.stream', 'utf-8');
const stream = deserializeStream(json);

// Replay
stream.events.forEach((event) => {
  setTimeout(() => {
    console.log(`[${event.offsetMs}ms] ${event.type}: ${event.data}`);
  }, event.offsetMs);
});
```

## Key Fields Explained

### metadata.streamId
Unique identifier (UUID) for this stream. Used as the file name and for correlating across systems.

### metadata.provider
- `openai` — OpenAI (GPT-4, etc.)
- `anthropic` — Anthropic (Claude)
- `gemini` — Google Gemini
- Custom string — For internal/custom providers

### events[].offsetMs
Milliseconds since stream start (not absolute time). Enables portable .stream files and consistent replay speed.

### events[].type
- `token` — Single token emitted
- `chunk` — Multi-token response from API
- `marker` — Human/system annotation (start, complete, first_token)
- `error` — Stream failure
- `metadata` — Informational event

### waterfall.timeToFirstTokenMs
Latency from stream start to first token. Critical for debugging response delays.

### waterfall.timeline
Segments of events bucketed by time range. Used to render the timeline in DevTools UI.

### waterfall.keyframes
Specific points for scrubbing playback (start, first token, completion, etc.).

### summary.fullText
Concatenation of all token/chunk data in order. Used for:
- Displaying the final output
- Diff comparison between streams
- Export to TXT/Markdown

## Example

See [examples/example.stream.json](examples/example.stream.json) for a complete real-world example.

## Cost Calculation

Estimated costs (example rates, verify with provider):

**OpenAI (gpt-4-turbo)**
```
Cost = (inputTokens * 0.03 / 1M) + (outputTokens * 0.06 / 1M)
```

**Anthropic (Claude 3 Opus)**
```
Cost = (inputTokens * 0.015 / 1M) + (outputTokens * 0.075 / 1M)
```

**Google Gemini**
```
Cost = (totalTokens * 0.0005 / 1M)  // varies by model
```

Store in `summary.estimatedCost` with currency and amount.

## Security & Privacy

⚠️ `.stream` files may contain:
- User prompts (in `request.promptFull`)
- LLM responses (in `summary.fullText`)
- API keys (never store these!)

**Best practices:**
- Sanitize prompts before sharing
- Don't commit production `.stream` files to version control
- Implement access controls on archived streams
- Consider encrypting stored streams

## Versioning

Format version follows semver. Current: **1.0.0**

- **Breaking changes** → major version bump
- **New optional fields** → minor version bump
- **Clarifications, docs** → patch version bump

## Provider Integration Guide

### OpenAI (SSE)

```json
{
  "provider": "openai",
  "model": "gpt-4-turbo",
  "response.finishReason": "stop",
  "events": [
    {
      "type": "chunk",
      "data": "Hello...",
      "tokens": 2,
      "metadata": {
        "rawProvider": {
          "choices": [{"delta": {"content": "Hello..."}}]
        }
      }
    }
  ]
}
```

### Anthropic (SSE)

```json
{
  "provider": "anthropic",
  "model": "claude-3-opus",
  "response.finishReason": "end_turn",
  "events": [
    {
      "type": "token",
      "data": "Hello",
      "tokens": 1,
      "metadata": {
        "rawProvider": {
          "type": "content_block_delta",
          "delta": {"type": "text_delta", "text": "Hello"}
        }
      }
    }
  ]
}
```

### Gemini (REST)

```json
{
  "provider": "gemini",
  "model": "gemini-pro",
  "response.finishReason": "STOP",
  "events": [
    {
      "type": "chunk",
      "data": "Hello...",
      "tokens": 2,
      "metadata": {
        "rawProvider": {
          "candidates": [{"content": {"parts": [{"text": "Hello..."}]}}]
        }
      }
    }
  ]
}
```

## Next Steps

1. **Load & replay** — Use DevTools to scrub, play, pause
2. **Compare** — Diff two `.stream` files (same prompt, different models)
3. **Export** — Convert to Markdown, HTML, CSV
4. **Archive** — Store for audit, cost analysis, retraining

## Questions?

See [packages/core/src/types/README.md](packages/core/src/types/README.md) for detailed field documentation.
