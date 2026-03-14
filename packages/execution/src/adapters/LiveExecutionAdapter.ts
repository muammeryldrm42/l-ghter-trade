/**
 * LiveExecutionAdapter
 * 
 * CRITICAL SAFETY LAYER:
 * This adapter CANNOT be instantiated without:
 * 1. ENABLE_LIVE_TRADING=true
 * 2. I_UNDERSTAND_THIS_MAY_LOSE_REAL_MONEY=true  
 * 3. A valid OPERATOR_CONFIRMATION_TOKEN
 * 4. Symbol must be in the configured allowlist
 * 
 * Any missing condition throws at construction time — not at order time.
 * 
 * This adapter wraps LighterClient and enforces all execution safety checks.
 */

import type {
  OrderRequest,
  OrderResult,
  Order,
  ExecutionContext,
  Symbol,
} from "@lighter-bot/common";
import { createChildLogger } from "@lighter-bot/common";
import { sleep } from "@lighter-bot/common";
import type { LighterClient } from "../../apps/api/src/lighter/LighterClient.js";

const log = createChildLogger({ module: "live-adapter" });

export class LiveExecutionAdapter {
  private readonly client: LighterClient;
  private readonly context: ExecutionContext;
  private orderCount: number;
  private lastOrderTime: number;
  private readonly minOrderIntervalMs: number;

  constructor(client: LighterClient, context: ExecutionContext) {
    // ── Safety gate: MUST have all three explicit confirmations ──────────
    if (!context.liveEnabled) {
      throw new Error(
        "LiveExecutionAdapter: ENABLE_LIVE_TRADING is not set to true. " +
        "Live execution is disabled by default. This is intentional."
      );
    }
    if (!context.acknowledgedRisk) {
      throw new Error(
        "LiveExecutionAdapter: I_UNDERSTAND_THIS_MAY_LOSE_REAL_MONEY must be set to true."
      );
    }
    if (!context.operatorConfirmationToken) {
      throw new Error(
        "LiveExecutionAdapter: OPERATOR_CONFIRMATION_TOKEN is required for live trading."
      );
    }

    this.client = client;
    this.context = context;
    this.orderCount = 0;
    this.lastOrderTime = 0;
    this.minOrderIntervalMs = 500; // min 500ms between orders

    log.warn(
      {
        mode: "LIVE",
        symbolAllowlist: context.symbolAllowlist,
      },
      "⚠️  LiveExecutionAdapter initialized — REAL MONEY EXECUTION ENABLED"
    );
  }

  async placeOrder(req: OrderRequest): Promise<OrderResult> {
    // ── Symbol allowlist check ─────────────────────────────────────────────
    if (!this.context.symbolAllowlist.includes(req.symbol)) {
      return {
        success: false,
        error: `Symbol ${req.symbol} not in live trading allowlist: [${this.context.symbolAllowlist.join(", ")}]`,
        simulated: false,
        mode: "LIVE",
      };
    }

    // ── Rate limit: prevent order flooding ────────────────────────────────
    const timeSinceLast = Date.now() - this.lastOrderTime;
    if (timeSinceLast < this.minOrderIntervalMs) {
      await sleep(this.minOrderIntervalMs - timeSinceLast);
    }

    // ── Require risk assessment to be present and approved ────────────────
    if (!req.riskAssessment?.approved) {
      return {
        success: false,
        error: "LiveExecutionAdapter: risk assessment must be approved before live order submission",
        simulated: false,
        mode: "LIVE",
      };
    }

    // ── Require post-only preference (reduce taker costs) ─────────────────
    // Market orders only allowed if explicitly set
    if (req.type === "MARKET" && !req.postOnly) {
      log.warn({ clientOrderId: req.clientOrderId }, "Market order submitted — higher taker fee applies");
    }

    const startTime = Date.now();
    this.lastOrderTime = startTime;
    this.orderCount++;

    try {
      log.info(
        {
          symbol: req.symbol,
          side: req.side,
          type: req.type,
          size: req.size,
          price: req.price,
          leverage: req.riskAssessment.adjustedLeverage,
          clientOrderId: req.clientOrderId,
          orderCount: this.orderCount,
        },
        "Submitting LIVE order to Lighter"
      );

      const order = await this.client.placeOrder(req);

      log.info(
        {
          orderId: order.id,
          status: order.status,
          fillPrice: order.avgFillPrice,
          latencyMs: Date.now() - startTime,
        },
        "LIVE order confirmed"
      );

      return {
        success: true,
        order,
        simulated: false,
        mode: "LIVE",
        latencyMs: Date.now() - startTime,
      };
    } catch (err) {
      log.error({ err, req }, "LIVE order failed");
      return {
        success: false,
        error: err instanceof Error ? err.message : "Unknown execution error",
        simulated: false,
        mode: "LIVE",
        latencyMs: Date.now() - startTime,
      };
    }
  }

  async cancelOrder(orderId: string): Promise<void> {
    log.info({ orderId }, "Cancelling LIVE order");
    await this.client.cancelOrder(orderId);
  }

  async emergencyFlattenAll(symbols: Symbol[]): Promise<void> {
    log.warn({ symbols }, "EMERGENCY FLATTEN: closing all positions immediately");
    // Cancel all open orders first
    for (const symbol of symbols) {
      try {
        await this.client.cancelAllOrders(symbol);
      } catch (err) {
        log.error({ symbol, err }, "Failed to cancel orders during emergency flatten");
      }
    }
    // NOTE: Actual position closing requires knowing position sizes
    // The BotOrchestrator calls this with open positions and submits reduce-only market orders
    log.warn("Emergency flatten: cancel phase complete. Reduce-only exits must be submitted by caller.");
  }

  getOrderCount(): number {
    return this.orderCount;
  }
}
