import { describe, it, expect, beforeEach } from 'vitest';
import {
  initializeInventory,
  getAvailableStock,
  resetInventory,
} from '@/lib/services/inventory';
import {
  createOrder,
  getOrder,
  getOrderItems,
  updateOrderStatus,
  resetOrders,
} from '@/lib/services/order';
import { createPickingTask, updatePickingStatus, resetPicking } from '@/lib/services/picking';
import { createPackingTask, updatePackingStatus, resetPacking } from '@/lib/services/packing';
import { createQualityCheck, performQualityCheck, resetQuality } from '@/lib/services/quality';
import { createDispatch, updateDispatchStatus, resetDispatch } from '@/lib/services/dispatch';
import { computeAnalytics } from '@/lib/services/analytics';
import { resolveConflict } from '@/lib/engine/allocation';
import { calculatePriorityScore, detectSLARisk } from '@/lib/engine/priority';
import { clearDecisionLog, recordDecision, getDecisionChain } from '@/lib/engine/decision';
import {
  OrderStatus,
  OrderChannel,
  PickingStatus,
  PackingStatus,
  DispatchStatus,
  DecisionType,
  InventoryStatus,
} from '@/lib/types';
import { DEMO_PRODUCTS } from '@/lib/seed-data';

describe('End-to-End Fulfillment Lifecycle & Decision Pipeline', () => {
  beforeEach(() => {
    resetInventory();
    resetOrders();
    resetPicking();
    resetPacking();
    resetQuality();
    resetDispatch();
    clearDecisionLog();

    // 1. Initialize Stock: 7 Phones available
    initializeInventory([
      {
        id: 'inv-phone-main',
        product_id: 'prod-002',
        warehouse_id: 'wh-001',
        location_id: 'loc-002',
        quantity: 7,
        available_quantity: 7,
        reserved_quantity: 0,
        damaged_quantity: 0,
        quarantined_quantity: 0,
        status: InventoryStatus.AVAILABLE,
      },
    ]);
  });

  it('Executes the Official Problem Scenario: Competing Urgent (10 units) vs Standard (5 units) on 7 available stock', () => {
    // 1. Create Urgent VIP Order (needs 10 phones)
    const urgentOrder = createOrder({
      customer_id: 'cust-vip',
      warehouse_id: 'wh-001',
      channel: OrderChannel.WHOLESALE,
      items: [{ product_id: 'prod-002', quantity: 10, unit_price: 899.99 }],
      sla_deadline: new Date(Date.now() + 12 * 3600 * 1000).toISOString(), // 12h SLA
    });

    // 2. Create Standard Order (needs 5 phones)
    const stdOrder = createOrder({
      customer_id: 'cust-std',
      warehouse_id: 'wh-001',
      channel: OrderChannel.WEB,
      items: [{ product_id: 'prod-002', quantity: 5, unit_price: 899.99 }],
      sla_deadline: new Date(Date.now() + 72 * 3600 * 1000).toISOString(), // 72h SLA
    });

    // 3. Priority Scoring
    const urgentScore = calculatePriorityScore({
      sla_deadline: urgentOrder.sla_deadline,
      order_value: urgentOrder.total_value,
      created_at: urgentOrder.created_at,
      customer_tier: 'vip',
      channel: OrderChannel.WHOLESALE,
    });

    const stdScore = calculatePriorityScore({
      sla_deadline: stdOrder.sla_deadline,
      order_value: stdOrder.total_value,
      created_at: stdOrder.created_at,
      customer_tier: 'standard',
      channel: OrderChannel.WEB,
    });

    expect(urgentScore).toBeGreaterThan(stdScore);

    // Record Priority Decision
    recordDecision({
      decision_type: DecisionType.ORDER_PRIORITIZATION,
      inputs: { urgentScore, stdScore },
      priority_score: urgentScore,
      decision: `Prioritized Urgent VIP Order (${urgentScore.toFixed(1)}) over Standard (${stdScore.toFixed(1)})`,
      reason: 'Urgent wholesale order with 12h SLA vs standard 72h SLA',
      affected_orders: [urgentOrder.id, stdOrder.id],
      affected_items: {},
    });

    // 4. Run Conflict Resolution in Allocation Engine
    const inventoryPool = [
      {
        inventory_id: 'inv-phone-main',
        product_id: 'prod-002',
        available_quantity: 7,
        warehouse_id: 'wh-001',
        location_id: 'loc-002',
      },
    ];

    const { plans } = resolveConflict(
      [
        { order_id: urgentOrder.id, priority_score: urgentScore, items: [{ product_id: 'prod-002', quantity: 10 }] },
        { order_id: stdOrder.id, priority_score: stdScore, items: [{ product_id: 'prod-002', quantity: 5 }] },
      ],
      inventoryPool
    );

    const urgentPlan = plans.find((p) => p.order_id === urgentOrder.id)!;
    const stdPlan = plans.find((p) => p.order_id === stdOrder.id)!;

    // Verify Urgent gets all 7 available units with partial allocation flag and shortage of 3
    expect(urgentPlan.allocations[0].allocated).toBe(7);
    expect(urgentPlan.allocations[0].is_partial).toBe(true);
    expect(urgentPlan.total_shortage).toBe(3);

    // Verify Standard order gets 0 units and shortage of 5
    expect(stdPlan.allocations[0].allocated).toBe(0);
    expect(stdPlan.total_shortage).toBe(5);

    // 5. Advance Urgent Order through full pipeline: Picking -> Packing -> QC -> Dispatch
    updateOrderStatus(urgentOrder.id, OrderStatus.ALLOCATED);
    const pickTask = createPickingTask(urgentOrder, ['loc-002']);
    expect(pickTask.status).toBe(PickingStatus.PENDING);

    updatePickingStatus(pickTask.id, PickingStatus.PICKED);
    updateOrderStatus(urgentOrder.id, OrderStatus.PICKING);

    const packTask = createPackingTask(urgentOrder.id, pickTask.id);
    updatePackingStatus(packTask.id, PackingStatus.PACKED);
    updateOrderStatus(urgentOrder.id, OrderStatus.PACKING);

    const qc = createQualityCheck(urgentOrder.id, packTask.id);
    performQualityCheck(qc.id, true, 'All 7 serialized units verified');
    updateOrderStatus(urgentOrder.id, OrderStatus.QUALITY_CHECK);

    const dispatch = createDispatch(urgentOrder.id, 'FedEx Priority Express');
    updateDispatchStatus(dispatch.id, DispatchStatus.IN_TRANSIT, 'TRK-987654321');
    updateOrderStatus(urgentOrder.id, OrderStatus.DISPATCHED);

    // 6. Verify Decision Audit Trail
    const chain = getDecisionChain(urgentOrder.id);
    expect(chain.length).toBeGreaterThanOrEqual(1);

    // 7. Verify Real-Time Analytics
    const analytics = computeAnalytics(DEMO_PRODUCTS);
    expect(analytics.total_orders).toBe(2);
    expect(analytics.bottlenecks.length).toBeGreaterThan(0);
  });
});
