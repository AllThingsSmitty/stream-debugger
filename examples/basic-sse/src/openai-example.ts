/**
 * Example: Capture OpenAI streaming response and export to .stream file
 *
 * Usage:
 * 1. Set OPENAI_API_KEY environment variable
 * 2. Run: npx ts-node src/openai-example.ts
 */

import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';
import { OpenAIStreamAdapter, serializeStream } from '@stream-debugger/sdk';

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY environment variable is required');
  }

  // Initialize OpenAI client
  const client = new OpenAI({ apiKey });

  // Initialize adapter
  const adapter = new OpenAIStreamAdapter(client);

  console.log('Starting capture...');

  // Capture a streaming response
  const capture = await adapter.captureStream(
    {
      model: 'gpt-4-turbo',
      messages: [
        {
          role: 'user',
          content:
            'Write a TypeScript function that validates an email address. Include JSDoc comments.',
        },
      ],
      temperature: 0.7,
      max_tokens: 500,
    },
    {
      userId: 'user_example_001',
      sessionId: 'session_001',
      purpose: 'code_generation',
      includePrompt: true,
      tags: {
        environment: 'example',
        model_version: 'gpt-4-turbo',
      },
    }
  );

  // Wait for streaming to complete
  const streamDoc = await capture.finish();

  // Display stats
  console.log('\n=== Stream Capture Complete ===');
  console.log(`Stream ID: ${streamDoc.metadata.streamId}`);
  console.log(`Duration: ${streamDoc.metadata.durationMs}ms`);
  console.log(`Total tokens: ${streamDoc.summary.totalTokens}`);
  console.log(`Time to first token: ${streamDoc.waterfall.timeToFirstTokenMs}ms`);
  console.log(
    `Peak throughput: ${streamDoc.summary.peakThroughputTokensPerSec.toFixed(1)} tokens/sec`
  );
  console.log(`Estimated cost: $${streamDoc.summary.estimatedCost?.amount.toFixed(5)}`);

  // Export to .stream file
  const outputDir = path.join(__dirname, '..', 'captures');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const filename = `${streamDoc.metadata.streamId}.stream`;
  const filepath = path.join(outputDir, filename);

  const json = serializeStream(streamDoc);
  fs.writeFileSync(filepath, json, 'utf-8');

  console.log(`\nExported to: ${filepath}`);

  // Display response preview
  console.log('\n=== Response ===');
  console.log(streamDoc.summary.fullText.substring(0, 500));
  if (streamDoc.summary.fullText.length > 500) {
    console.log('...');
  }
}

main().catch((error) => {
  console.error('Error:', error.message);
  process.exit(1);
});
