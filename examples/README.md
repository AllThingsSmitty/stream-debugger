# stream-debugger Examples

Examples showing how to capture and analyze streaming LLM responses.

## OpenAI Example

Capture an OpenAI chat completion stream and export it to a `.stream` file.

### Setup

```bash
# Set your OpenAI API key
export OPENAI_API_KEY=sk_test_...

# Install dependencies
cd examples/basic-sse
pnpm install
```

### Run

```bash
pnpm dev
```

This will:
1. Call OpenAI GPT-4 with a streaming request
2. Capture all tokens with precise timing
3. Build a `.stream` document
4. Export to `captures/<streamId>.stream`
5. Display stats (latency, throughput, cost estimate)

### Output

Example output:
```
Starting capture...

=== Stream Capture Complete ===
Stream ID: stream_1693485600000_a1b2c3d4
Duration: 3245ms
Total tokens: 356
Time to first token: 142ms
Peak throughput: 118.5 tokens/sec
Estimated cost: $0.00847

Exported to: examples/basic-sse/captures/stream_1693485600000_a1b2c3d4.stream

=== Response ===
function validateEmail(email: string): boolean {
  // RFC 5322 simplified validation
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email);
}
...
```

### Analyze the Capture

```typescript
import { deserializeStream } from '@stream-debugger/core';
import fs from 'fs';

const json = fs.readFileSync('captures/stream_xyz.stream', 'utf-8');
const stream = deserializeStream(json);

// View timeline segments
console.log(stream.waterfall.timeline);

// Analyze events
stream.events.forEach((event, i) => {
  console.log(`[${event.offsetMs}ms] ${event.type}: ${event.data}`);
});
```

## Next Examples

Coming soon:
- **Anthropic (Claude)** — SSE stream capture
- **Google Gemini** — REST + streaming
- **WebSocket** — Real-time data streams
- **Replay UI** — Load `.stream` in DevTools and scrub through capture

## Tips

- Use `OPENAI_API_KEY` environment variable (or add to `.env`)
- Captures are saved to `captures/` directory
- Each `.stream` file is portable (share, diff, archive)
- Compare two streams to debug model/parameter differences
