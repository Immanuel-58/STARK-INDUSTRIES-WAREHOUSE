import { describe, it, expect, beforeEach } from 'vitest';
import {
  calculatePriorityScore,
  classifyPriority,
  detectSLARisk,
  DEFAULT_WEIGHTS,
} from '../priority';
import {
  allocateInventory,
  resolveConflict,
  calculateReorderRecommendation,
  AllocationRequest,
  InventoryPool,
} from '../allocation';
import {
  detectExceptions,
  classifySeverity,
  recommendResolution,
} from '../exception';
import {
  recordDecision,
  getDecisionLog,
  getDecisionChain,
  clearDecisionLog,
} from '../decision';
import {
  OrderChannel,
  OrderStatus,
  InventoryStatus,
  ExceptionType,
  ExceptionSeverity,
  DecisionType,
  Product,
  Inventory,
  Order,
  Customer,
} from '@/lib/types';

describe('Decision Engine - Priority Scoring', () => {
  const baseTime = new Date('2026-08-15T12:00:00Z');

  it('1. Calculates high priority for urgent VIP wholesale order approaching SLA deadline', () => {
    const score = calculatePriorityScore(
      {
        sla_deadline: new Date('2026-08-15T16:00:00Z'), // 4h remaining
        order_value: 8500,
        created_at: new Date('2026-08-14T12:00:00Z'), // 24h old
        customer_tier: 'vip',
        channel: OrderChannel.WHOLESALE,
      },
      DEFAULT_WEIGHTS,
      baseTime
    );

    expect(score).toBeGreaterThan(70);
    expect(classifyPriority(score)).toMatch(/high|critical/);
  });

  it('2. Calculates lower priority for standard web order with distant SLA', () => {
    const score = calculatePriorityScore(
      {
        sla_deadline: new Date('2026-08-18T12:00:00Z'), // 72h remaining
        order_value: 150,
        created_at: new Date('2026-08-15T11:00:00Z'), // 1h old
        customer_tier: 'standard',
        channel: OrderChannel.WEB,
      },
      DEFAULT_WEIGHTS,
      baseTime
    );

    expect(score).toBeLessThan(45);
    expect(classifyPriority(score)).toMatch(/low|medium/);
  });

  it('3. Detects SLA risk correctly based on hours remaining', () => {
    const criticalOrder = {
      sla_deadline: new Date('2026-08-15T18:00:00Z').toISOString(), // 6 hours away
      status: OrderStatus.CREATED,
      created_at: baseTime.toISOString(),
    };
    const risk = detectSLARisk(criticalOrder, baseTime.getTime());
    expect(risk.at_risk).toBe(true);
    expect(risk.risk_level).toBe('critical');
    expect(risk.hours_remaining).toBeCloseTo(6);
  });
});

describe('Decision Engine - Allocation & Conflict Resolution', () => {
  let inventoryPool: InventoryPool[];

  beforeEach(() => {
    inventoryPool = [
      {
        inventory_id: 'inv-phone-01',
        product_id: 'prod-phone',
        available_quantity: 7,
        warehouse_id: 'wh-001',
        location_id: 'loc-A1',
      },
    ];
  });

  it('4. Normal allocation when stock is completely sufficient', () => {
    const request: AllocationRequest = {
      order_id: 'ord-normal',
      priority_score: 50,
      items: [{ product_id: 'prod-phone', quantity: 5 }],
    };

    const plan = allocateInventory(request, inventoryPool);
    expect(plan.fully_allocated).toBe(true);
    expect(plan.total_shortage).toBe(0);
    expect(plan.allocations[0].allocated).toBe(5);
    expect(plan.allocations[0].is_partial).toBe(false);
    expect(plan.exceptions.length).toBe(0);
  });

  it('5. Insufficient stock triggers partial allocation and exception', () => {
    const request: AllocationRequest = {
      order_id: 'ord-urgent-vip',
      priority_score: 90,
      items: [{ product_id: 'prod-phone', quantity: 10 }], // only 7 available
    };

    const plan = allocateInventory(request, inventoryPool);
    expect(plan.fully_allocated).toBe(false);
    expect(plan.total_shortage).toBe(3);
    expect(plan.allocations[0].allocated).toBe(7);
    expect(plan.allocations[0].is_partial).toBe(true);
    expect(plan.allocations[0].shortage).toBe(3);

    // Exception created
    expect(plan.exceptions.length).toBeGreaterThan(0);
    expect(plan.exceptions[0].type).toBe(ExceptionType.PARTIAL_ALLOCATION);
  });

  it('6. Competing orders conflict resolution: Higher priority order gets inventory first', () => {
    const urgentOrder: AllocationRequest = {
      order_id: 'ord-urgent-10-units',
      priority_score: 88,
      items: [{ product_id: 'prod-phone', quantity: 10 }],
    };

    const standardOrder: AllocationRequest = {
      order_id: 'ord-std-5-units',
      priority_score: 35,
      items: [{ product_id: 'prod-phone', quantity: 5 }],
    };

    // 7 total units available
    const { plans } = resolveConflict([standardOrder, urgentOrder], inventoryPool);

    const urgentPlan = plans.find((p) => p.order_id === 'ord-urgent-10-units');
    const stdPlan = plans.find((p) => p.order_id === 'ord-std-5-units');

    // Urgent order allocated all 7 available units
    expect(urgentPlan).toBeDefined();
    expect(urgentPlan?.allocations[0].allocated).toBe(7);
    expect(urgentPlan?.allocations[0].is_partial).toBe(true);

    // Standard order gets 0 units (shortage 5) because inventory was depleted by higher priority order
    expect(stdPlan).toBeDefined();
    expect(stdPlan?.allocations[0].allocated).toBe(0);
    expect(stdPlan?.allocations[0].shortage).toBe(5);
    expect(stdPlan?.fully_allocated).toBe(false);
  });

  it('7. Calculates reorder recommendation when effective stock is below reorder point', () => {
    const recommendation = calculateReorderRecommendation(
      'prod-phone',
      12, // current stock
      20, // reorder point
      50, // reorder quantity
      5   // pending orders
    );

    expect(recommendation.should_reorder).toBe(true);
    expect(recommendation.recommended_quantity).toBeGreaterThanOrEqual(50);
  });
});

