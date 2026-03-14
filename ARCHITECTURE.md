# Architecture Documentation

## System Boundaries

```
┌─────────────────────────────────────────────────────────────┐
│                        OPERATOR                             │
│  Dashboard (Next.js)  ←──WebSocket──→  API (Fastify)        │
│  Kill Switch / Config                  REST endpoints        │
└──────────────────────────────────────────┬──────────────────┘
                                           │
                              ┌────────────▼────────────┐
                              │     BotOrchestrator      │
                              │   (coordination loop)    │
                              └────┬──────────┬──────────┘
                                   │          │
                     ┌─────────────▼─┐   ┌───▼──────────────┐
                     │ Signal Engine  │   │   Risk Engine     │
                     │               │   │   (safety gate)   │
                     │ RegimeDetect  │   │                   │
                     │ 4 Strategies  │   │ Kill Switch       │
                     │ Ensemble      │   │ Circuit Breaker   │
                     └──────┬────────┘   │ Leverage Policy   │
                            │            │ Liquidation Check │
                            └────────────┘ Position Limits   │
                                          └──────────────────┘
                                                  │
                                    ┌─────────────▼──────────┐
                                    │   Execution Adapter     │
                                    │                         │
                                    │  DRY_RUN  (default)     │
                                    │  Paper    (simulate)    │
                                    │  Live     (gated off)   │
                                    └──────────┬──────────────┘
                                               │
                              ┌────────────────▼─────────────┐
                              │          Lighter Platform      │
                              │   REST API  +  WebSocket       │
                              │   BTC-PERP / ETH-PERP / SOL   │
                              └────────────────────────────────┘
```

## Safety Architecture

The system is designed to fail **closed**. Every safety check returns a rejection on ambiguity.

### Layer 1: Environment
- `DRY_RUN=true` by default. Cannot be accidentally unset.
- Live execution requires 3 independent env vars.
- `LiveExecutionAdapter` throws at construction if any guard is missing.

### Layer 2: Risk Engine
- Runs on every signal, before any execution.
- `RiskEngine.assess()` returns `approved: false` on any failed check.
- No retry with loosened parameters — rejections are final.
- Kill switch and circuit breaker are persistent within session.

### Layer 3: Execution Adapters
- `PaperTradingAdapter`: default, always simulated.
- `LiveExecutionAdapter`: gated, logs every order, enforces symbol allowlist.

### Layer 4: Leverage Policy
- Default leverage is conservative (3x BTC/ETH, 2x SOL).
- Any leverage above default requires higher confidence AND tighter liquidation distance.
- 25x is a hard ceiling enforced in `clamp()` — cannot be exceeded even by misconfigured params.

## Package Dependency Graph

```
@lighter-bot/common        (no internal deps)
    ▲
    ├── @lighter-bot/strategy
    ├── @lighter-bot/risk
    ├── @lighter-bot/execution  ←── @lighter-bot/risk
    └── @lighter-bot/backtest   ←── @lighter-bot/strategy
                                     @lighter-bot/risk

@lighter-bot/api  ←── all packages above
@lighter-bot/dashboard  ←── @lighter-bot/common (types only)
```

## Signal Lifecycle

```
1. MARKET_DATA_RECEIVED    Ticker/candle update via WS or REST poll
2. REGIME_DETECTED         RegimeDetector classifies market state
3. STRATEGY_RUN            Each enabled strategy generates output or null
4. ENSEMBLE_VOTE           Aggregator weights by regime, checks agreement ≥60%
5. SIGNAL_GENERATED        EnsembleSignal created with confidence + entry/stop/tp
6. RISK_ASSESSED           RiskEngine.assess() runs all checks
7. RISK_REJECTED / APPROVED
   └─ If rejected: reason logged, audit event written, stop
   └─ If approved: proceed to execution
8. ORDER_SUBMITTED         Paper/live adapter places or simulates order
9. ORDER_FILLED            Fill confirmed (simulated or real)
10. POSITION_OPEN          Trade record created, lifecycle tracking begins
11. STOP/TP/LIQUIDATED     Exit event fires, PnL recorded, risk engine updated
```

## Key Design Decisions

### Why simulation-first?
Perpetuals with leverage can liquidate an account in minutes. Starting every operator in simulation mode forces deliberate, explicit opt-in before real capital is at risk.

### Why three env vars for live trading?
Accidental misconfiguration is the most common cause of trading bot disasters. Three independent flags means three independent mistakes must all occur simultaneously.

### Why `clamp()` on leverage instead of throwing?
The leverage algorithm caps at the hard limit rather than throwing, so that configuration errors result in conservative behavior, not crashes. The risk engine's liquidation distance check will catch cases where even the capped leverage is too aggressive.

### Why reject on circuit breaker vs pause?
Pausing implies the system will automatically resume. Requiring a manual reset forces an operator to review what happened and consciously decide to resume.

### Why the ensemble and not just one strategy?
Single-strategy systems are susceptible to regime changes. By combining multiple strategies with regime-aware weighting, the system adapts to trending vs. ranging vs. volatile conditions without requiring manual reconfiguration.
