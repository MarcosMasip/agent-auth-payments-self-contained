# Agent with Auth and Payments Repo

A monorepo containing a Agent with Auth and Payments application with LangGraph agents and Next.js UI.

## 🏗️ Architecture — Self‑Contained Mode

This fork makes the original fullstack repo runnable 100% locally without external services. It keeps the same UX (auth, pricing/checkout, credits, chat) and swaps the backend integrations behind the scenes when Local Mode is enabled.

Why this change? To let anyone clone, run, and evaluate the full experience with zero cloud setup while preserving compatibility with the original deployment paths (Supabase/Stripe/LangGraph Cloud) when you later switch Local Mode off.

## What’s different from the original repo?

- Auth:
   - Original: Supabase Auth (JWT, RLS) with user/session state.
   - Self‑Contained Mode: Local JWT auth (HttpOnly cookie `local_session`) and a local users table via SQLite/Prisma.
- Database:
   - Original: Supabase Postgres with schema from `supabase-schema.sql`.
   - Self‑Contained Mode: SQLite file database managed by Prisma (no cloud DB).
- Payments/Credits:
   - Original: Stripe Checkout + webhooks to grant credits.
   - Self‑Contained Mode: Mock checkout session that instantly grants credits matching the selected plan (no Stripe calls).
- LLM/Agents:
   - Original: Real model providers (OpenAI/Anthropic) and optional tools (e.g., Tavily search).
   - Self‑Contained Mode: MockChatModel returns deterministic responses; Tavily tool is mocked to avoid external API keys.
- LangGraph server:
   - Original: You’d deploy to LangGraph Cloud or run locally.
   - Self‑Contained Mode: A local LangGraph server runs at http://localhost:2025 and the Next.js app proxies to it.

Importantly, the HTTP surface and UI flow are the same. When you flip off Local Mode, the app reuses the original Supabase/Stripe integrations.

## Prerequisites

- Node.js 18+ (Node 20+ recommended)
- pnpm (recommended via Corepack). If pnpm isn’t available, enable it with:
   - macOS/Linux: `corepack enable && corepack prepare pnpm@latest --activate`
   - Windows (PowerShell): `corepack enable; corepack prepare pnpm@latest --activate`
- Works on macOS, Linux, and Windows

## One‑time setup (install deps + DB)

From the repo root:

```bash
pnpm install
pnpm run setup:self-contained
```

What to expect:
- pnpm installs dependencies in all workspaces
- Approve build scripts when prompted (Prisma, esbuild, etc.)
- Prisma generates the client and pushes the schema to a local SQLite file at `apps/web/.data/dev.db`

Config files created by default:
- `apps/web/.env.local` with:
   - `LOCAL_MODE=true`, `NEXT_PUBLIC_LOCAL_MODE=true`
   - `DATABASE_URL="file:./.data/dev.db"`
   - `NEXT_PUBLIC_API_URL=http://localhost:2025` (agents)
   - A default `LOCAL_JWT_SECRET`
- `apps/agents/.env.local` with `LOCAL_MODE=true` and the same `LOCAL_JWT_SECRET`

## Start everything (one command)

From the repo root:

```bash
pnpm run dev:self-contained
```

What to expect:
- Next.js dev server on http://localhost:3002 (it may pick 3001/3002 if 3000 is in use; the URL is printed)
- LangGraph local server on http://localhost:2025

If a port is busy, the command will either auto-pick a new one (Next.js) or print an EADDRINUSE error (LangGraph). See Troubleshooting.

## Try it out

1) Open the app: http://localhost:3002
2) Sign up → Sign in (Local Mode)
    - The app sets an HttpOnly cookie `local_session` and shows you as authenticated.
3) Go to Pricing and click “Subscribe now” on any plan
    - In Local Mode, you won’t be redirected to Stripe. You’ll be taken directly to the success page.
    - Your credits are granted automatically according to the plan.
4) Start a chat
    - Messages stream from the local LangGraph server.
    - Credits decrement per message (mock deduction logic; can be tuned).

