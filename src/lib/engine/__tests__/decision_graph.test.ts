import { describe, it, expect, beforeEach } from 'vitest';
import { recordDecision, clearDecisionLog, getDecisionChain, getDecisionLog } from '@/lib/engine/decision';
import { DecisionType } from '@/lib/types';

describe('Decision Graph Data', () => {
  beforeEach(() => {
    clearDecisionLog();
  });

  describe('Decision chain for graph construction', () => {
    it('should return decisions in chronological order for a given order', () => {
      // Record decisions for an order with slight time offsets
      const d1 = recordDecision({
        decision_type: DecisionType.ORDER_PRIORITIZATION,
        inputs: { sla_deadline: '2025-12-31', order_value: 5000 },
        priority_score: 85,
        decision: 'Priority set to 85',
        reason: 'High value VIP order with tight SLA',
        affected_orders: ['order-graph-1'],
        affected_items: {},
      });

      const d2 = recordDecision({
        decision_type: DecisionType.INVENTORY_ALLOCATION,
        inputs: { product_id: 'prod-001', quantity: 10 },
        priority_score: 85,
        decision: 'Allocated 10 units',
        reason: 'Full allocation from location A-1',
        affected_orders: ['order-graph-1'],
        affected_items: { 'prod-001': 10 },
      });

      const d3 = recordDecision({
        decision_type: DecisionType.PICKING_PRIORITIZATION,
        inputs: { order_id: 'order-graph-1' },
        priority_score: 85,
        decision: 'Picking task created',
        reason: 'Fast-track picking for priority 85',
        affected_orders: ['order-graph-1'],
        affected_items: {},
        recommended_action: 'Fast-track picking',
      });

      const chain = getDecisionChain('order-graph-1');
      expect(chain).toHaveLength(3);
      expect(chain[0].id).toBe(d1.id);
      expect(chain[1].id).toBe(d2.id);
      expect(chain[2].id).toBe(d3.id);
    });

    it('should return only decisions for the specified order', () => {
      recordDecision({
        decision_type: DecisionType.ORDER_PRIORITIZATION,
        inputs: {},
        decision: 'Priority set',
        reason: 'Test',
        affected_orders: ['order-A'],
        affected_items: {},
      });

      recordDecision({
        decision_type: DecisionType.INVENTORY_ALLOCATION,
        inputs: {},
        decision: 'Allocated',
        reason: 'Test',
        affected_orders: ['order-B'],
        affected_items: {},
      });

      recordDecision({
        decision_type: DecisionType.PICKING_PRIORITIZATION,
        inputs: {},
        decision: 'Picking',
        reason: 'Test',
        affected_orders: ['order-A'],
        affected_items: {},
      });

      const chainA = getDecisionChain('order-A');
      const chainB = getDecisionChain('order-B');

      expect(chainA).toHaveLength(2);
      expect(chainB).toHaveLength(1);
      expect(chainA.every(d => d.affected_orders.includes('order-A'))).toBe(true);
      expect(chainB.every(d => d.affected_orders.includes('order-B'))).toBe(true);
    });

    it('should return empty chain for non-existent order', () => {
      const chain = getDecisionChain('non-existent-order');
      expect(chain).toHaveLength(0);
    });

    it('should include all decision types in the chain', () => {
      const types = [
        DecisionType.ORDER_PRIORITIZATION,
        DecisionType.SLA_RISK_DETECTION,
        DecisionType.INVENTORY_ALLOCATION,
        DecisionType.PARTIAL_ALLOCATION,
        DecisionType.REALLOCATION,
        DecisionType.EXCEPTION_SEVERITY,
        DecisionType.REORDER_RECOMMENDATION,
        DecisionType.PICKING_PRIORITIZATION,
      ];

      types.forEach((type) => {
        recordDecision({
          decision_type: type,
          inputs: {},
          decision: `Decision: ${type}`,
          reason: `Reason: ${type}`,
          affected_orders: ['order-all-types'],
          affected_items: {},
        });
      });

      const chain = getDecisionChain('order-all-types');
      expect(chain).toHaveLength(types.length);

      const chainTypes = chain.map((d) => d.decision_type);
      types.forEach((type) => {
        expect(chainTypes).toContain(type);
      });
    });

    it('should support filtering by decision type', () => {
      recordDecision({
        decision_type: DecisionType.ORDER_PRIORITIZATION,
        inputs: {},
        decision: 'Prioritized',
        reason: 'Test',
        affected_orders: ['order-filter'],
        affected_items: {},
      });

      recordDecision({
        decision_type: DecisionType.INVENTORY_ALLOCATION,
        inputs: {},
        decision: 'Allocated',
        reason: 'Test',
        affected_orders: ['order-filter'],
        affected_items: {},
      });

      const priorityOnly = getDecisionLog({ decision_type: DecisionType.ORDER_PRIORITIZATION });
      expect(priorityOnly).toHaveLength(1);
      expect(priorityOnly[0].decision_type).toBe(DecisionType.ORDER_PRIORITIZATION);

      const allocationOnly = getDecisionLog({ decision_type: DecisionType.INVENTORY_ALLOCATION });
      expect(allocationOnly).toHaveLength(1);
      expect(allocationOnly[0].decision_type).toBe(DecisionType.INVENTORY_ALLOCATION);
    });

    it('should include recommended_action when present', () => {
      const decision = recordDecision({
        decision_type: DecisionType.EXCEPTION_SEVERITY,
        inputs: { exception_type: 'OUT_OF_STOCK' },
        decision: 'Critical exception',
        reason: 'Product depleted',
        affected_orders: ['order-rec'],
        affected_items: { 'prod-001': 0 },
        recommended_action: 'Place emergency reorder for 50 units',
      });

      expect(decision.recommended_action).toBe('Place emergency reorder for 50 units');

      const chain = getDecisionChain('order-rec');
      expect(chain[0].recommended_action).toBe('Place emergency reorder for 50 units');
    });
  });

  describe('Graph node type mapping coverage', () => {
    it('should handle all DecisionType values', () => {
      // Verify every DecisionType enum value exists
      const allTypes = Object.values(DecisionType);
      expect(allTypes.length).toBeGreaterThanOrEqual(8);

      // Each type should be a valid string
      allTypes.forEach((type) => {
        expect(typeof type).toBe('string');
        expect(type.length).toBeGreaterThan(0);
      });
    });
  });
});
