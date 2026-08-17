import { NextResponse } from 'next/server';
import {
  createOrder,
  getOrders,
  getOrder,
  getOrderItems,
  updateOrderStatus,
  getOrdersByPriority,
  getUrgentOrders,
} from '@/lib/services/order';
import { calculatePriorityScore, detectSLARisk } from '@/lib/engine/priority';
import { recordDecision } from '@/lib/engine/decision';
import { OrderStatus, DecisionType } from '@/lib/types';
import { createOrderSchema, updateOrderStatusSchema } from '@/lib/validators';
import { DEMO_CUSTOMERS } from '@/lib/seed-data';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get('id');
    const filter = searchParams.get('filter');

    if (orderId) {
      const order = getOrder(orderId);
      if (!order) {
        return NextResponse.json({ success: false, error: 'Order not found' }, { status: 404 });
      }
      const items = getOrderItems(orderId);
      const risk = detectSLARisk(order);
      return NextResponse.json({ success: true, data: { ...order, items, sla_risk: risk } });
    }

    if (filter === 'priority') {
      const orders = getOrdersByPriority();
      return NextResponse.json({ success: true, data: orders });
    }

    if (filter === 'urgent') {
      const urgent = getUrgentOrders();
      return NextResponse.json({ success: true, data: urgent });
    }

    const orders = getOrders();
    const ordersWithDetails = orders.map((o) => ({
      ...o,
      items: getOrderItems(o.id),
      sla_risk: detectSLARisk(o),
    }));

    return NextResponse.json({ success: true, data: ordersWithDetails });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = createOrderSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: parsed.error.format() },
        { status: 400 }
      );
    }

    const newOrder = createOrder(parsed.data);

    // Calculate initial Priority Score via Decision Engine
    const customer = DEMO_CUSTOMERS.find((c) => c.id === newOrder.customer_id);
    const score = calculatePriorityScore({
      sla_deadline: newOrder.sla_deadline,
      order_value: newOrder.total_value,
      created_at: newOrder.created_at,
      customer_tier: customer?.tier || 'standard',
      channel: newOrder.channel,
    });

    // Record decision audit trail
    recordDecision({
      decision_type: DecisionType.ORDER_PRIORITIZATION,
      inputs: {
        order_number: newOrder.order_number,
        total_value: newOrder.total_value,
        sla_deadline: newOrder.sla_deadline,
        customer_tier: customer?.tier || 'standard',
        channel: newOrder.channel,
      },
      priority_score: score,
      decision: `Calculated Priority Score ${score.toFixed(1)}/100`,
      reason: `Prioritized based on SLA deadline (${customer?.sla_hours || 48}h SLA window), customer tier (${customer?.tier || 'standard'}), and order value ($${newOrder.total_value.toFixed(2)})`,
      affected_orders: [newOrder.id],
      affected_items: {},
      recommended_action: score > 70 ? 'Expedite inventory allocation and fast-track picking' : 'Queue for standard allocation batch',
    });

    return NextResponse.json({ success: true, data: newOrder });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const parsed = updateOrderStatusSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid payload', details: parsed.error.format() },
        { status: 400 }
      );
    }

    const result = updateOrderStatus(parsed.data.order_id, parsed.data.status);
    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true, data: { order_id: parsed.data.order_id, status: parsed.data.status } });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
