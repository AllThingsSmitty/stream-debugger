# .stream Format Specification

The `.stream` file format captures a single streaming LLM response or real-time data stream for replay, analysis, and debugging.

## Format Overview

```
.stream (JSON)
├── version           → format semver
├── metadata          → provider, model, timing, context
├── events[]          → chronological token/chunk/error events
├── waterfall         → timing data for replay UI
└── summary           → stats, full text, cost
```

## File Extension & MIME Type

- **Extension:** `.stream`
- **MIME type:** `application/json` (standard JSON)
- **Encoding:** UTF-8

## Key Concepts

### 1. Streaming Event
A single unit of data emitted during a stream (token, chunk, error, or marker).

- **Token event:** Single token (usually 1 token per event)
- **Chunk event:** Multi-token response from API (e.g., OpenAI's `delta.content`)
- **Marker event:** Human/system annotation (start, complete, first_token_latency)
- **Error event:** Stream failure or interrupt

### 2. Waterfall Data
Timeline and keyframe data for UI replay, scrubbing, and visualization.

- **Timeline segments:** Buckets of events grouped by time range
- **Throughput:** Tokens/second calculated per segment
- **Keyframes:** Specific points for scrubbing (start, first_token, complete)

### 3. Summary
Pre-computed statistics to avoid recalculation on replay.

- Full concatenated text
- Token counts (input, output, total)
- Latency percentiles and throughput
- Estimated cost

## Field Definitions

### metadata.provider
Provider identifier: `openai`, `anthropic`, `gemini`, or custom string.

Used to:
- Validate event structure against provider conventions
- Select cost calculator
- Render provider-specific UI hints

### metadata.request
Optional request context for organizing streams.

- `userId`: Correlate streams by user
- `sessionId`: Group related streams from one conversation
- `purpose`: Categorize stream type (chat, code_gen, analysis, etc.)
- `parameters`: Temperature, top_p, max_tokens (provider-specific)

### events[].offsetMs
Milliseconds since stream start (relative timing).

Enables:
- Precise replay speed control
- Latency analysis without absolute timestamps
- Portable .stream files (no UTC timezone dependencies)

### waterfall.timeToFirstTokenMs
Time from stream start to first non-metadata event.

Critical metric for:
- Latency debugging
- Provider comparison
- User experience analysis

### summary.fullText
Concatenation of all token/chunk event `data` fields in order.

- Used for diff views (compare two streams)
- Export to Markdown, TXT, etc.
- Search and highlight within DevTools UI

## Provider-Specific Notes

### OpenAI (gpt-4, gpt-4-turbo)
- **Response format:** Server-sent events (SSE), one JSON object per line
- **Token extraction:** `choices[0].delta.content`
- **Finish reason:** `choices[0].finish_reason` (`stop`, `length`, etc.)
- **Cost calculation:** Input tokens × $0.03/1M + Output tokens × $0.06/1M (adjust for model)

### Anthropic (Claude)
- **Response format:** Server-sent events (SSE)
- **Token extraction:** `delta.type == "text_delta"` → `delta.text`
- **Finish reason:** `message.stop_reason` (`end_turn`, `max_tokens`, etc.)
- **Cost calculation:** (Input + Output) tokens × $0.003/1M (adjust for model)

### Gemini (Google)
- **Response format:** JSON REST response or SSE
- **Token extraction:** `candidates[0].content.parts[0].text`
- **Finish reason:** `candidates[0].finishReason` (`STOP`, `MAX_TOKENS`, etc.)
- **Cost calculation:** Token count varies by input/output/model

## Example Use Cases

### 1. DevTools Replay
Load `.stream` file → timeline UI → scrub, play, pause, speed control → watch tokens appear in real-time

### 2. Cost Analysis
Compare `.stream` files across providers:
```
OpenAI: $0.00847 (356 tokens)
Claude: $0.00071 (356 tokens)
Gemini: $0.00089 (356 tokens)
```

### 3. Latency Debugging
Analyze `waterfall.timeline` segments:
```
0-500ms:   3 tokens (slow startup)
500-3200ms: 353 tokens (stable 118 tokens/sec)
```

### 4. Diff & Comparison
Compare two `.stream` files:
- Same prompt, different models
- Same model, different temperatures
- Same stream, multiple capture methods (SDK vs. middleware)

### 5. Export & Share
Convert `.stream` to:
- Markdown (heading + code block)
- Plain text (full text + stats footer)
- HTML (interactive timeline)
- CSV (events as rows)

## Versioning

Format version follows semver:
- **Major:** Breaking schema changes (e.g., events format overhaul)
- **Minor:** New optional fields (backward compatible)
- **Patch:** Clarifications, example updates (no schema change)

Current version: **1.0.0**

## Security & Privacy

⚠️ **Warning:** `.stream` files may contain:
- User prompts (in `request.promptFull`)
- LLM responses (in `summary.fullText`)
- API keys (if stored in `metadata.tags` — never do this)

**Best practices:**
- Sanitize prompts before sharing
- Don't commit `.stream` files with production data to version control
- Implement access controls on archived `.stream` files
- Consider encrypting stored streams

## Future Extensions

Possible additions (not in v1.0.0):
- `metadata.costBreakdown` — detailed per-provider cost model
- `events[].tokenLogProbs` — log probability scores (for analysis)
- `waterfall.semanticSegments` — NLP-derived segments (sentences, paragraphs)
- `summary.usage.cacheCreationTokens`, `cacheReadTokens` — Anthropic prompt caching
