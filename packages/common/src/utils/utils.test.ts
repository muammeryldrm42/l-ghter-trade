import { describe, it, expect } from "vitest";
import {
  calcLiquidationPrice,
  liquidationDistancePct,
  calcPositionSize,
  calcRequiredMargin,
  calcPnl,
  calcFee,
  calcSharpe,
  calcSortino,
  spreadBps,
  addBps,
  subtractBps,
  pctChange,
  clamp,
  isValidPrice,
  isValidSize,
  generateClientOrderId,
} from "../src/utils/index.js";

describe("Liquidation price calculation", () => {
  it("LONG liq price is below entry", () => {
    const liq = calcLiquidationPrice("50000", 10, "LONG", 0.004);
    expect(parseFloat(liq)).toBeLessThan(50000);
  });

  it("SHORT liq price is above entry", () => {
    const liq = calcLiquidationPrice("50000", 10, "SHORT", 0.004);
    expect(parseFloat(liq)).toBeGreaterThan(50000);
  });

  it("higher leverage → closer liquidation for LONG", () => {
    const liq5x = parseFloat(calcLiquidationPrice("50000", 5, "LONG", 0.004));
    const liq10x = parseFloat(calcLiquidationPrice("50000", 10, "LONG", 0.004));
    // 10x has closer liquidation (higher price) than 5x
    expect(liq10x).toBeGreaterThan(liq5x);
  });

  it("25x leverage liquidation is close to entry", () => {
    const entry = 50000;
    const liq = parseFloat(calcLiquidationPrice(entry.toString(), 25, "LONG", 0.004));
    const distPct = (entry - liq) / entry;
    // 25x → liq ~4% away
    expect(distPct).toBeLessThan(0.06);
    expect(distPct).toBeGreaterThan(0);
  });
});

describe("Liquidation distance", () => {
  it("returns positive distance for valid position", () => {
    const liqPrice = calcLiquidationPrice("50000", 5, "LONG", 0.004);
    const dist = liquidationDistancePct("50000", liqPrice, "LONG");
    expect(dist).toBeGreaterThan(0);
    expect(dist).toBeLessThan(1);
  });

  it("SHORT liquidation distance is positive", () => {
    const liqPrice = calcLiquidationPrice("50000", 5, "SHORT", 0.004);
    const dist = liquidationDistancePct("50000", liqPrice, "SHORT");
    expect(dist).toBeGreaterThan(0);
  });
});

describe("Position sizing", () => {
  it("sizes correctly based on risk amount", () => {
    // 1% of $10,000 = $100 risk. Entry 50000, stop 49000, diff = 1000
    // size = 100 / 1000 = 0.1 BTC
    const size = calcPositionSize("10000", 0.01, "50000", "49000");
    expect(parseFloat(size)).toBeCloseTo(0.1, 3);
  });

  it("returns 0 when entry equals stop", () => {
    const size = calcPositionSize("10000", 0.01, "50000", "50000");
    expect(parseFloat(size)).toBe(0);
  });

  it("larger risk % → larger size", () => {
    const size1 = parseFloat(calcPositionSize("10000", 0.01, "50000", "49000"));
    const size2 = parseFloat(calcPositionSize("10000", 0.02, "50000", "49000"));
    expect(size2).toBeGreaterThan(size1);
  });
});

describe("Required margin", () => {
  it("margin = notional / leverage", () => {
    // size=1 BTC, price=50000, leverage=10 → notional=50000, margin=5000
    const margin = parseFloat(calcRequiredMargin("1", "50000", 10));
    expect(margin).toBeCloseTo(5000, 2);
  });
});

describe("PnL calculation", () => {
  it("LONG position profits when price rises", () => {
    const pnl = parseFloat(calcPnl("LONG", "50000", "55000", "1"));
    expect(pnl).toBeCloseTo(5000, 2);
  });

  it("LONG position loses when price falls", () => {
    const pnl = parseFloat(calcPnl("LONG", "50000", "45000", "1"));
    expect(pnl).toBeCloseTo(-5000, 2);
  });

  it("SHORT position profits when price falls", () => {
    const pnl = parseFloat(calcPnl("SHORT", "50000", "45000", "1"));
    expect(pnl).toBeCloseTo(5000, 2);
  });

  it("SHORT position loses when price rises", () => {
    const pnl = parseFloat(calcPnl("SHORT", "50000", "55000", "1"));
    expect(pnl).toBeCloseTo(-5000, 2);
  });

  it("zero pnl when price unchanged", () => {
    const pnl = parseFloat(calcPnl("LONG", "50000", "50000", "1"));
    expect(pnl).toBe(0);
  });
});

