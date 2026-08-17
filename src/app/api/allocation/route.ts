import { NextResponse } from 'next/server';
import { getOrder, getOrders, getOrderItems, updateOrderStatus, updateOrderItemAllocation } from '@/lib/services/order';
import { getInventory, reserveStock } from '@/lib/services/inventory';
import { resolveConflict, allocateInventory } from '@/lib/engine/allocation';
import { recordDecision } from '@/lib/engine/decision';
import { OrderStatus, DecisionType } from '@/lib/types';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const specificOrderId = body.order_id;

    // Gather candidate orders needing allocation
    const allOrders = getOrders();
    const targetOrders = specificOrderId
      ? allOrders.filter((o) => o.id === specificOrderId)
      : allOrders.filter((o) => o.status === OrderStatus.CREATED || o.status === OrderStatus.PRIORITY_SET || o.status === OrderStatus.INVENTORY_CHECKED);

    if (targetOrders.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No orders pending allocation',
        plans: [],
      });
    }

    // Build allocation requests with items and priority scores
    const allocationRequests = targetOrders.map((order) => {
      const items = getOrderItems(order.id);
      return {
        order_id: order.id,
        priority_score: order.priority_score || 50,
        items: items.map((it) => ({
          product_id: it.product_id,
          quantity: it.quantity - it.allocated_quantity,
        })),
      };
    });

    // Fetch current inventory pool
    const currentInventory = getInventory();
    const inventoryPool = currentInventory.map((inv) => ({
      inventory_id: inv.id,
      product_id: inv.product_id,
      available_quantity: inv.available_quantity,
      warehouse_id: inv.warehouse_id,
      location_id: inv.location_id,
    }));

    // Run the Decision Engine Conflict Resolution
    const { plans, decisions } = resolveConflict(allocationRequests, inventoryPool);

    // Apply allocations in transactional manner to services
    for (const plan of plans) {
      for (const alloc of plan.allocations) {
        if (alloc.allocated > 0) {
          for (const src of alloc.source_inventory) {
            reserveStock(src.inventory_id, src.quantity, `order-alloc-${plan.order_id}`);
          }
        }

        // Update item allocation count
        const orderItems = getOrderItems(plan.order_id);
        const matchedItem = orderItems.find((it) => it.product_id === alloc.product_id);
        if (matchedItem) {
          updateOrderItemAllocation(matchedItem.id, alloc.allocated);
        }
      }

      // Update Order State through valid lifecycle transitions
      const currentOrder = getOrder(plan.order_id);
      if (currentOrder) {
        if (currentOrder.status === OrderStatus.CREATED) {
          updateOrderStatus(plan.order_id, OrderStatus.PRIORITY_SET);
        }
        if (getOrder(plan.order_id)?.status === OrderStatus.PRIORITY_SET) {
          updateOrderStatus(plan.order_id, OrderStatus.INVENTORY_CHECKED);
        }
        if (plan.fully_allocated || plan.allocations.some((a) => a.allocated > 0)) {
          updateOrderStatus(plan.order_id, OrderStatus.ALLOCATED);
        } else {
          updateOrderStatus(plan.order_id, OrderStatus.EXCEPTION);
        }
      }

      // Record each plan decision
      for (const d of plan.decisions) {
        recordDecision(d);
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        plans,
        decisionsRecorded: decisions.length,
        summary: {
          totalProcessed: targetOrders.length,
          fullyAllocated: plans.filter((p) => p.fully_allocated).length,
          partialAllocated: plans.filter((p) => !p.fully_allocated && p.allocations.some((a) => a.allocated > 0)).length,
          shortages: plans.filter((p) => p.total_shortage > 0).length,
        },
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
