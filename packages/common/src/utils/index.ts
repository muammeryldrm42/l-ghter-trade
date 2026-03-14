import Decimal from "decimal.js";
import { randomUUID } from "crypto";

// Configure Decimal for financial precision
Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_EVEN });

// ─── Math Utilities ───────────────────────────────────────────────────────────

export function toDecimal(value: string | number): Decimal {
  return new Decimal(value);
}

export function addBps(price: string, bps: number): string {
  const factor = new Decimal(1).plus(new Decimal(bps).div(10000));
  return new Decimal(price).mul(factor).toFixed();
}

export function subtractBps(price: string, bps: number): string {
  const factor = new Decimal(1).minus(new Decimal(bps).div(10000));
  return new Decimal(price).mul(factor).toFixed();
}

export function pctChange(from: string, to: string): number {
  return new Decimal(to).minus(from).div(new Decimal(from).abs()).toNumber();
}

export function spreadBps(bid: string, ask: string): number {
  const mid = new Decimal(bid).plus(ask).div(2);
  return new Decimal(ask).minus(bid).div(mid).mul(10000).toNumber();
}

export function calcLiquidationPrice(
  entryPrice: string,
  leverage: number,
  side: "LONG" | "SHORT",
  maintenanceMarginRate: number
): string {
  const entry = new Decimal(entryPrice);
  const leverageD = new Decimal(leverage);
  // For isolated margin: liq_price = entry * (1 - 1/leverage + mmr) for LONG
  // liq_price = entry * (1 + 1/leverage - mmr) for SHORT
  if (side === "LONG") {
    return entry
      .mul(new Decimal(1).minus(new Decimal(1).div(leverageD)).plus(maintenanceMarginRate))
      .toFixed(8);
  } else {
    return entry
      .mul(new Decimal(1).plus(new Decimal(1).div(leverageD)).minus(maintenanceMarginRate))
      .toFixed(8);
  }
}

export function liquidationDistancePct(
  entryPrice: string,
  liquidationPrice: string,
  side: "LONG" | "SHORT"
): number {
  const entry = new Decimal(entryPrice);
  const liq = new Decimal(liquidationPrice);
  if (side === "LONG") {
    return entry.minus(liq).div(entry).toNumber();
  } else {
    return liq.minus(entry).div(entry).toNumber();
  }
}

export function calcPositionSize(
  accountEquity: string,
  riskPct: number,
  entryPrice: string,
  stopLoss: string
): string {
  const equity = new Decimal(accountEquity);
  const riskAmount = equity.mul(riskPct);
  const priceDiff = new Decimal(entryPrice).minus(stopLoss).abs();
  if (priceDiff.isZero()) return "0";
  // size = riskAmount / price_diff (in base units)
  return riskAmount.div(priceDiff).toFixed(8);
}

export function calcRequiredMargin(
  size: string,
  price: string,
  leverage: number
): string {
  const notional = new Decimal(size).mul(price);
  return notional.div(leverage).toFixed(8);
}

export function calcPnl(
  side: "LONG" | "SHORT",
  entryPrice: string,
  exitPrice: string,
  size: string
): string {
  const entry = new Decimal(entryPrice);
  const exit = new Decimal(exitPrice);
  const qty = new Decimal(size);
  const direction = side === "LONG" ? 1 : -1;
  return exit.minus(entry).mul(qty).mul(direction).toFixed(8);
}

export function calcFee(size: string, price: string, feePct: number): string {
  return new Decimal(size).mul(price).mul(feePct).toFixed(8);
}

export function calcSharpe(
  returns: number[],
  riskFreeRate = 0
): number {
  if (returns.length < 2) return 0;
  const avg = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance =
    returns.reduce((sum, r) => sum + Math.pow(r - avg, 2), 0) / (returns.length - 1);
  const stdDev = Math.sqrt(variance);
  if (stdDev === 0) return 0;
  const annualFactor = Math.sqrt(365);
  return ((avg - riskFreeRate) / stdDev) * annualFactor;
}

export function calcSortino(
  returns: number[],
  riskFreeRate = 0
): number {
  if (returns.length < 2) return 0;
  const avg = returns.reduce((a, b) => a + b, 0) / returns.length;
  const negativeReturns = returns.filter((r) => r < riskFreeRate);
  if (negativeReturns.length === 0) return Infinity;
  const downwardVariance =
    negativeReturns.reduce((sum, r) => sum + Math.pow(r - riskFreeRate, 2), 0) /
    negativeReturns.length;
  const downwardDeviation = Math.sqrt(downwardVariance);
  if (downwardDeviation === 0) return 0;
  return ((avg - riskFreeRate) / downwardDeviation) * Math.sqrt(365);
}

// ─── ID Generation ────────────────────────────────────────────────────────────

export function generateClientOrderId(
  symbol: string,
  side: string,
  prefix = "ltbot"
): string {
  const ts = Date.now().toString(36);
  const rand = randomUUID().replace(/-/g, "").slice(0, 8);
  return `${prefix}_${symbol.toLowerCase()}_${side.toLowerCase()}_${ts}_${rand}`;
}

export function generateTradeId(): string {
  return `trade_${Date.now().toString(36)}_${randomUUID().slice(0, 8)}`;
}

// ─── Time Utilities ───────────────────────────────────────────────────────────

export function msToMinutes(ms: number): number {
  return ms / 1000 / 60;
}

export function intervalToMs(interval: string): number {
  const map: Record<string, number> = {
    "1m": 60_000,
    "3m": 180_000,
    "5m": 300_000,
    "15m": 900_000,
    "30m": 1_800_000,
    "1h": 3_600_000,
    "2h": 7_200_000,
    "4h": 14_400_000,
    "6h": 21_600_000,
    "12h": 43_200_000,
    "1d": 86_400_000,
    "1w": 604_800_000,
  };
  return map[interval] ?? 60_000;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Validation Helpers ───────────────────────────────────────────────────────

export function isValidPrice(price: string): boolean {
  try {
    const d = new Decimal(price);
    return d.isFinite() && d.gt(0);
  } catch {
    return false;
  }
}

export function isValidSize(size: string): boolean {
  try {
    const d = new Decimal(size);
    return d.isFinite() && d.gt(0);
  } catch {
    return false;
  }
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