describe("Fee calculation", () => {
  it("fee = size * price * feePct", () => {
    // 1 BTC at $50000, 5bps taker = 50000 * 0.0005 = $25
    const fee = parseFloat(calcFee("1", "50000", 0.0005));
    expect(fee).toBeCloseTo(25, 2);
  });
});

describe("Sharpe ratio", () => {
  it("returns 0 for empty returns", () => {
    expect(calcSharpe([])).toBe(0);
  });

  it("positive for consistently positive returns", () => {
    const returns = Array(100).fill(0.001) as number[];
    expect(calcSharpe(returns)).toBeGreaterThan(0);
  });

  it("negative for consistently negative returns", () => {
    const returns = Array(100).fill(-0.001) as number[];
    expect(calcSharpe(returns)).toBeLessThan(0);
  });
});

describe("Sortino ratio", () => {
  it("returns 0 for no negative returns", () => {
    const returns = Array(50).fill(0.001) as number[];
    // All positive → no downside deviation → Infinity, but we clamp to Infinity
    const s = calcSortino(returns);
    expect(s).toBe(Infinity);
  });

  it("is finite when there are both wins and losses", () => {
    const returns = Array.from({ length: 100 }, (_, i) => (i % 3 === 0 ? -0.01 : 0.005));
    expect(isFinite(calcSortino(returns))).toBe(true);
  });
});

describe("Spread calculation", () => {
  it("calculates spread in bps correctly", () => {
    // bid=9999, ask=10001, mid=10000, spread=2/10000=0.02%=2bps
    const s = spreadBps("9999", "10001");
    expect(s).toBeCloseTo(2, 0);
  });

  it("wider spread = more bps", () => {
    const narrow = spreadBps("9999", "10001");
    const wide = spreadBps("9950", "10050");
    expect(wide).toBeGreaterThan(narrow);
  });
});

describe("BPS adjustments", () => {
  it("addBps increases price", () => {
    const result = parseFloat(addBps("10000", 10));
    expect(result).toBeGreaterThan(10000);
  });

  it("subtractBps decreases price", () => {
    const result = parseFloat(subtractBps("10000", 10));
    expect(result).toBeLessThan(10000);
  });
});

describe("Percent change", () => {
  it("10% gain", () => {
    expect(pctChange("100", "110")).toBeCloseTo(0.1, 4);
  });

  it("50% loss", () => {
    expect(pctChange("100", "50")).toBeCloseTo(-0.5, 4);
  });
});

describe("Clamp", () => {
  it("clamps below min", () => expect(clamp(-5, 0, 10)).toBe(0));
  it("clamps above max", () => expect(clamp(15, 0, 10)).toBe(10));
  it("passes through in range", () => expect(clamp(5, 0, 10)).toBe(5));
});

describe("Validation helpers", () => {
  it("isValidPrice accepts positive numbers", () => {
    expect(isValidPrice("50000")).toBe(true);
    expect(isValidPrice("0.001")).toBe(true);
  });
  it("isValidPrice rejects bad values", () => {
    expect(isValidPrice("0")).toBe(false);
    expect(isValidPrice("-100")).toBe(false);
    expect(isValidPrice("abc")).toBe(false);
    expect(isValidPrice("")).toBe(false);
  });
  it("isValidSize accepts positive numbers", () => {
    expect(isValidSize("0.001")).toBe(true);
    expect(isValidSize("100")).toBe(true);
  });
});

describe("Client Order ID generation", () => {
  it("generates unique IDs", () => {
    const id1 = generateClientOrderId("BTC", "BUY");
    const id2 = generateClientOrderId("BTC", "BUY");
    expect(id1).not.toBe(id2);
  });

  it("contains symbol and side", () => {
    const id = generateClientOrderId("BTC", "LONG");
    expect(id.toLowerCase()).toContain("btc");
    expect(id.toLowerCase()).toContain("long");
  });
});
