import { describe, it, expect, beforeEach } from 'vitest';
import {
  initializeInventory,
  getAvailableStock,
  reserveStock,
  releaseReservation,
  markDamaged,
  markQuarantined,
  adjustStock,
  resetInventory,
} from '../inventory';
import {
  createOrder,
  getOrder,
  updateOrderStatus,
  resetOrders,
} from '../order';
import {
  InventoryStatus,
  OrderStatus,
  OrderChannel,
  Inventory,
} from '@/lib/types';

describe('Inventory Service - Transactional Rules & Stock Invariants', () => {
  const initialStock: Inventory[] = [
    {
      id: 'inv-laptop-1',
      product_id: 'prod-laptop',
      warehouse_id: 'wh-001',
      location_id: 'loc-001',
      quantity: 10,
      available_quantity: 10,
      reserved_quantity: 0,
      damaged_quantity: 0,
      quarantined_quantity: 0,
      status: InventoryStatus.AVAILABLE,
    },
  ];

  beforeEach(() => {
    resetInventory();
    initializeInventory(initialStock);
  });

  it('1. Successfully reserves stock and decreases available quantity', () => {
    const res = reserveStock('inv-laptop-1', 4, 'ref-order-01');
    expect(res.success).toBe(true);
    expect(getAvailableStock('prod-laptop')).toBe(6);
  });

  it('2. Prevents over-reservation (insufficient stock / negative available stock prevention)', () => {
    const res = reserveStock('inv-laptop-1', 15, 'ref-order-02');
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/Insufficient/i);
    expect(getAvailableStock('prod-laptop')).toBe(10);
  });

  it('3. Prevents duplicate reservation for the same reference ID', () => {
    reserveStock('inv-laptop-1', 2, 'ref-order-dup');
    const duplicateRes = reserveStock('inv-laptop-1', 2, 'ref-order-dup');
    expect(duplicateRes.success).toBe(false);
    expect(duplicateRes.error).toMatch(/Already reserved/i);
  });

  it('4. Correctly releases reservations and restores available stock', () => {
    reserveStock('inv-laptop-1', 5, 'ref-order-rel');
    expect(getAvailableStock('prod-laptop')).toBe(5);

    const rel = releaseReservation('inv-laptop-1', 5, 'ref-order-rel');
    expect(rel.success).toBe(true);
    expect(getAvailableStock('prod-laptop')).toBe(10);
  });

  it('5. Handles damaged stock isolation and protects available quantity', () => {
    const res = markDamaged('inv-laptop-1', 3, 'Dropped in transit');
    expect(res.success).toBe(true);
    expect(getAvailableStock('prod-laptop')).toBe(7);
  });

  it('6. Prevents invalid negative stock adjustment', () => {
    reserveStock('inv-laptop-1', 8, 'ref-order-adj');
    const badAdjustment = adjustStock('inv-laptop-1', -5, 'Inventory recount error');
    // total qty would be 5, but reserved is 8, which violates invariants
    expect(badAdjustment.success).toBe(false);
  });
});

describe('Order Service - Lifecycle & Valid State Transitions', () => {
  beforeEach(() => {
    resetOrders();
  });

  it('7. Creates an order with CREATED status and calculates total value', () => {
    const order = createOrder({
      customer_id: 'cust-01',
      warehouse_id: 'wh-01',
      channel: OrderChannel.WEB,
      items: [
        { product_id: 'prod-1', quantity: 2, unit_price: 100 },
        { product_id: 'prod-2', quantity: 1, unit_price: 50 },
      ],
    });

    expect(order.status).toBe(OrderStatus.CREATED);
    expect(order.total_value).toBe(250);
    expect(order.order_number).toMatch(/^ORD-\d{6}$/);
  });

  it('8. Validates allowed state transitions (CREATED -> PRIORITY_SET -> INVENTORY_CHECKED -> ALLOCATED)', () => {
    const order = createOrder({
      customer_id: 'cust-01',
      warehouse_id: 'wh-01',
      channel: OrderChannel.WEB,
      items: [{ product_id: 'prod-1', quantity: 1, unit_price: 100 }],
    });

    const step1 = updateOrderStatus(order.id, OrderStatus.PRIORITY_SET);
    expect(step1.success).toBe(true);

    const step2 = updateOrderStatus(order.id, OrderStatus.INVENTORY_CHECKED);
    expect(step2.success).toBe(true);

    const step3 = updateOrderStatus(order.id, OrderStatus.ALLOCATED);
    expect(step3.success).toBe(true);
  });

  it('9. Rejects invalid state transition skipping steps (e.g. CREATED -> DISPATCHED)', () => {
    const order = createOrder({
      customer_id: 'cust-01',
      warehouse_id: 'wh-01',
      channel: OrderChannel.WEB,
      items: [{ product_id: 'prod-1', quantity: 1, unit_price: 100 }],
    });

    const invalidStep = updateOrderStatus(order.id, OrderStatus.DISPATCHED);
    expect(invalidStep.success).toBe(false);
    expect(invalidStep.error).toMatch(/Invalid transition/i);
    expect(getOrder(order.id)?.status).toBe(OrderStatus.CREATED);
  });

  it('10. Verifies workstation task queries and analytics distribution metrics', async () => {
    const { createPackingTask, getPackingTasks, resetPacking } = await import('../packing');
    const { createQualityCheck, getQualityChecks, resetQuality } = await import('../quality');
    const { computeAnalytics } = await import('../analytics');

    resetPacking();
    resetQuality();

    const pTask = createPackingTask('ord-001', 'pick-001');
    expect(getPackingTasks({ order_id: 'ord-001' })).toHaveLength(1);
    expect(getPackingTasks({ order_id: 'ord-002' })).toHaveLength(0);

    const qTask = createQualityCheck('ord-001', pTask.id);
    expect(getQualityChecks({ order_id: 'ord-001' })).toHaveLength(1);
    expect(getQualityChecks({ order_id: 'ord-999' })).toHaveLength(0);

    const analytics = computeAnalytics();
    expect(analytics.stage_distribution).toBeDefined();
    expect(analytics.tier_distribution).toBeDefined();
    expect(analytics.shift_throughput).toBeDefined();
  });
});