describe('Decision Engine - Exception & Resolution', () => {
  it('8. Detects low stock, out of stock, and damaged items', () => {
    const product: Product = {
      id: 'prod-001',
      sku: 'SKU-1',
      name: 'Smart Camera',
      category: 'Electronics',
      unit_price: 199,
      reorder_point: 20,
      reorder_quantity: 50,
      is_active: true,
    };

    const damagedInventory: Inventory = {
      id: 'inv-1',
      product_id: 'prod-001',
      warehouse_id: 'wh-1',
      location_id: 'loc-1',
      quantity: 15,
      available_quantity: 10,
      reserved_quantity: 0,
      damaged_quantity: 5,
      quarantined_quantity: 0,
      status: InventoryStatus.AVAILABLE,
    };

    const exceptions = detectExceptions({
      product,
      inventory: damagedInventory,
    });

    const types = exceptions.map((e) => e.type);
    expect(types).toContain(ExceptionType.LOW_STOCK);
    expect(types).toContain(ExceptionType.DAMAGED_ITEM);
  });

  it('9. Classifies critical severity for SLA risk with VIP customer', () => {
    const vipCustomer: Customer = {
      id: 'cust-vip',
      name: 'VIP Client',
      email: 'vip@test.com',
      tier: 'vip',
      channel: OrderChannel.WHOLESALE,
      address: '123 St',
      sla_hours: 12,
    };

    const order: Order = {
      id: 'ord-vip-sla',
      order_number: 'ORD-000001',
      customer_id: 'cust-vip',
      warehouse_id: 'wh-1',
      status: OrderStatus.CREATED,
      channel: OrderChannel.WHOLESALE,
      priority_score: 95,
      total_value: 5000,
      sla_deadline: new Date(Date.now() + 4 * 3600 * 1000).toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const severity = classifySeverity(ExceptionType.SLA_RISK, {
      order,
      customer: vipCustomer,
    });
    expect(severity).toBe(ExceptionSeverity.CRITICAL);
  });
});

describe('Decision Recorder & Audit Trail', () => {
  beforeEach(() => {
    clearDecisionLog();
  });

  it('10. Records and traces decision chains per order', () => {
    recordDecision({
      decision_type: DecisionType.ORDER_PRIORITIZATION,
      inputs: { customer_tier: 'vip' },
      priority_score: 88,
      decision: 'Priority calculated as 88',
      reason: 'Urgent SLA deadline and VIP tier',
      affected_orders: ['ord-100'],
      affected_items: {},
    });

    recordDecision({
      decision_type: DecisionType.INVENTORY_ALLOCATION,
      inputs: { requested: 10, available: 7 },
      priority_score: 88,
      decision: 'Partial allocation of 7 units',
      reason: 'Scarce inventory preserved for high priority order',
      affected_orders: ['ord-100'],
      affected_items: { 'prod-phone': 7 },
    });

    const chain = getDecisionChain('ord-100');
    expect(chain.length).toBe(2);
    expect(chain[0].decision_type).toBe(DecisionType.ORDER_PRIORITIZATION);
    expect(chain[1].decision_type).toBe(DecisionType.INVENTORY_ALLOCATION);
  });
});
