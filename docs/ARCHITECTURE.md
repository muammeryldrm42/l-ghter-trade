# Architecture Documentation

## System Components

### 1. `@lighter-bot/common`

Shared foundation — zero dependencies on other internal packages.

| Module | Purpose |
|--------|---------|
| `types/index.ts` | All domain types: Symbol, Signal, Position, Order, Risk, Backtest, BotState |
| `config/index.ts` | `loadAppConfig()`, `LEVERAGE_POLICY`, `DEFAULT_RISK_PARAMS`, `SYMBOL_CONTRACT_SPECS` |
| `utils/index.ts` | Math (Decimal.js), ID generation, slippage, PnL, Sharpe, Sortino, liquidation price |
| `logger/index.ts` | Pino structured logger with secret redaction |

**Leverage Policy is defined here and is immutable at runtime.** All leverage decisions trace back to `LEVERAGE_POLICY` constants.

---

### 2. `@lighter-bot/strategy`

Signal generation layer. Pure computation — no I/O, no side effects.

#### Indicator Library (`indicators/index.ts`)

All indicators are pure functions operating on `number[]`:

- **Moving Averages**: `sma`, `ema`, `wma`
- **Momentum**: `rsi`, `macd`, `stochastic`
- **Volatility**: `atr`, `bollingerBands`, `standardDeviation`
- **Trend**: `adx` (with +DI / -DI)
- **Volume**: `obv`, `vwap`
- **Utility**: `crossOver`, `crossUnder`, `last`, `prev`, `percentRank`

#### Strategies

Each strategy implements `IStrategy`:
```typescript
interface IStrategy {
  name: string;
  generate(input: StrategyInput): Promise<StrategyOutput | null>;
}
```

Output includes: `direction`, `confidence`, `entryPrice`, `stopLoss`, `takeProfit`, `riskRewardRatio`, `rationale`, `invalidationCondition`.

| Strategy | Primary Signal Logic |
|----------|---------------------|
| `TrendFollowing` | EMA(21/55) crossover + ADX confirmation + RSI filter |
| `MeanReversion` | Bollinger Band extremes + RSI + Stochastic |
| `Breakout` | N-period high/low break + volume confirmation |
| `Momentum` | MACD histogram acceleration + OBV trend + multi-TF |

#### RegimeDetector

Classifies market into 8 regimes using ADX, ATR percentile rank, Bollinger bandwidth, EMA alignment:

`TRENDING_BULLISH | TRENDING_BEARISH | RANGING | BREAKOUT | BREAKDOWN | HIGH_VOLATILITY | LOW_VOLATILITY | UNKNOWN`

#### EnsembleSignalAggregator

Combines strategy outputs with regime-weighted voting:

```
Regime → weights per strategy type → weighted confidence vote → agreement score
→ filter (minAgreement, minConfidence, minStrategies) → EnsembleSignal
```

Regime weighting table ensures:
- Trending regime → TrendFollowing + Momentum get higher weights
- Ranging regime → MeanReversion gets higher weight
- Breakout regime → Breakout strategy gets 55% weight

---

### 3. `@lighter-bot/risk`

**The most critical safety layer. All checks fail closed.**

`RiskEngine.assess(input)` runs 22 sequential checks. The first failure returns `approved: false` with a reason string. Approved trades get:
- `adjustedLeverage` (computed by `computeLeverage()`)
- `computedPositionSize` (sized by 1% equity / stop distance)
- `liquidationDistance` (verified against minimums)
- `riskScore` (0-100 composite)

#### Leverage Decision Algorithm

```
base = symbol.recommendedDefault (3x BTC/ETH, 2x SOL)

// Downward adjustments:
if regime is HIGH_VOLATILITY or volatilityPercentile > 80: -1x
if spread > 50% of max allowed: -1x

// Upward adjustments (only if confidence very high):
if confidence >= highLeverageMinConfidence (0.80): + confidence bonus
  → capped at highLeverageThreshold (5x)

// Hard gates:
if confidence < ultraLeverageMinConfidence (0.90): cap at 10x
if confidence < maxLeverageMinConfidence (0.95): cap at 20x

// Absolute hard cap: min(computed, 25x)
// Minimum: 1x
```

Higher leverage triggers enhanced liquidation distance checks (1.5x safety multiplier).

#### State Management

