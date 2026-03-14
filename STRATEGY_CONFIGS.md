# Example Strategy Configurations

## Default (Conservative, Simulation Mode)

```json
{
  "strategies": [
    {
      "type": "TREND_FOLLOWING",
      "symbol": "BTC",
      "enabled": true,
      "weight": 0.35,
      "timeframes": ["1h", "4h"],
      "params": {
        "fastEmaPeriod": 21,
        "slowEmaPeriod": 55,
        "adxPeriod": 14,
        "adxThreshold": 25,
        "rsiPeriod": 14,
        "rsiOverbought": 70,
        "rsiOversold": 30,
        "atrPeriod": 14,
        "atrStopMultiplier": 1.5,
        "atrTpMultiplier": 3.0
      }
    },
    {
      "type": "MEAN_REVERSION",
      "symbol": "BTC",
      "enabled": true,
      "weight": 0.15,
      "timeframes": ["15m"],
      "params": {
        "bbPeriod": 20,
        "bbStdDev": 2,
        "rsiOversold": 35,
        "rsiOverbought": 65,
        "minBandwidthPct": 0.02
      }
    },
    {
      "type": "BREAKOUT",
      "symbol": "BTC",
      "enabled": true,
      "weight": 0.20,
      "timeframes": ["1h"],
      "params": {
        "lookbackPeriod": 20,
        "volumeMultiplier": 1.5,
        "atrStopMultiplier": 1.0,
        "atrTpMultiplier": 3.0
      }
    },
    {
      "type": "MOMENTUM",
      "symbol": "BTC",
      "enabled": true,
      "weight": 0.30,
      "timeframes": ["15m", "1h"],
      "params": {
        "macdFast": 12,
        "macdSlow": 26,
        "macdSignal": 9,
        "rsiMomentumMin": 45,
        "higherTfRequired": true
      }
    }
  ]
}
```

## Aggressive Trend Mode (higher leverage, stricter filters)

Change ensemble config in BotOrchestrator:
```typescript
const ensemble = new EnsembleSignalAggregator({
  minAgreementScore: 0.75,    // 75% agreement required
  minEnsembleConfidence: 0.78,
  minStrategiesVoting: 3,
});
```

And adjust risk params in .env:
```
# More aggressive defaults — still conservative vs exchange max
BTC_DEFAULT_LEVERAGE=5
ETH_DEFAULT_LEVERAGE=4
SOL_DEFAULT_LEVERAGE=3
```

## SOL-specific (higher volatility tolerances)

```json
{
  "type": "TREND_FOLLOWING",
  "symbol": "SOL",
  "enabled": true,
  "weight": 0.40,
  "timeframes": ["1h", "4h"],
  "params": {
    "fastEmaPeriod": 13,
    "slowEmaPeriod": 34,
    "adxThreshold": 30,
    "atrStopMultiplier": 2.0,
    "atrTpMultiplier": 4.0
  }
}
```

## Simulated Trade Log Example

```json
{
  "id": "trade_lzv8k2_a3f9b1c2",
  "symbol": "BTC",
  "side": "LONG",
  "entryPrice": "51234.50",
  "exitPrice": "54891.20",
  "size": "0.0392",
  "leverage": 3,
  "entryFee": "1.0042",
  "exitFee": "1.0758",
  "fundingFees": "0.4521",
  "realizedPnl": "141.67",
  "holdDurationMs": 14400000,
  "exitReason": "TAKE_PROFIT",
  "signal": {
    "direction": "LONG",
    "confidence": 0.782,
    "strategyName": "Ensemble",
    "rationale": "Ensemble agreement: TrendFollowing, Momentum | EMA21/55 bullish crossover ADX=31.4 RSI=52.1",
    "agreementScore": 0.83,
    "regimeAdjusted": true
  },
  "riskAssessment": {
    "approved": true,
    "score": 74,
    "adjustedLeverage": 3,
    "liquidationDistance": 0.124,
    "warnings": ["SPREAD_ELEVATED: 8.2 bps"]
  }
}
```
