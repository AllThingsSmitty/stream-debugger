# OpenAI Adapter Test

Validates the OpenAI streaming adapter without requiring a real API key.

## What This Tests

The test suite (`src/adapters/openai.test.ts`) validates:

✅ **Streaming capture** — Chunks are captured with correct timing  
✅ **Token assembly** — Multiple chunks combine into full response  
✅ **Metadata extraction** — Model, finish_reason, usage stats  
✅ **Stats calculation** — Token counts, throughput, latency  
✅ **Cost estimation** — Accurate OpenAI pricing calculation  
✅ **.stream document** — Valid schema with all required fields  

## Running the Tests

```bash
cd packages/sdk
pnpm test
```

Expected output:

```
✓ src/adapters/openai.test.ts (3 tests)
  ✓ should capture a streaming response and build a .stream document
  ✓ should handle response context correctly
  ✓ should calculate throughput metrics

✓ Mock capture test passed
  Total tokens: 87
  Events: 5
  Time to first token: 0ms
  Estimated cost: $0.00261
  Response preview: function validateEmail(email: string): boolean...
```

## Mock Data Scenario

The test simulates this flow:

```
1. User calls adapter.captureStream()
2. Adapter creates OpenAICapture instance
3. Mock OpenAI client emits SSE chunks (one every 50ms)
4. Each chunk is captured with timestamp
5. Final chunk includes usage stats
6. Document is built with all events
7. Stats (throughput, latency, cost) are calculated
```

Sample chunks emitted:

```json
{
  "choices": [{
    "index": 0,
    "delta": { "content": "function" },
    "finish_reason": null
  }]
}
```

## Validation Checklist

After running tests, verify:

- ✅ All 3 tests pass
- ✅ Document version is `1.0.0`
- ✅ Provider is `openai`
- ✅ Events array contains both chunks and markers
- ✅ Full text is assembled correctly
- ✅ Throughput metrics are calculated
- ✅ Cost estimation is present

## Integration with Real API

When you have an OpenAI API key, test with the real API:

```bash
export OPENAI_API_KEY=sk_test_...
cd examples/basic-sse
pnpm dev
```

This will:
1. Call real OpenAI API
2. Capture actual streaming response
3. Export `.stream` file to `captures/`
4. Display stats

## Interpreting Results

### If tests pass ✅
- Adapter correctly captures and builds .stream documents
- Ready to integrate with DevTools UI
- Ready for real API testing

### If tests fail ❌
Check:
1. Vitest installed correctly
2. TypeScript compilation errors
3. Mock setup in test file

## Next Steps

Once tests pass:
1. Build DevTools UI to visualize .stream files
2. Test with real OpenAI API
3. Add Anthropic and Gemini adapters

## Cost Calculation Reference

OpenAI pricing (verify current rates):

```
gpt-4-turbo:
  Input:  $0.01 / 1M tokens
  Output: $0.03 / 1M tokens

Formula:
  cost = (inputTokens * 0.01 / 1M) + (outputTokens * 0.03 / 1M)
```

Example:
- Input: 50 tokens = $0.00000050
- Output: 87 tokens = $0.00000261
- Total: $0.00000311 ≈ $0.000004

The test validates this calculation.
