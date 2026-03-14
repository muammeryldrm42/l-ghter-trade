import { describe, it, expect } from "vitest";
import {
  calcPnl, calcFee, calcLiquidationPrice, liquidationDistancePct,
  calcPositionSize, calcSharpe, spreadBps, generateClientOrderId,
} from "../utils/index.js";

describe("Utils", () => {
  describe("calcPnl", () => {
    it("long profit when price rises", () => {
      const pnl = parseFloat(calcPnl("LONG", "50000", "55000", "0.1"));
      expect(pnl).toBeCloseTo(500); // 5000 move * 0.1 BTC
    });

    it("long loss when price falls", () => {
      const pnl = parseFloat(calcPnl("LONG", "50000", "45000", "0.1"));
      expect(pnl).toBeCloseTo(-500);
    });

    it("short profit when price falls", () => {
      const pnl = parseFloat(calcPnl("SHORT", "50000", "45000", "0.1"));
      expect(pnl).toBeCloseTo(500);
    });

    it("short loss when price rises", () => {
      const pnl = parseFloat(calcPnl("SHORT", "50000", "55000", "0.1"));
      expect(pnl).toBeCloseTo(-500);
    });
  });

  describe("calcFee", () => {
    it("computes taker fee (5 bps) correctly", () => {
      const fee = parseFloat(calcFee("0.1", "50000", 0.0005));
      expect(fee).toBeCloseTo(2.5); // 50000 * 0.1 * 0.0005 = 2.5
    });

    it("computes maker fee (2 bps) correctly", () => {
      const fee = parseFloat(calcFee("0.1", "50000", 0.0002));
      expect(fee).toBeCloseTo(1.0);
    });
  });

  describe("calcLiquidationPrice", () => {
    it("long liquidation is below entry", () => {
      const liq = parseFloat(calcLiquidationPrice("50000", 10, "LONG", 0.004));
      expect(liq).toBeLessThan(50000);
    });

    it("short liquidation is above entry", () => {
      const liq = parseFloat(calcLiquidationPrice("50000", 10, "SHORT", 0.004));
      expect(liq).toBeGreaterThan(50000);
    });

    it("higher leverage → closer liquidation (LONG)", () => {
      const liq10x = parseFloat(calcLiquidationPrice("50000", 10, "LONG", 0.004));
      const liq25x = parseFloat(calcLiquidationPrice("50000", 25, "LONG", 0.004));
      expect(liq25x).toBeGreaterThan(liq10x); // closer to entry at higher lev
    });
  });

  describe("liquidationDistancePct", () => {
    it("returns positive distance for LONG", () => {
      const liqPrice = calcLiquidationPrice("50000", 5, "LONG", 0.004);
      const dist = liquidationDistancePct("50000", liqPrice, "LONG");
      expect(dist).toBeGreaterThan(0);
    });

    it("distance decreases at higher leverage", () => {
      const liq5x  = calcLiquidationPrice("50000", 5, "LONG", 0.004);
      const liq20x = calcLiquidationPrice("50000", 20, "LONG", 0.004);
      const dist5  = liquidationDistancePct("50000", liq5x, "LONG");
      const dist20 = liquidationDistancePct("50000", liq20x, "LONG");
      expect(dist20).toBeLessThan(dist5);
    });
  });

  describe("calcPositionSize", () => {
    it("returns valid size string", () => {
      const size = calcPositionSize("10000", 0.01, "50000", "47500");
      expect(parseFloat(size)).toBeGreaterThan(0);
    });

    it("larger account = larger position", () => {
      const small = parseFloat(calcPositionSize("5000",  0.01, "50000", "47500"));
      const large = parseFloat(calcPositionSize("10000", 0.01, "50000", "47500"));
      expect(large).toBeCloseTo(small * 2);
    });
  });

  describe("spreadBps", () => {
    it("computes spread correctly", () => {
      // bid=99990, ask=100010 → mid=100000, spread=20, bps=0.2
      const bps = spreadBps("99990", "100010");
      expect(bps).toBeCloseTo(2.0);
    });

    it("tight spread near zero", () => {
      const bps = spreadBps("49999", "50001");
      expect(bps).toBeLessThan(1);
    });
  });

  describe("calcSharpe", () => {
    it("returns 0 for empty returns", () => {
      expect(calcSharpe([])).toBe(0);
    });

    it("positive Sharpe for consistently positive returns", () => {
      const returns = Array(30).fill(0.001); // 0.1% daily consistently
      expect(calcSharpe(returns)).toBeGreaterThan(0);
    });

    it("negative Sharpe for consistently negative returns", () => {
      const returns = Array(30).fill(-0.001);
      expect(calcSharpe(returns)).toBeLessThan(0);
    });
  });

  describe("generateClientOrderId", () => {
    it("generates unique IDs", () => {
      const id1 = generateClientOrderId("BTC", "LONG");
      const id2 = generateClientOrderId("BTC", "LONG");
      expect(id1).not.toBe(id2);
    });

    it("includes symbol and side", () => {
      const id = generateClientOrderId("BTC", "LONG");
      expect(id).toContain("btc");
      expect(id).toContain("long");
    });

    it("is under 64 characters (exchange safe)", () => {
      const id = generateClientOrderId("BTC", "LONG");
      expect(id.length).toBeLessThanOrEqual(64);
    });
  });
});
