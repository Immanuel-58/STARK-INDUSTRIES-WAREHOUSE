import { NextResponse } from 'next/server';
import {
  initializeInventory,
  resetInventory,
} from '@/lib/services/inventory';
import {
  createOrder,
  resetOrders,
  updateOrderPriority,
} from '@/lib/services/order';
import { resetPicking } from '@/lib/services/picking';
import { resetPacking } from '@/lib/services/packing';
import { resetQuality } from '@/lib/services/quality';
import { resetDispatch } from '@/lib/services/dispatch';
import { clearDecisionLog, recordDecision } from '@/lib/engine/decision';
import { calculatePriorityScore } from '@/lib/engine/priority';
import {
  DEMO_INVENTORY,
  DEMO_SCENARIOS,
  DEMO_CUSTOMERS,
} from '@/lib/seed-data';
import { DecisionType } from '@/lib/types';

export async function GET() {
  return NextResponse.json({
    success: true,
    scenarios: DEMO_SCENARIOS.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      orderCount: s.orders.length,
    })),
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const scenarioId = body.scenario_id || 'all';

    // 1. Reset all state
    resetInventory();
    resetOrders();
    resetPicking();
    resetPacking();
    resetQuality();
    resetDispatch();
    clearDecisionLog();

    // 2. Initialize baseline inventory
    initializeInventory(DEMO_INVENTORY);

    // 3. Load selected scenario or all scenarios
    const selectedScenarios = scenarioId === 'all'
      ? DEMO_SCENARIOS
      : DEMO_SCENARIOS.filter((s) => s.id === scenarioId);

    const createdOrdersList = [];

    for (const scenario of selectedScenarios) {
      for (const ordData of scenario.orders) {
        const cust = DEMO_CUSTOMERS.find((c) => c.id === ordData.customer_id) || DEMO_CUSTOMERS[0];
        const slaDeadline = ordData.sla_hours_from_now
          ? new Date(Date.now() + ordData.sla_hours_from_now * 3600 * 1000).toISOString()
          : new Date(Date.now() + (cust.sla_hours || 48) * 3600 * 1000).toISOString();

        const createdOrder = createOrder({
          customer_id: ordData.customer_id,
          warehouse_id: ordData.warehouse_id,
          channel: ordData.channel,
          items: ordData.items,
          notes: `[${scenario.name}] ${ordData.notes || ''}`,
          sla_deadline: slaDeadline,
        });

        // Compute priority score
        const score = calculatePriorityScore({
          sla_deadline: createdOrder.sla_deadline,
          order_value: createdOrder.total_value,
          created_at: createdOrder.created_at,
          customer_tier: cust.tier,
          channel: createdOrder.channel,
        });

        recordDecision({
          decision_type: DecisionType.ORDER_PRIORITIZATION,
          inputs: {
            order_number: createdOrder.order_number,
            customer_tier: cust.tier,
            sla_hours_window: ordData.sla_hours_from_now || cust.sla_hours,
            order_value: createdOrder.total_value,
          },
          priority_score: score,
          decision: `Priority Score ${score.toFixed(1)}/100`,
          reason: `Initial scoring for scenario '${scenario.name}'. Customer tier: ${cust.tier.toUpperCase()}, SLA: ${ordData.sla_hours_from_now || cust.sla_hours}h.`,
          affected_orders: [createdOrder.id],
          affected_items: {},
          recommended_action: score >= 70 ? 'Immediate prioritization' : 'Standard batching',
        });

        // Store score on order
        updateOrderPriority(createdOrder.id, Math.round(score));

        createdOrdersList.push(createdOrder);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Successfully seeded warehouse with scenario: ${scenarioId}`,
      ordersCreated: createdOrdersList.length,
      inventoryCount: DEMO_INVENTORY.length,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
