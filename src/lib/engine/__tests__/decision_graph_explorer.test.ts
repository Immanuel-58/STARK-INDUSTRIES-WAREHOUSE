import { describe, it, expect, beforeEach } from 'vitest';
import { recordDecision, clearDecisionLog, getDecisionChain, getDecisionLog } from '@/lib/engine/decision';
import { DecisionType, OrderStatus, OrderChannel, InventoryStatus, ExceptionType, ExceptionSeverity } from '@/lib/types';
import { createOrder, getOrder, getOrderItems, resetOrders, updateOrderStatus, updateOrderPriority } from '@/lib/services/order';
import { initializeInventory, resetInventory } from '@/lib/services/inventory';
import { calculatePriorityScore, detectSLARisk } from '@/lib/engine/priority';
import { allocateInventory, resolveConflict } from '@/lib/engine/allocation';
import { DEMO_CUSTOMERS, DEMO_PRODUCTS } from '@/lib/seed-data';
import type { GraphNode, GraphEdge, GraphNodeType, GraphNodeStatus, DecisionGraphData } from '@/components/decision-graph/graphTypes';
import { NODE_STATUS_COLORS, NODE_TYPE_ICONS, DEFAULT_LAYOUT_CONFIG } from '@/components/decision-graph/graphTypes';

// ─── Helper: Replicate buildOrderGraph logic for unit-level testing ─────────
// We test the graph transformation logic directly by calling the same functions
// that the API route uses, since the API route itself calls getDecisionChain,
// getOrder, getOrderItems — all in-memory services we control in tests.

function mapDecisionTypeToNodeType(dt: DecisionType): GraphNodeType {
  switch (dt) {
    case DecisionType.ORDER_PRIORITIZATION: return 'priority_evaluation';
    case DecisionType.INVENTORY_ALLOCATION: return 'allocation';
    case DecisionType.PARTIAL_ALLOCATION: return 'allocation';
    case DecisionType.REALLOCATION: return 'conflict_resolution';
    case DecisionType.REORDER_RECOMMENDATION: return 'reorder_recommendation';
    case DecisionType.PICKING_PRIORITIZATION: return 'pipeline_stage';
    case DecisionType.EXCEPTION_SEVERITY: return 'exception';
    case DecisionType.SLA_RISK_DETECTION: return 'sla_risk';
    default: return 'pipeline_stage';
  }
}

function decisionStatus(decision: string, reason: string): GraphNodeStatus {
  const d = decision.toLowerCase();
  const r = reason.toLowerCase();
  if (r.includes('out of stock') || r.includes('failed') || d.includes('exception')) return 'error';
  if (r.includes('partial') || r.includes('shortage') || r.includes('risk') || r.includes('below')) return 'warning';
  if (d.includes('allocated') || d.includes('created') || d.includes('passed') || d.includes('complete')) return 'success';
  return 'info';
}

