import { NextResponse } from 'next/server';
import {
  getInventory,
} from '@/lib/services/inventory';
import {
  getOrders,
  getOrderItems,
} from '@/lib/services/order';
import {
  resolveConflict,
} from '@/lib/engine/allocation';
import {
  calculatePriorityScore,
} from '@/lib/engine/priority';
import {
  DEMO_PRODUCTS,
  DEMO_CUSTOMERS,
} from '@/lib/seed-data';
import { OrderChannel, SimulationResult } from '@/lib/types';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { scenario_type, orders: simOrders, damaged_stock } = body;

    // Snapshot "BEFORE" state
    const beforeInventory = getInventory().map((i) => ({ ...i }));
    const beforeOrders = getOrders().map((o) => ({ ...o }));

    // Prepare simulated inventory sandbox (does not modify real state)
    const simInventory = beforeInventory.map((i) => ({
      inventory_id: i.id,
      product_id: i.product_id,
      available_quantity: i.available_quantity,
      warehouse_id: i.warehouse_id,
      location_id: i.location_id,
    }));

    // Inject simulated damage if present
    if (damaged_stock && Array.isArray(damaged_stock)) {
      for (const d of damaged_stock) {
        const pool = simInventory.find((p) => p.inventory_id === d.inventory_id || p.product_id === d.product_id);
        if (pool) {
          pool.available_quantity = Math.max(0, pool.available_quantity - Number(d.quantity));
        }
      }
    }

    // Prepare simulated orders list
    const incomingOrders = simOrders && Array.isArray(simOrders) ? simOrders : [];
    const requests = incomingOrders.map((ord: any, idx: number) => {
      const cust = DEMO_CUSTOMERS.find((c) => c.id === ord.customer_id) || DEMO_CUSTOMERS[0];
      const totalVal = (ord.items || []).reduce((s: number, it: any) => s + (it.quantity * (it.unit_price || 100)), 0);
      const score = calculatePriorityScore({
        sla_deadline: ord.sla_deadline || new Date(Date.now() + (cust.sla_hours || 48) * 3600 * 1000).toISOString(),
        order_value: totalVal,
        created_at: new Date().toISOString(),
        customer_tier: cust.tier,
        channel: ord.channel || OrderChannel.WEB,
      });

      return {
        order_id: ord.id || `SIM-ORD-${idx + 1}`,
        priority_score: score,
        items: (ord.items || []).map((it: any) => ({
          product_id: it.product_id,
          quantity: it.quantity,
        })),
      };
    });

    // Run pure allocation on sandbox
    const { plans, decisions } = resolveConflict(requests, simInventory);

    const simulationResult: SimulationResult = {
      scenario_id: scenario_type || 'custom-simulation',
      before_state: {
        total_orders: beforeOrders.length,
        available_inventory: beforeInventory.reduce((s, i) => s + i.available_quantity, 0),
      },
      after_state: {
        simulated_orders: requests.length,
        plans,
        remaining_inventory: simInventory.reduce((s, i) => s + i.available_quantity, 0),
      },
      decisions: decisions as any,
      exceptions: plans.flatMap((p) => p.exceptions) as any,
      recommendations: [
        ...plans.filter((p) => !p.fully_allocated).map((p) => `Reallocate stock or trigger emergency PO for order ${p.order_id} (shortage: ${p.total_shortage} units)`),
        ...(plans.every((p) => p.fully_allocated) ? ['All simulated orders fully satisfied with existing warehouse capacity.'] : []),
      ],
    };

    return NextResponse.json({ success: true, data: simulationResult });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
