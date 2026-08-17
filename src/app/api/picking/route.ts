import { NextResponse } from 'next/server';
import {
  createPickingTask,
  getPickingTasks,
  updatePickingStatus,
  getPickingBacklog,
} from '@/lib/services/picking';
import { getOrder, updateOrderStatus } from '@/lib/services/order';
import { PickingStatus, OrderStatus } from '@/lib/types';
import { pickingTaskUpdateSchema } from '@/lib/validators';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const filter = searchParams.get('filter');
    const warehouseId = searchParams.get('warehouse_id') || undefined;

    if (filter === 'backlog') {
      const backlog = getPickingBacklog();
      return NextResponse.json({ success: true, data: backlog });
    }

    const tasks = getPickingTasks({ warehouse_id: warehouseId });
    return NextResponse.json({ success: true, data: tasks });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { order_id, location_sequence } = body;

    if (!order_id) {
      return NextResponse.json({ success: false, error: 'order_id is required' }, { status: 400 });
    }

    const order = getOrder(order_id);
    if (!order) {
      return NextResponse.json({ success: false, error: 'Order not found' }, { status: 404 });
    }

    const task = createPickingTask(order, location_sequence || ['loc-001', 'loc-002']);
    updateOrderStatus(order.id, OrderStatus.PICKING);

    return NextResponse.json({ success: true, data: task });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const parsed = pickingTaskUpdateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ success: false, error: 'Invalid payload', details: parsed.error.format() }, { status: 400 });
    }

    const result = updatePickingStatus(parsed.data.task_id, parsed.data.status);
    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true, data: result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