## Commands reference and expected output

- One‑time setup
   ```sh
   pnpm run setup:self-contained
   ```
   Expect to see Prisma client generation and DB push logs like:
   - “Generated Prisma Client …”
   - “SQLite database dev.db created …” or “already in sync …”

- Run both services (Local Mode)
   ```sh
   pnpm run dev:self-contained
   ```
   Expect:
   - Next.js banner with the Local URL (e.g., http://localhost:3002)
   - LangGraph banner with API URL (http://localhost:2025) and “Server running at …”

- Start agents only
   ```sh
   pnpm --filter agents run dev:self-contained
   ```
   Expect LangGraph banner and “Server running at ::1:2025”. If port 2025 is taken, add `--port 2026`.

- Start web only
   ```sh
   pnpm --filter web run dev:self-contained
   ```
   Expect Next.js dev banner; it will show the chosen http://localhost:30xx URL.

## How Local Mode works (under the hood)

- Feature flag: `LOCAL_MODE=true` and `NEXT_PUBLIC_LOCAL_MODE=true`
- Auth: `/api/auth/signup`, `/api/auth/signin`, `/api/auth/session`, `/api/auth/signout` set/verify a signed local JWT stored in `local_session` cookie.
- DB: Prisma schema under `apps/web/prisma/schema.prisma`; client in `src/lib/db/client.ts`. User credits/subscription helpers in `src/lib/db/users.ts`.
- Checkout: `/api/create-checkout-session` returns a mock `sessionId` and immediately grants credits via `upsertSubscriptionFromPrice`.
- Agents: `apps/agents/src/security/auth.ts` checks `Authorization: Bearer <JWT>` and verifies with `LOCAL_JWT_SECRET`. Tools like Tavily are mocked when `LOCAL_MODE=true`.
- Passthrough: `apps/web/src/app/api/[..._path]/route.ts` proxies to `NEXT_PUBLIC_API_URL` (the LangGraph server URL).

## Switching back to the original (cloud) mode

Set `LOCAL_MODE=false` (and remove `NEXT_PUBLIC_LOCAL_MODE`) in both apps’ env files, then configure the original services:
- Supabase: set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`.
- Stripe: set `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, and webhook secret if you re-enable webhooks.
- LLM providers: set your API keys (OpenAI/Anthropic) and restore any real tools like Tavily.

## Troubleshooting

- Port in use (agents 2025):
    - macOS/Linux: stop existing `langgraphjs` process
       ```bash
       pkill -f langgraphjs
       ```
    - Windows (PowerShell): stop process on port 2025
       ```powershell
       for /f "tokens=5" %a in ('netstat -aon ^| find ":2025" ^| find "LISTEN"') do taskkill /f /pid %a
       ```
    - Or change port (all OSes):
       ```bash
       pnpm --filter agents run dev:self-contained -- --port 2026
       ```
       Then set `NEXT_PUBLIC_API_URL=http://localhost:2026` in `apps/web/.env.local`.

- Next.js picks a different port than 3000
   - That’s expected if 3000 is busy. Use the URL printed in the console.

- TypeScript error about PrismaClient
   - We import Prisma client in a way that is robust with Next/TS bundling. If you adjust TS config, regenerate client: `pnpm --filter web exec prisma generate`.

- “Authorization header missing” from agents
   - Make sure you’re signed in locally so the app can forward the JWT to agents. The StreamProvider includes the `Authorization: Bearer <JWT>` header when a session is present.

- Stripe IntegrationError (publishable key empty) in Local Mode
   - Expected if Stripe init wasn’t fully guarded. Local Mode does NOT require any Stripe keys; the pricing page now skips Stripe. If you still see it, clear your browser cache and ensure `NEXT_PUBLIC_LOCAL_MODE=true` and `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` is blank.

- Chat page shows a form asking for API URL / Assistant ID
   - This appears if `NEXT_PUBLIC_API_URL` or `NEXT_PUBLIC_ASSISTANT_ID` are missing. In Local Mode they should be set in `apps/web/.env.local` (defaults: http://localhost:2025 and `agent`). Restart `pnpm run dev:self-contained` after editing.

- Chat fails with “Failed to fetch” (langgraph-sdk)
   - Confirm the agents server is running (see terminal: should show `Server running at ::1:2025`).
   - Check `NEXT_PUBLIC_API_URL` matches that port.
   - If you changed the agents port, update `NEXT_PUBLIC_API_URL` and restart the web app.
   - Browser extensions (ad/privacy filters) can block local fetches; try an incognito window.

- Credits not updating after mock checkout
   - Open DevTools Network tab, check `/api/create-checkout-session` and subsequent `/api/user/credits` calls return 200.
   - Ensure the local DB file exists: `ls apps/web/.data/dev.db`. If missing, rerun `pnpm run setup:self-contained`.

## Optional Local LLM: Ollama (Auto‑Detect)

Local Mode always works out of the box with a deterministic mock model. If you have [Ollama](https://ollama.com/) installed and running, `pnpm run dev:self-contained` will automatically use it—no extra command required. If anything goes wrong (not installed, daemon stopped, model missing) the system gracefully falls back to the mock model without failing startup.

### Quick Start (Zero Additional Commands)

1. Install Ollama once (examples):
   - macOS (Homebrew): `brew install ollama`
   - Linux: Official script from ollama.com
   - Windows: Installer (preview) or WSL2
2. (Optional) Pull a preferred model ahead of time (default we look for `mistral`):
   ```bash
   ollama pull mistral
   ```
3. Run the stack (as usual):
   ```bash
   pnpm run dev:self-contained
   ```

That’s it—if Ollama responds at `http://localhost:11434` the agents app will use it.

### Configuration (Optional)

Environment variables (in `apps/agents/.env.local`):
- `OLLAMA_MODEL=mistral` (choose another like `phi` or `qwen2.5:0.5b`)
- `OLLAMA_BASE_URL=http://localhost:11434` (change if you proxy)
- `OLLAMA_CREDIT_DIVISOR=1000` (credit heuristic tuning)
- `OLLAMA_DISABLE_AUTO=true` (force disable and always use mock even if Ollama is running)

### How Auto‑Detection Works

At startup (and when first loading a model) the provider:
1. Checks `LOCAL_MODE` is true and `OLLAMA_DISABLE_AUTO` is not set
2. Calls `GET /api/tags` on `OLLAMA_BASE_URL`
3. If successful, constructs an Ollama model wrapper
4. On any failure, logs a warning and returns the mock model with `degraded=true`

You can verify which provider is active:
```
curl -s http://localhost:2025/healthz | jq
```
Example healthy Ollama response snippet:
```
{"provider":"ollama","modelName":"mistral","degraded":false}
```
Fallback (mock) response:
```
{"provider":"mock","modelName":"mock-local","degraded":true,"error":"Ollama not reachable"}
```

### Optional Model Pull Script

You rarely need this, but to pre‑warm or switch models explicitly:
```
pnpm run ollama:pull  # pulls the model named in OLLAMA_MODEL (default: mistral)
```
Running this just ensures first chat response isn’t delayed by a pull.

### Performance Notes

- First generation may be slower (model warm‑up / quantization load)
- Smaller models (e.g., `phi`, `qwen2.5:0.5b`, `mistral`) reduce RAM footprint
- Large models can exceed 8–16GB RAM; choose a lightweight one for demos
- If memory pressure occurs, the provider will likely fail → mock fallback

### Troubleshooting Ollama

| Symptom | Fix |
|---------|-----|
| Health endpoint shows provider=mock with error about connect ECONNREFUSED | Ensure `ollama serve` is running and port 11434 is free |
| Requests hang on first message | Model not yet pulled; run `pnpm run ollama:pull` or `ollama pull <model>` |
| High RAM usage | Switch to a smaller model (`OLLAMA_MODEL=phi`) |
| Credits seem high | Tune `OLLAMA_CREDIT_DIVISOR` (see below) |
| 404 model not found (mistral) in browser / console | Pull it: `ollama pull mistral` or change `OLLAMA_MODEL` to an installed one. App will now auto-fallback to mock when missing; refresh after pull to resume real model. |
| `ollama pull <model>` returns "server not responding" but `brew info ollama` shows installed | Start the daemon: `brew services start ollama` (or `open -a Ollama` if cask). Verify with `curl http://localhost:11434/api/tags`. If still failing, run `/opt/homebrew/opt/ollama/bin/ollama serve` in a terminal to foreground it. |

## Local Credit Heuristic (Ollama)

In Local Mode with Ollama enabled, a lightweight credit estimation runs after each model invocation. This keeps the mock and real modes conceptually aligned without exact token accounting.

### How It Works

1. Gather total characters of user prompt(s) + model completion
2. Approximate tokens ≈ chars / 4 (common heuristic for many BPE encodings)
3. Derive credits = ceil(approxTokens / OLLAMA_CREDIT_DIVISOR)
4. Enforce a minimum of 1 credit per completed exchange

Attached metadata (internal, available on the AI message object) example:
```json
{
  "_local_credit_estimate": {
    "provider": "ollama",
    "model": "mistral",
    "degraded": false,
    "approxTokens": 812,
    "creditsUsed": 1,
    "divisor": 1000
  }
}
```

If Ollama is unavailable the provider returns `provider=mock` and the same heuristic still runs (often much smaller outputs). Any failure in calculation falls back silently (no crash) and at minimum 1 credit may be consumed by existing UI logic.

### Tuning

- `OLLAMA_CREDIT_DIVISOR` (default: 1000). Lower this to charge more credits per message; raise it to make usage cheaper.
- A typical small model response ~500–1200 chars round trip → ~125–300 tokens → at divisor 1000 → 1 credit.
- If you prefer a “per 200 tokens” style, set `OLLAMA_CREDIT_DIVISOR=200`.

### Why Not Exact Tokens?

Keeping the stack self‑contained avoids pulling external tokenizers or embedding large model‑specific libs. The heuristic is transparent, adjustable, and good enough for local evaluation. In cloud mode (with real providers) you could replace this with provider‑reported token counts.

### Future Enhancements (Not Yet Implemented)

- Expose credit estimate directly in UI toast
- Persist per‑message token stats server‑side
- Variable pricing tiers per model size

## Cross‑Platform Notes (macOS / Linux / Windows)

- Environment variables: All scripts that set env vars use `cross-env`, so they work in PowerShell, Command Prompt, bash, and zsh.
- Parallel processes: `concurrently` is shell-agnostic; no reliance on `&` or subshells.
- Clean scripts: Use `rimraf` instead of `rm -rf` for Windows compatibility.
- Port conflicts: Windows PowerShell example is provided; on Linux/macOS you can also use `lsof -i :2025` to inspect processes.
- Line endings: Git attributes not customized; if contributors use Windows, ensure `core.autocrlf` is set appropriately (no functional impact on build).
- Optional tools (Stripe CLI, Supabase CLI) are not required for Local Mode; they are only needed when switching to cloud mode.

## Repo structure (unchanged high‑level)

```
apps/
   web/     # Next.js UI with local auth/DB and API routes
   agents/  # LangGraph.js server with Local Mode auth & mock tools
```

## License

MIT

This monorepo contains two main applications:

- **`apps/web`** - Next.js chat UI application with LangGraph integration
- **`apps/agents`** - LangGraph.js ReAct agents backend

## 🚀 Quick Start
### Terminal Tab 1:
```bash
# Clone the repo
git clone https://github.com/langchain-ai/agentic-saas-template.git```

#  **Environment Files**: Copy the `.env.example` files to `.env` and fill in credentials
cp apps/web/.env.example apps/web/.env
cp apps/agents/.env.example apps/agents/.env

# Install dependencies for all apps
pnpm install

# Start development servers for both apps
pnpm dev
```
### 🗄️ Database Setup

1. **Database Schema**: Copy and paste `supabase-schema.sql` in your Supabase SQL Editor

### What gets set up:
- ✅ Users table with Stripe integration
- ✅ Row Level Security (RLS) policies  
- ✅ Automatic user profile creation
- ✅ Performance indexes and triggers

### Terminal Tab 2: Stripe Webhook (for purchases + credits)

```bash
stripe listen --events customer.subscription.created,customer.subscription.updated,customer.subscription.deleted --forward-to localhost:3000/api/webhooks/stripe

## add stripe webhook key to apps/web/.env
STRIPE_WEBHOOK_SECRET=""
```
You're ready to use the app!

### Use the App

```markdown
1. Open localhost:3000
2. Sign up -> confirm email
3. login
4. pricing page --> purchase credits
   a. should see stripe events in Terminal Tab 3
5. should see success page, new credits added
6. back to home, chat with app, credits get deducted
```


## 📦 Package Management

This monorepo uses **pnpm workspaces** for efficient dependency management and task orchestration.

### Available Scripts

#### Root Level Commands

```bash
# Development
pnpm dev              # Start all apps in development mode (parallel)
pnpm build            # Build all apps
pnpm lint             # Lint all apps
pnpm lint:fix         # Fix linting issues in all apps
pnpm format           # Format code in all apps
pnpm format:check     # Check code formatting in all apps
pnpm test             # Run tests in all apps
pnpm test:int         # Run integration tests in all apps
pnpm clean            # Clean all build artifacts and node_modules

# Individual App Commands
pnpm web:dev          # Start only the web app
pnpm web:build        # Build only the web app
pnpm agents:dev       # Start only the agents app
pnpm agents:build     # Build only the agents app
pnpm agents:test      # Test only the agents app
pnpm agents:test:int  # Integration tests for agents app
```



## 🏗️ Project Structure

```
├── apps/
│   ├── web/                 # Next.js chat UI
│   │   ├── src/
│   │   ├── package.json
│   │   └── ...
│   └── agents/              # LangGraph agents
│       ├── src/
│       ├── package.json
│       └── ...
├── package.json             # Root package.json with workspaces
├── pnpm-workspace.yaml     # pnpm workspace configuration
├── .npmrc                  # pnpm configuration
└── README.md
```

## 🛠️ Technology Stack

### Web App (`apps/web`)
- **Framework**: Next.js 15
- **UI**: Radix UI + Tailwind CSS + shadcn/ui
- **Auth**: Supabase, 
- **Payments**: Stripe SDK
- **State**: Nuqs, Zustand
- **Package Manager**: pnpm

### Agents App (`apps/agents`)
- **Runtime**: Node.js + TypeScript
- **Framework**: LangGraph.js
- **AI**: LangChain + Anthropic
- **Auth**: Langgraph Middleware
- **Testing**: Jest
- **Package Manager**: pnpm

## 🔧 Development Workflow

### Adding Dependencies

```bash
# Add to specific app
pnpm --filter web add <package>
pnpm --filter agents add <package>

# Add dev dependency to specific app
pnpm --filter web add -D <package>

# Add to root (for tooling)
pnpm add -D <package> -w
```

### Running Tests

```bash
# All tests
pnpm test

# Only agents tests
pnpm agents:test

# Integration tests
pnpm test:int
```

### Building for Production

```bash
# Build all apps
pnpm build

# Build specific app
pnpm web:build
pnpm agents:build
```

## 🚀 Deployment

Each app can be deployed independently:

- **Web App**: Deploy to Vercel, Netlify, or any Node.js hosting
- **Agents**: Deploy to any Node.js hosting or containerize with Docker

## 🤝 Contributing

1. Install dependencies: `pnpm install`
2. Start development: `pnpm dev`
3. Make your changes
4. Run tests: `pnpm test`
5. Format code: `pnpm format`
6. Submit a pull request
