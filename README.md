# Lighter Trading Bot

**Production-grade, simulation-first perpetuals trading framework for the [Lighter](https://lighter.xyz) platform.**

Supports BTC, ETH, and SOL perpetual markets with a comprehensive strategy engine, strict risk management, paper trading simulation, backtesting, and a real-time operator dashboard.

> ⚠️ **This system defaults to DRY_RUN=true. Live trading is disabled and requires three separate explicit opt-ins. Read the safety section before changing anything.**

---

## Architecture Overview

```
lighter-trading-bot/
├── apps/
│   ├── api/               Fastify backend — bot orchestrator, REST API, WebSocket
│   └── dashboard/         Next.js operator dashboard
├── packages/
│   ├── common/            Shared types, config, utilities, logger
│   ├── strategy/          Signal generation (strategies + ensemble + regime detector)
│   ├── risk/              Risk engine — the primary safety layer
│   ├── execution/         Order management — paper adapter + live adapter (gated)
│   └── backtest/          Historical replay engine with walk-forward support
└── infra/
    └── docker/            Docker Compose + Dockerfiles
```

### Data Flow

```
Market Data (WebSocket/REST)
        │
        ▼
  RegimeDetector          ← classifies market conditions
        │
        ▼
  Strategy Engine         ← 4 strategies generate signals per symbol
  [TrendFollowing, MeanReversion, Breakout, Momentum]
        │
        ▼
  EnsembleAggregator      ← weights signals by regime, requires agreement ≥60%
        │
        ▼
  RiskEngine ◄────────────── HARD SAFETY LAYER (always runs, fails closed)
        │                    - Kill switch / circuit breaker
        │                    - Leverage computation (conservative, dynamic)
        │                    - Liquidation distance check
        │                    - Daily loss / drawdown limits
        │                    - Spread / slippage guardrails
        │                    - Confidence threshold
        ▼
  ExecutionAdapter
  ┌─────────────────┐
  │ DRY_RUN (default)│  → logs signal, no order sent
  │ PaperTrading     │  → simulates fills with slippage + fees
  │ Live (OFF)       │  → requires 3 env flags + operator token
  └─────────────────┘
        │
        ▼
  Persistent Store (PostgreSQL)
  Dashboard (Next.js) ← real-time via WebSocket
```

---

## Leverage Policy

| Symbol | Hard Cap | Default | High-Lev Threshold | Min Confidence (high-lev) |
|--------|----------|---------|-------------------|--------------------------|
| BTC    | **25x**  | 3x      | 5x                | 80%                      |
| ETH    | **25x**  | 3x      | 5x                | 80%                      |
| SOL    | **25x**  | 2x      | 4x                | 82%                      |

**The risk engine computes actual leverage dynamically per trade.** 25x is a hard ceiling, not a default. Above the recommended default, the engine requires:
- Higher confidence threshold
- Wider liquidation distance safety margin (1.5× the base check)
- Tighter position sizing
- Tighter spread/slippage filters
- Fewer concurrent positions

If market conditions are unstable (high volatility, wide spreads, unknown regime), leverage is reduced or the trade is rejected outright.

---

## Quick Start

### Prerequisites

- Node.js ≥ 20
- pnpm ≥ 9
- Docker + Docker Compose (for infrastructure)
- PostgreSQL 16 (or use Docker)

### 1. Clone and install

```bash
git clone <repo-url>
cd lighter-trading-bot
pnpm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env — at minimum set DATABASE_URL
# Leave DRY_RUN=true for safe exploration
```

### 3. Start infrastructure

```bash
docker compose -f infra/docker/docker-compose.yml up -d postgres redis
```

### 4. Run database migrations

```bash
pnpm db:generate
pnpm db:migrate
```

### 5. Build all packages

```bash
pnpm build
```

### 6. Start in simulation mode

```bash
# Terminal 1: API backend (simulation only)
DRY_RUN=true pnpm --filter @lighter-bot/api dev

# Terminal 2: Dashboard
pnpm --filter @lighter-bot/dashboard dev
```

Open [http://localhost:3000](http://localhost:3000) for the operator dashboard.
API health check: [http://localhost:3001/health](http://localhost:3001/health)

---

## Paper Trading Mode

Paper trading simulates fills against real market data with modeled slippage, fees, and funding.

```bash
# .env
DRY_RUN=false
PAPER_TRADING=true
LIGHTER_API_URL=https://mainnet.zklighter.elliot.ai
LIGHTER_WS_URL=wss://mainnet.zklighter.elliot.ai/stream
LIGHTER_API_KEY=your_api_key_here   # needed for live market data only
```

Paper trading uses a virtual $10,000 starting balance. All risk checks run identically to live mode.

---

## Backtesting

```bash
# Run via API endpoint (POST /api/v1/backtests/run)
curl -X POST http://localhost:3001/api/v1/backtests/run \
  -H "Content-Type: application/json" \
  -d '{
    "name": "BTC 6-month test",
    "symbols": ["BTC"],
    "startDate": 1704067200000,
    "endDate": 1719792000000,
    "interval": "1h",
    "initialCapital": "10000"
  }'
```

The backtest engine supports:
- Historical candle replay with slippage, fees, and funding models
- Latency simulation (configurable ms)
- Equity curve, drawdown curves
- Sharpe, Sortino, Calmar ratios
- Win rate, expectancy, profit factor
- Per-symbol and per-regime breakdowns
- Walk-forward testing (N folds, configurable in/out-of-sample split)
- Parameter sweep support (optimize over a grid of strategy params)

---

## Live Trading (Disabled by Default)

Live execution requires **all three** of the following in `.env`:

```bash
ENABLE_LIVE_TRADING=true
I_UNDERSTAND_THIS_MAY_LOSE_REAL_MONEY=true
OPERATOR_CONFIRMATION_TOKEN=your-secret-token
```

**Plus** a symbol allowlist:
```bash
SYMBOL_ALLOWLIST=BTC
```

Without all three, the `LiveExecutionAdapter` throws at construction — it cannot be silently misconfigured.

**No profit is guaranteed. The system can and will lose money. Risk management is built in but cannot prevent all losses. Use at your own risk.**

---

## Risk Management

The `RiskEngine` is the primary safety layer. It runs on every signal and fails **closed** (rejects on uncertainty):

| Check | Detail |
|-------|--------|
| Kill Switch | Operator-activated, irreversible within session |
| Circuit Breaker | Trips after N consecutive losses (configurable, default 4) |
| Daily Loss Limit | 5% of account equity (configurable) |
| Max Drawdown | 15% from peak equity (configurable) |
| Confidence Threshold | Min 65% for BTC/ETH, 70% for SOL |
| Liquidation Distance | Min 8% for BTC/ETH, 10% for SOL (more for higher leverage) |
| Spread Guardrail | Max 15 bps for BTC/ETH, 20 bps for SOL |
| Stale Data | Rejects if ticker >30s old |
| Position Limits | Max 3 open positions, no duplicates per symbol+direction |
| Cooldown After Loss | 30 min (BTC/ETH), 45 min (SOL) |
| Funding Rate Filter | Warns if adverse funding exceeds threshold |

---

## Strategies

Four strategies are implemented, each outputting LONG / SHORT / FLAT with a confidence score:

| Strategy | Type | Primary Signal |
|----------|------|----------------|
| TrendFollowing | EMA 21/55 crossover + ADX confirmation | Trending markets |
| MeanReversion | Bollinger Bands + RSI + Stochastic | Ranging markets |
| Breakout | N-period high/low break + volume spike | Expansion markets |
| Momentum | MACD histogram + OBV + multi-timeframe | All regimes |

The **EnsembleAggregator** combines them with regime-aware weights. A trade only fires when ≥60% of the weighted vote agrees on direction and the ensemble confidence exceeds the minimum threshold.

---

## Dashboard Pages

| Page | Route | Description |
|------|-------|-------------|
| Overview | `/` | Bot status, equity, PnL, risk state, kill switch |
| Markets | `/markets` | Ticker data, order books, candle charts |
| Signals | `/signals` | Recent signals, strategy breakdown, regime state |
| Positions | `/positions` | Open paper positions with live PnL |
| Orders | `/orders` | Order history with lifecycle events |
| Backtests | `/backtests` | Run and compare historical tests |
| Risk | `/risk` | Risk parameters, leverage policy, circuit breaker |
| Settings | `/settings` | Configuration editor |
| Audit Log | `/audit` | Full event trail for every trade decision |

---

## Docker Deployment

```bash
# Start full stack
docker compose -f infra/docker/docker-compose.yml up --build

# API only
docker compose -f infra/docker/docker-compose.yml up api postgres redis

# Development mode with hot reload
docker compose \
  -f infra/docker/docker-compose.yml \
  -f infra/docker/docker-compose.dev.yml \
  up
```

---

## Vercel Deployment (Dashboard)

The dashboard is a standard Next.js app and deploys directly to Vercel:

```bash
cd apps/dashboard
vercel deploy
```

Set these environment variables in the Vercel dashboard:
```
NEXT_PUBLIC_API_URL=https://your-api-domain.com
NEXT_PUBLIC_WS_URL=wss://your-api-domain.com/ws
```

The API must be deployed separately (Railway, Render, Fly.io, VPS, or Docker).

---

## API Reference

```
GET  /health                     Health check
GET  /metrics                    Prometheus-style metrics

GET  /api/v1/bot/state           Full bot + risk state
POST /api/v1/bot/start           Start the bot
POST /api/v1/bot/stop            Stop the bot
POST /api/v1/bot/kill-switch     Activate kill switch
DEL  /api/v1/bot/kill-switch     Deactivate kill switch
POST /api/v1/bot/reset-circuit-breaker

GET  /api/v1/markets             List markets
GET  /api/v1/markets/:sym/ticker
GET  /api/v1/markets/:sym/orderbook
GET  /api/v1/markets/:sym/candles

GET  /api/v1/trades              Simulated trades
GET  /api/v1/trades/summary
GET  /api/v1/positions

GET  /api/v1/risk/state
GET  /api/v1/risk/params

GET  /api/v1/metrics/performance
POST /api/v1/backtests/run
GET  /api/v1/backtests

GET  /api/v1/audit

WS   /ws                         Live state updates (2s interval)
```

---

## Testing

```bash
# All tests
pnpm test

# Risk engine only (critical safety tests)
pnpm --filter @lighter-bot/risk test

# Strategy / indicator tests
pnpm --filter @lighter-bot/strategy test

# Common utilities
pnpm --filter @lighter-bot/common test

# With coverage
pnpm --filter @lighter-bot/risk test -- --coverage
```

---

## Project Structure (detailed)

```
packages/common/src/
├── types/index.ts          All domain types (Symbol, Order, Signal, etc.)
├── config/index.ts         AppConfig loader + LEVERAGE_POLICY + DEFAULT_RISK_PARAMS
├── utils/index.ts          Math (PnL, fees, Sharpe, liquidation) + ID generation
└── logger/index.ts         Pino structured logger with secret redaction

packages/strategy/src/
├── indicators/index.ts     EMA, SMA, RSI, MACD, BB, ATR, ADX, OBV, VWAP, etc.
├── strategies/
│   ├── BaseStrategy.ts     Abstract base class
│   ├── TrendFollowing.ts   EMA crossover + ADX
│   ├── MeanReversion.ts    Bollinger Bands + RSI + Stochastic
│   ├── Breakout.ts         Channel breakout + volume
│   └── Momentum.ts         MACD histogram + OBV + MTF
├── signals/
│   └── EnsembleAggregator.ts  Regime-weighted ensemble combiner
└── regime/
    └── RegimeDetector.ts   ADX + bandwidth + volatility regime classifier

packages/risk/src/
└── engine/RiskEngine.ts    All safety checks, leverage policy enforcement

packages/execution/src/
├── adapters/PaperTradingAdapter.ts  Full simulation with slippage/fees/funding
└── adapters/LiveExecutionAdapter.ts  Triple-gated live adapter

packages/backtest/src/
└── engine/BacktestEngine.ts   Full replay engine, walk-forward, metrics

apps/api/src/
├── server.ts               Fastify server entry point
├── lighter/
│   ├── LighterClient.ts    REST adapter (all Lighter endpoints)
│   └── LighterWebSocketFeed.ts  WS market data feed with reconnect
├── services/
│   └── BotOrchestrator.ts  Central coordination loop
└── routes/
    ├── bot.ts              Start/stop/kill switch routes
    ├── markets.ts          Market data routes
    ├── risk.ts             Risk state routes
    ├── trades.ts           Trade history routes
    ├── backtests.ts        Backtest run routes
    ├── metrics.ts          Performance metrics
    └── audit.ts            Audit trail

apps/dashboard/src/
├── app/                    Next.js App Router pages
│   ├── page.tsx            Overview dashboard
│   └── risk/page.tsx       Risk management page
├── components/
│   ├── layout/             Sidebar, TopBar
│   ├── ui/                 MetricCard, KillSwitchButton, AlertBanner, StatusBadge
│   └── charts/             EquityCurveChart (recharts)
├── hooks/useLiveUpdates.ts WS connection with auto-reconnect
├── store/index.ts          Zustand global state
└── lib/api.ts              Typed API client
```

---

## TODOs / Known Stubs

The following items are clearly marked `TODO` in code and require attention before production use:

1. **Lighter API endpoint verification** — `LighterClient.ts` normalizes responses based on assumed endpoint shapes. Verify all paths and request/response schemas against official Lighter API documentation.
2. **HMAC signing** — If Lighter requires HMAC-signed requests, implement in `LighterClient.request()` where the TODO comment is placed.
3. **Prisma DB integration** — Trade/signal/audit persistence is schema-complete but routes return stubs pending Prisma client connection in the route handlers.
4. **Historical candle ingestion** — Backtest engine requires pre-loaded historical data; a candle ingestion pipeline (REST fetch → DB cache) needs to be built.
5. **Volatility regime strategy** — `VOLATILITY_REGIME` strategy type is referenced in config but not yet implemented (uses breakout weighting as fallback).
6. **Walk-forward param sweep** — `ParameterSweepConfig` interface is defined; grid search runner needs implementation.
7. **Position reconciliation** — `LiveExecutionAdapter` emergency flatten notifies but defers actual reduce-only order submission to the orchestrator; wire this fully.
8. **Authentication middleware** — JWT middleware is registered but routes are not yet protected; add auth guards to sensitive routes.
9. **Daily snapshot cron** — `DailySnapshot` Prisma model exists but no cron job writes to it yet.
10. **Additional dashboard pages** — Markets, Signals, Positions, Orders, Backtests, Settings, Audit pages are routed but need their page components built (pattern from Overview + Risk pages).

---

## Security Notes

- **Never commit `.env`** to version control.
- The logger redacts `apiKey`, `privateKey`, `secret`, `password`, `token` fields automatically.
- No private keys are ever requested, stored, or exported.
- The system never implements martingale, revenge trading, or "always recover losses" logic.
- Live trading requires three environment variables — this is intentional friction.

---

## License

MIT — use at your own risk. No warranty. No profit guarantee.