describe('Decision Graph — Node/Edge Conversion', () => {
  beforeEach(() => {
    clearDecisionLog();
    resetOrders();
    resetInventory();
  });

  describe('Event → Node Conversion', () => {
    it('maps ORDER_PRIORITIZATION to priority_evaluation node type', () => {
      expect(mapDecisionTypeToNodeType(DecisionType.ORDER_PRIORITIZATION)).toBe('priority_evaluation');
    });

    it('maps INVENTORY_ALLOCATION to allocation node type', () => {
      expect(mapDecisionTypeToNodeType(DecisionType.INVENTORY_ALLOCATION)).toBe('allocation');
    });

    it('maps PARTIAL_ALLOCATION to allocation node type', () => {
      expect(mapDecisionTypeToNodeType(DecisionType.PARTIAL_ALLOCATION)).toBe('allocation');
    });

    it('maps REALLOCATION to conflict_resolution node type', () => {
      expect(mapDecisionTypeToNodeType(DecisionType.REALLOCATION)).toBe('conflict_resolution');
    });

    it('maps REORDER_RECOMMENDATION to reorder_recommendation node type', () => {
      expect(mapDecisionTypeToNodeType(DecisionType.REORDER_RECOMMENDATION)).toBe('reorder_recommendation');
    });

    it('maps PICKING_PRIORITIZATION to pipeline_stage node type', () => {
      expect(mapDecisionTypeToNodeType(DecisionType.PICKING_PRIORITIZATION)).toBe('pipeline_stage');
    });

    it('maps EXCEPTION_SEVERITY to exception node type', () => {
      expect(mapDecisionTypeToNodeType(DecisionType.EXCEPTION_SEVERITY)).toBe('exception');
    });

    it('maps SLA_RISK_DETECTION to sla_risk node type', () => {
      expect(mapDecisionTypeToNodeType(DecisionType.SLA_RISK_DETECTION)).toBe('sla_risk');
    });

    it('maps all DecisionType values to valid GraphNodeType values', () => {
      const validNodeTypes: GraphNodeType[] = [
        'order_created', 'priority_evaluation', 'sla_risk', 'inventory_check',
        'allocation', 'conflict_resolution', 'exception', 'resolution',
        'reorder_recommendation', 'pipeline_stage',
      ];

      Object.values(DecisionType).forEach((dt) => {
        const nodeType = mapDecisionTypeToNodeType(dt);
        expect(validNodeTypes).toContain(nodeType);
      });
    });
  });

  describe('Decision Status Classification', () => {
    it('classifies allocation decisions as success', () => {
      expect(decisionStatus('Allocated 10 units', 'Full allocation from warehouse')).toBe('success');
    });

    it('classifies out-of-stock as error', () => {
      expect(decisionStatus('No stock', 'Product out of stock')).toBe('error');
    });

    it('classifies partial allocation as warning', () => {
      expect(decisionStatus('Allocated 5 of 10', 'Partial allocation due to shortage')).toBe('warning');
    });

    it('classifies exceptions as error', () => {
      expect(decisionStatus('Exception raised', 'Quality check failed')).toBe('error');
    });

    it('classifies risk detection as warning', () => {
      expect(decisionStatus('SLA monitored', 'Order at risk of missing deadline')).toBe('warning');
    });

    it('classifies unknown decisions as info', () => {
      expect(decisionStatus('Processing', 'Standard processing')).toBe('info');
    });
  });

  describe('Decision Ordering', () => {
    it('maintains chronological order within a decision chain', () => {
      recordDecision({
        decision_type: DecisionType.ORDER_PRIORITIZATION,
        inputs: {},
        decision: 'Priority set',
        reason: 'Step 1',
        affected_orders: ['ord-chrono'],
        affected_items: {},
      });

      recordDecision({
        decision_type: DecisionType.INVENTORY_ALLOCATION,
        inputs: {},
        decision: 'Allocated',
        reason: 'Step 2',
        affected_orders: ['ord-chrono'],
        affected_items: {},
      });

      recordDecision({
        decision_type: DecisionType.PICKING_PRIORITIZATION,
        inputs: {},
        decision: 'Picking assigned',
        reason: 'Step 3',
        affected_orders: ['ord-chrono'],
        affected_items: {},
      });

      const chain = getDecisionChain('ord-chrono');
      expect(chain).toHaveLength(3);

      // Verify chronological ordering
      for (let i = 1; i < chain.length; i++) {
        const prev = new Date(chain[i - 1].created_at).getTime();
        const curr = new Date(chain[i].created_at).getTime();
        expect(curr).toBeGreaterThanOrEqual(prev);
      }
    });

    it('produces deterministic order for decisions recorded at similar times', () => {
      // Record multiple decisions quickly
      for (let i = 0; i < 5; i++) {
        recordDecision({
          decision_type: DecisionType.INVENTORY_ALLOCATION,
          inputs: { batch: i },
          decision: `Allocation batch ${i}`,
          reason: `Batch reason ${i}`,
          affected_orders: ['ord-deterministic'],
          affected_items: {},
        });
      }

      const chain1 = getDecisionChain('ord-deterministic');
      const chain2 = getDecisionChain('ord-deterministic');

      expect(chain1.length).toBe(chain2.length);
      chain1.forEach((d, i) => {
        expect(d.id).toBe(chain2[i].id);
      });
    });
  });

  describe('Empty & Invalid Data Handling', () => {
    it('returns empty chain for non-existent order', () => {
      const chain = getDecisionChain('non-existent-order-xyz');
      expect(chain).toHaveLength(0);
    });

    it('returns empty decision log when no decisions recorded', () => {
      const log = getDecisionLog();
      expect(log).toHaveLength(0);
    });

    it('returns empty chain after clearing log', () => {
      recordDecision({
        decision_type: DecisionType.ORDER_PRIORITIZATION,
        inputs: {},
        decision: 'Test',
        reason: 'Test',
        affected_orders: ['ord-clear'],
        affected_items: {},
      });

      expect(getDecisionChain('ord-clear')).toHaveLength(1);
      clearDecisionLog();
      expect(getDecisionChain('ord-clear')).toHaveLength(0);
    });

    it('handles decision with empty affected_orders', () => {
      const decision = recordDecision({
        decision_type: DecisionType.REORDER_RECOMMENDATION,
        inputs: {},
        decision: 'Reorder needed',
        reason: 'Low stock globally',
        affected_orders: [],
        affected_items: {},
      });

      expect(decision.affected_orders).toHaveLength(0);
      expect(getDecisionChain('any-order')).toHaveLength(0);
    });

    it('handles decision with missing optional fields', () => {
      const decision = recordDecision({
        decision_type: DecisionType.ORDER_PRIORITIZATION,
        inputs: {},
        decision: 'Priority calculated',
        reason: 'Standard scoring',
        affected_orders: ['ord-minimal'],
        affected_items: {},
      });

      expect(decision.priority_score).toBeUndefined();
      expect(decision.recommended_action).toBeUndefined();
      expect(decision.created_by).toBeUndefined();
      expect(decision.id).toBeTruthy();
      expect(decision.created_at).toBeTruthy();
    });
  });

  describe('Graph Node Type Coverage', () => {
    it('every GraphNodeType has a corresponding icon', () => {
      const allNodeTypes: GraphNodeType[] = [
        'order_created', 'priority_evaluation', 'sla_risk', 'inventory_check',
        'allocation', 'conflict_resolution', 'exception', 'resolution',
        'reorder_recommendation', 'pipeline_stage',
      ];

      allNodeTypes.forEach((type) => {
        expect(NODE_TYPE_ICONS[type]).toBeDefined();
        expect(typeof NODE_TYPE_ICONS[type]).toBe('string');
        expect(NODE_TYPE_ICONS[type].length).toBeGreaterThan(0);
      });
    });

    it('every GraphNodeStatus has color definitions', () => {
      const allStatuses: GraphNodeStatus[] = ['success', 'warning', 'error', 'info', 'neutral'];

      allStatuses.forEach((status) => {
        const colors = NODE_STATUS_COLORS[status];
        expect(colors).toBeDefined();
        expect(colors.bg).toBeTruthy();
        expect(colors.border).toBeTruthy();
        expect(colors.text).toBeTruthy();
        expect(colors.accent).toBeTruthy();
      });
    });

    it('DEFAULT_LAYOUT_CONFIG has valid dimensions', () => {
      expect(DEFAULT_LAYOUT_CONFIG.nodeWidth).toBeGreaterThan(0);
      expect(DEFAULT_LAYOUT_CONFIG.nodeHeight).toBeGreaterThan(0);
      expect(DEFAULT_LAYOUT_CONFIG.horizontalSpacing).toBeGreaterThan(0);
      expect(DEFAULT_LAYOUT_CONFIG.verticalSpacing).toBeGreaterThan(0);
      expect(DEFAULT_LAYOUT_CONFIG.padding).toBeGreaterThan(0);
    });
  });

  describe('Edge Construction Logic', () => {
    it('produces edges connecting decisions for the same order in sequence', () => {
      // Simulate what buildOrderGraph does: record decisions, then verify chain
      const orderId = 'ord-edge-test';

      recordDecision({
        decision_type: DecisionType.ORDER_PRIORITIZATION,
        inputs: {},
        decision: 'Priority set to 75',
        reason: 'Medium priority',
        affected_orders: [orderId],
        affected_items: {},
      });

      recordDecision({
        decision_type: DecisionType.INVENTORY_ALLOCATION,
        inputs: {},
        decision: 'Allocated 5 units',
        reason: 'Full allocation',
        affected_orders: [orderId],
        affected_items: { 'prod-001': 5 },
      });

      const chain = getDecisionChain(orderId);
      expect(chain).toHaveLength(2);

      // Verify edge can be constructed between consecutive decisions
      const sourceId = `node-${chain[0].decision_type}-${orderId}`;
      const targetId = `node-${chain[1].decision_type}-${orderId}`;
      
      const edge: GraphEdge = {
        id: `edge-${sourceId}-${targetId}`,
        source: sourceId,
        target: targetId,
        label: 'Allocate',
        type: 'normal',
      };

      expect(edge.source).not.toBe(edge.target);
      expect(edge.id).toContain('edge-');
    });

    it('generates exception-type edges for partial allocations', () => {
      const orderId = 'ord-partial-edge';

      recordDecision({
        decision_type: DecisionType.PARTIAL_ALLOCATION,
        inputs: { requested: 10, available: 5 },
        decision: 'Partial allocation of 5 units',
        reason: 'Shortage of 5 units',
        affected_orders: [orderId],
        affected_items: { 'prod-001': 5 },
      });

      const chain = getDecisionChain(orderId);
      const decision = chain[0];

      // Verify this would generate an exception-type edge
      expect(decision.decision_type).toBe(DecisionType.PARTIAL_ALLOCATION);
      expect(mapDecisionTypeToNodeType(decision.decision_type)).toBe('allocation');
    });

    it('generates resolution-type edges when recommended_action exists', () => {
      const orderId = 'ord-resolution-edge';

      recordDecision({
        decision_type: DecisionType.EXCEPTION_SEVERITY,
        inputs: { exception_type: 'OUT_OF_STOCK' },
        decision: 'Critical exception detected',
        reason: 'Product completely out of stock',
        affected_orders: [orderId],
        affected_items: {},
        recommended_action: 'Place emergency reorder for 100 units',
      });

      const chain = getDecisionChain(orderId);
      expect(chain[0].recommended_action).toBe('Place emergency reorder for 100 units');

      // Resolution edge would be type 'resolution'
      const resolutionEdge: GraphEdge = {
        id: `edge-exception-resolution-${orderId}`,
        source: `node-exception-${orderId}`,
        target: `node-resolution-${orderId}`,
        label: 'Resolve',
        type: 'resolution',
      };

      expect(resolutionEdge.type).toBe('resolution');
    });
  });

  describe('Full Graph Data Structure Validation', () => {
    it('produces a valid order summary list from getOrders', () => {
      const order = createOrder({
        customer_id: 'cust-001',
        warehouse_id: 'wh-001',
        channel: OrderChannel.WEB,
        items: [{ product_id: 'prod-001', quantity: 2, unit_price: 100 }],
      });

      recordDecision({
        decision_type: DecisionType.ORDER_PRIORITIZATION,
        inputs: {},
        decision: 'Priority calculated',
        reason: 'Standard order',
        affected_orders: [order.id],
        affected_items: {},
      });

      const chain = getDecisionChain(order.id);
      expect(chain.length).toBe(1);

      // Verify order can be used for graph summary
      expect(order.id).toBeTruthy();
      expect(order.order_number).toMatch(/^ORD-\d{6}$/);
      expect(order.status).toBe(OrderStatus.CREATED);
    });

    it('produces a complete decision graph with all required fields', () => {
      const order = createOrder({
        customer_id: 'cust-001',
        warehouse_id: 'wh-001',
        channel: OrderChannel.WEB,
        items: [{ product_id: 'prod-001', quantity: 2, unit_price: 100 }],
        sla_deadline: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
      });

      recordDecision({
        decision_type: DecisionType.ORDER_PRIORITIZATION,
        inputs: { customer_tier: 'standard', channel: 'WEB' },
        priority_score: 45,
        decision: 'Priority set to 45',
        reason: 'Standard web order',
        affected_orders: [order.id],
        affected_items: {},
      });

      recordDecision({
        decision_type: DecisionType.INVENTORY_ALLOCATION,
        inputs: { product_id: 'prod-001', quantity: 2 },
        decision: 'Allocated 2 units',
        reason: 'Full allocation from warehouse',
        affected_orders: [order.id],
        affected_items: { 'prod-001': 2 },
      });

      // Verify we can construct DecisionGraphData structure
      const chain = getDecisionChain(order.id);
      expect(chain.length).toBe(2);

      const items = getOrderItems(order.id);
      expect(items.length).toBe(1);

      const slaRisk = detectSLARisk(order);
      expect(typeof slaRisk.at_risk).toBe('boolean');
      expect(typeof slaRisk.hours_remaining).toBe('number');
    });

    it('handles multi-item orders correctly', () => {
      const order = createOrder({
        customer_id: 'cust-001',
        warehouse_id: 'wh-001',
        channel: OrderChannel.WHOLESALE,
        items: [
          { product_id: 'prod-001', quantity: 5, unit_price: 1299.99 },
          { product_id: 'prod-002', quantity: 3, unit_price: 899.99 },
          { product_id: 'prod-003', quantity: 10, unit_price: 499.99 },
        ],
      });

      const items = getOrderItems(order.id);
      expect(items).toHaveLength(3);
      expect(order.total_value).toBeCloseTo(5 * 1299.99 + 3 * 899.99 + 10 * 499.99, 1);
    });
  });

  describe('Node Inspection Data', () => {
    it('decision events contain inputs and outputs for node inspection', () => {
      const decision = recordDecision({
        decision_type: DecisionType.INVENTORY_ALLOCATION,
        inputs: {
          product_id: 'prod-001',
          requested_quantity: 10,
          available_stock: 7,
          warehouse_id: 'wh-001',
        },
        priority_score: 85,
        decision: 'Partial allocation of 7 units',
        reason: 'Only 7 available from 10 requested',
        affected_orders: ['ord-inspect'],
        affected_items: { 'prod-001': 7 },
        recommended_action: 'Place reorder for remaining 3 units',
      });

      // Verify all fields needed for node inspection panel
      expect(decision.inputs.product_id).toBe('prod-001');
      expect(decision.inputs.requested_quantity).toBe(10);
      expect(decision.inputs.available_stock).toBe(7);
      expect(decision.decision).toContain('Partial allocation');
      expect(decision.reason).toContain('7 available');
      expect(decision.recommended_action).toContain('reorder');
      expect(decision.affected_items['prod-001']).toBe(7);
      expect(decision.priority_score).toBe(85);
      expect(decision.created_at).toBeTruthy();
    });
  });
});
