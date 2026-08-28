# Stream Debugger

DevTools for debugging streaming LLM responses and real-time data.

## Project Structure

```
stream-debugger/
├── apps/
│   └── devtools/          # Next.js 15 DevTools UI
├── packages/
│   ├── core/              # Domain logic (streaming, replay, waterfall)
│   └── sdk/               # Provider adapters (OpenAI, Anthropic, Gemini)
├── examples/              # Usage examples
└── .github/workflows/     # CI/CD
```

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm 8+

### Installation

```bash
pnpm install
```

### Development

```bash
pnpm dev
```

Starts all workspaces in parallel:

- `apps/devtools`: Next.js UI at http://localhost:3000
- Build watchers for packages/

### Building

```bash
pnpm build
```

### Testing

```bash
pnpm test
```

### Type Checking

```bash
pnpm typecheck
```

## MVP Roadmap

1. **Core types & replay logic** — Stream event capture, timeline, waterfall UI
2. **.stream format spec** — JSON schema for recorded streams
3. **OpenAI adapter** — First provider integration
4. **DevTools UI** — Timeline, replay controls, export
5. **WebSocket & Anthropic** — Expand provider support

## License

MIT
