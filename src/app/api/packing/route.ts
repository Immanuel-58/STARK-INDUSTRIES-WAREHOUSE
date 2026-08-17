import { NextResponse } from 'next/server';
import {
  createPackingTask,
  updatePackingStatus,
  getPackingBacklog,
  getPackingTasks,
} from '@/lib/services/packing';
import { updateOrderStatus } from '@/lib/services/order';
import { OrderStatus, PackingStatus } from '@/lib/types';
import { packingTaskUpdateSchema } from '@/lib/validators';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const filter = searchParams.get('filter');
    const orderId = searchParams.get('order_id') || undefined;

    if (filter === 'backlog') {
      const backlog = getPackingBacklog();
      return NextResponse.json({ success: true, data: backlog });
    }

    const tasks = getPackingTasks({ order_id: orderId });
    return NextResponse.json({ success: true, data: tasks });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { order_id, picking_task_id } = body;

    if (!order_id || !picking_task_id) {
      return NextResponse.json({ success: false, error: 'order_id and picking_task_id are required' }, { status: 400 });
    }

    const task = createPackingTask(order_id, picking_task_id);
    updateOrderStatus(order_id, OrderStatus.PACKING);

    return NextResponse.json({ success: true, data: task });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const parsed = packingTaskUpdateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ success: false, error: 'Invalid payload', details: parsed.error.format() }, { status: 400 });
    }

    const result = updatePackingStatus(parsed.data.task_id, parsed.data.status);
    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true, data: result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
