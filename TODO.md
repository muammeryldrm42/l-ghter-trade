# TODO — Lighter Trading Bot

This file tracks what remains to be implemented, verified, or connected.

## 🔴 Critical (Must do before any live use)

- [ ] **Lighter API endpoint verification** — All endpoints in `LighterClient.ts` are marked `// TODO: Confirm...`. Verify against the official Lighter API documentation:
  - `/v1/markets` path and response shape
  - `/v1/markets/:id/ticker` path and response
  - `/v1/markets/:id/orderbook` response (bid/ask format)
  - `/v1/markets/:id/candles` interval parameter format
  - `/v1/account/balance` exact fields
  - `/v1/account/positions` status field values
  - `/v1/orders` placement request shape
  - Order status values (`pending`, `open`, `partial`, `filled`, etc.)

- [ ] **Authentication mechanism** — If Lighter uses HMAC signing (timestamp + body signature), implement in `LighterClient.request()`:
  ```typescript
  headers["X-Signature"] = this.signRequest(method, path, body);
  headers["X-Timestamp"] = Date.now().toString();
  ```
  The HMAC signing stub is commented at line ~130 of `LighterClient.ts`.

- [ ] **Connect LiveExecutionAdapter to BotOrchestrator** — The live execution path is wired but the final dispatch is marked `// TODO` in `BotOrchestrator.processSymbol()`.

## 🟡 High Priority

- [ ] **Prisma integration in routes** — All DB routes currently return stub responses. Wire `@prisma/client` in:
  - `routes/trades.ts` — persist SimulatedTrade records
  - `routes/backtests.ts` — save/load BacktestRun records  
  - `routes/audit.ts` — query AuditEvent table
  - `services/BotOrchestrator.ts` — save signals + lifecycle events

- [ ] **Historical candle data source** — BacktestEngine requires `Map<Symbol, Map<Interval, Candle[]>>`. Options:
  - Fetch from Lighter historical candles endpoint
  - Ingest from CSV/Parquet files
  - Download from CryptoCompare, Binance, or similar
  - Implement `apps/api/src/services/HistoricalDataService.ts`

- [ ] **Rolling candle cache update from WebSocket** — Currently, candle cache is warmed at startup via REST. WebSocket `kline` events should push new candles so strategies always have the freshest data without full REST refresh.

- [ ] **Dashboard pages (stub)** — The following pages redirect to 404:
  - `/markets` — Ticker grid + orderbook depth + candle chart
  - `/signals` — Live signal feed + strategy breakdown
  - `/positions` — Open position cards with PnL
  - `/orders` — Order history table with lifecycle events
  - `/backtests` — Run form + result comparison table
  - `/settings` — Config editor with validation
  - `/audit` — Filterable event log

## 🟢 Nice to Have

- [ ] **Parameter sweep for BacktestEngine** — `ParameterSweepConfig` type is defined but `runParameterSweep()` is not yet implemented. Iterate over `paramGrid` cartesian product, run backtests, rank by target metric.

- [ ] **Walk-forward result aggregation** — `runWalkForward()` returns an array of `BacktestResult`. Add a summary aggregator that computes average OOS Sharpe, consistency score, and degradation ratio.

- [ ] **Bracket/OCO orders** — If Lighter supports attaching stop-loss and take-profit to entry orders, implement in `LiveExecutionAdapter` for atomic bracket execution.

- [ ] **Prometheus metrics endpoint** — Expose `prom-client` metrics at `/metrics` in Prometheus format (in addition to the current JSON endpoint). Key metrics: `bot_pnl`, `bot_position_count`, `risk_daily_loss`, `signal_confidence`.

- [ ] **Alert integrations** — `useDashboardStore.addAlert()` is used locally but there's no external notification. Add:
  - Telegram bot (kill switch, circuit breaker, large loss)
  - Email via SendGrid/Resend
  - Discord webhook

- [ ] **JWT auth for dashboard API** — `@fastify/jwt` is installed and registered but no routes require authentication. Add auth middleware to all `/api/v1` routes except health.

- [ ] **Rate-limit per API key** — Current rate limit is global (200 req/min). Per-IP or per-key limiting would be more production-appropriate.

- [ ] **Candle data persistence** — Cache candle history to PostgreSQL so backtests don't need to re-fetch from the exchange every run.

- [ ] **Volatility regime filter strategy** — The `VOLATILITY_REGIME` strategy type is referenced in `REGIME_WEIGHTS` but not yet implemented. Would use ATR percentile bands, VIX-style indicator, and Parkinson volatility estimator.

- [ ] **Multi-account support** — `LIGHTER_SUB_ACCOUNT_ID` is passed as a header but sub-account isolation logic (separate risk budgets, separate position tracking) is not implemented.

- [ ] **Order reconciler** — A background service that reconciles the bot's internal state with exchange order state, detecting fills/cancellations that happened out-of-band.

- [ ] **Mobile-responsive dashboard** — Current layout assumes desktop. Add mobile breakpoints and touch-friendly kill switch.

- [ ] **Simulation log export** — Allow operators to download simulated trade history as CSV from the dashboard.

- [ ] **Strategy config hot-reload** — Currently strategy configs are hardcoded in `BotOrchestrator.buildDefaultStrategyConfigs()`. Allow operators to update via settings page without restarting the bot.
