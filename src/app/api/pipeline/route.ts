import { NextResponse } from 'next/server';
import { getOrders, getOrder, updateOrderStatus } from '@/lib/services/order';
import { getPickingTasks, createPickingTask, updatePickingStatus } from '@/lib/services/picking';
import { getPackingTasks, createPackingTask, updatePackingStatus } from '@/lib/services/packing';
import { getQualityChecks, createQualityCheck, performQualityCheck } from '@/lib/services/quality';
import { createDispatch, updateDispatchStatus } from '@/lib/services/dispatch';
import { recordDecision } from '@/lib/engine/decision';
import {
  OrderStatus,
  PickingStatus,
  PackingStatus,
  DispatchStatus,
  DecisionType,
} from '@/lib/types';

export async function GET() {
  try {
    const orders = getOrders();
    const statusCounts: Record<string, number> = {};
    for (const o of orders) {
      statusCounts[o.status] = (statusCounts[o.status] || 0) + 1;
    }
    return NextResponse.json({
      success: true,
      data: {
        total: orders.length,
        stages: statusCounts,
        pipeline: [
          'CREATED', 'PRIORITY_SET', 'INVENTORY_CHECKED', 'ALLOCATED',
          'PICKING', 'PACKING', 'QUALITY_CHECK', 'DISPATCHED', 'COMPLETED',
        ].map(s => ({ stage: s, count: statusCounts[s] || 0 })),
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const targetOrderId: string | undefined = body.order_id;

    const allOrders = getOrders();
    const candidates = targetOrderId
      ? allOrders.filter(o => o.id === targetOrderId)
      : allOrders.filter(o => !['COMPLETED', 'CANCELLED', 'CREATED', 'PRIORITY_SET', 'INVENTORY_CHECKED', 'EXCEPTION'].includes(o.status));

    const results: Array<{ order_id: string; order_number: string; from: string; to: string; detail: string }> = [];

    for (const order of candidates) {
      switch (order.status) {
        case OrderStatus.ALLOCATED: {
          // Create picking task → move to PICKING
          const task = createPickingTask(order, ['loc-001', 'loc-002', 'loc-003']);
          updateOrderStatus(order.id, OrderStatus.PICKING);
          recordDecision({
            decision_type: DecisionType.PICKING_PRIORITIZATION,
            inputs: { order_id: order.id, priority_score: order.priority_score },
            priority_score: order.priority_score,
            decision: 'Picking task created',
            reason: `Order ${order.order_number} moved to picking with priority ${order.priority_score}`,
            affected_orders: [order.id],
            affected_items: {},
            recommended_action: order.priority_score >= 70 ? 'Fast-track picking' : 'Standard picking queue',
          });
          results.push({ order_id: order.id, order_number: order.order_number, from: 'ALLOCATED', to: 'PICKING', detail: `Picking task ${task.id.slice(0, 8)} created` });
          break;
        }

        case OrderStatus.PICKING: {
          // Complete picking → create packing task → move to PACKING
          const pickTasks = getPickingTasks();
          const task = pickTasks.find(t => t.order_id === order.id && t.status !== PickingStatus.PICKED);
          if (task) {
            updatePickingStatus(task.id, PickingStatus.PICKED);
            const packTask = createPackingTask(order.id, task.id);
            updateOrderStatus(order.id, OrderStatus.PACKING);
            results.push({ order_id: order.id, order_number: order.order_number, from: 'PICKING', to: 'PACKING', detail: `Pick complete, packing task ${packTask.id.slice(0, 8)} created` });
          }
          break;
        }

        case OrderStatus.PACKING: {
          // Complete packing → create QC check → move to QUALITY_CHECK
          const packTasks = getPackingTasks({ order_id: order.id });
          const task = packTasks.find(t => t.status !== PackingStatus.PACKED);
          if (task) {
            updatePackingStatus(task.id, PackingStatus.PACKED);
            const qc = createQualityCheck(order.id, task.id);
            updateOrderStatus(order.id, OrderStatus.QUALITY_CHECK);
            results.push({ order_id: order.id, order_number: order.order_number, from: 'PACKING', to: 'QUALITY_CHECK', detail: `Packed, QC check ${qc.id.slice(0, 8)} created` });
          }
          break;
        }

        case OrderStatus.QUALITY_CHECK: {
          // Pass QC → create dispatch → move to DISPATCHED
          const checks = getQualityChecks({ order_id: order.id });
          const check = checks.find(c => c.status === 'PENDING');
          if (check) {
            performQualityCheck(check.id, true, 'All items verified — passed automated inspection');
            const carriers = ['FedEx Express', 'UPS Ground', 'DHL Worldwide', 'USPS Priority'];
            const carrier = carriers[Math.floor(Math.random() * carriers.length)];
            const tracking = `TRK-${Date.now().toString(36).toUpperCase()}`;
            const dispatch = createDispatch(order.id, carrier);
            dispatch.tracking_number = tracking;
            updateOrderStatus(order.id, OrderStatus.DISPATCHED);
            results.push({ order_id: order.id, order_number: order.order_number, from: 'QUALITY_CHECK', to: 'DISPATCHED', detail: `QC passed, dispatched via ${carrier} (${tracking})` });
          }
          break;
        }

        case OrderStatus.DISPATCHED: {
          // Mark delivered → move to COMPLETED
          updateOrderStatus(order.id, OrderStatus.COMPLETED);
          results.push({ order_id: order.id, order_number: order.order_number, from: 'DISPATCHED', to: 'COMPLETED', detail: 'Delivery confirmed' });
          break;
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        advanced: results.length,
        results,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