The engine tracks:
- Daily loss per symbol + total
- Consecutive losses per symbol (tripwire → circuit breaker)
- Last loss time per symbol (cooldown enforcement)
- Peak equity (drawdown tracking)
- Kill switch (operator-controlled)
- Circuit breaker (auto-trips, manual reset)

---

### 4. `@lighter-bot/execution`

Two adapters behind a shared interface:

#### `PaperTradingAdapter`
- Maintains simulated portfolio in memory
- Applies configurable slippage (market orders) and zero slippage (limit orders)
- Deducts maker/taker fees
- Simulates funding fee every 8h funding interval
- Marks positions to market; triggers simulated liquidations
- Maintains full `SimulatedTrade` lifecycle with events

#### `LiveExecutionAdapter`
- Constructor throws if any of the three unlock conditions is missing
- Symbol allowlist enforced per order
- Rate-limited (min 500ms between orders)
- Requires `riskAssessment.approved = true` before submission
- Logs every order with full audit trail
- Has `emergencyFlattenAll()` for fast de-risking

---

### 5. `@lighter-bot/backtest`

`BacktestEngine.run(historicalData)`:

1. Builds timeline from primary interval candle close times
2. For each timestamp:
   - Updates candle windows
   - Marks open positions to price (check stop/TP/liquidation)
   - Closes positions that hit exit conditions
   - Generates ensemble signal for each symbol
   - Risk-checks signal
   - If approved: opens position with simulated fill
3. Computes `PerformanceMetrics`:
   - Win rate, total PnL, max drawdown
   - Sharpe ratio (annualized daily returns)
   - Sortino ratio
   - Calmar ratio
   - Profit factor, expectancy, avg hold time
4. Produces equity curve + drawdown curve
5. Symbol-level breakdown

#### Walk-Forward Testing

Divides timeline into N folds. For each fold, uses `inSamplePct` for parameter discovery (manual) and tests out-of-sample performance. Returns array of `BacktestResult` for analysis.

---

### 6. `apps/api`

Fastify server with:
- CORS, JWT, rate limiting (200 req/min)
- WebSocket endpoint for live dashboard updates (2s interval)
- REST routes under `/api/v1/`
- `BotOrchestrator`: central coordination loop
  - Warms candle cache on start
  - Connects WebSocket feed
  - Runs signal loop every 60s (configurable)
  - Routes approved signals to execution adapter
  - Updates bot state with heartbeat

#### Prisma Schema Tables

| Table | Purpose |
|-------|---------|
| `bot_sessions` | Session tracking with config snapshot |
| `signals` | Every generated signal with risk outcome |
| `trades` | Complete trade record including all fees |
| `order_events` | Per-order lifecycle events (filled, cancelled, etc.) |
| `backtest_runs` | Historical backtest results |
| `audit_events` | Kill switch, config changes, errors |
| `daily_snapshots` | End-of-day equity snapshots |

---

### 7. `apps/dashboard`

Next.js 15 App Router. Tech stack: React 19, Tailwind CSS, Recharts, Zustand, SWR.

#### State Management

- `Zustand` store: bot state, paper summary, alerts, WS connection status
- `SWR` for REST polling (disabled when WS connected)
- `useLiveUpdates` hook: WebSocket client with exponential backoff reconnection

#### Design System

CSS custom properties in `globals.css`:
- Dark theme: `--bg-base` (#080c14) through `--bg-hover`
- Status colors: `--green`, `--red`, `--yellow`, `--cyan`
- Typography: `--font-mono` for all financial numbers

---

## Security Considerations

1. **No private keys**: The system never asks for, stores, or exports wallet private keys. API key authentication only.
2. **Secret redaction**: Pino logger redacts `apiKey`, `privateKey`, `secret`, `password`, `token` fields.
3. **No hardcoded secrets**: All credentials via environment variables.
4. **Input validation**: Zod schemas on all API inputs.
5. **Rate limiting**: Fastify rate-limit on all routes.
6. **JWT auth**: Ready for dashboard auth (TODO: implement middleware).
7. **Three-key live unlock**: Constructor-level enforcement, not runtime check.
8. **Fail-closed design**: Risk engine defaults to rejection on any error.

## Performance Considerations

- Decimal.js (precision: 28) for all financial math — no floating point errors
- Indicator calculations are O(n) — no quadratic loops
- Candle cache warmed on startup — signal loop uses cached data
- WebSocket preferred over REST polling for market data
- pnpm workspace + Turborepo for fast incremental builds
