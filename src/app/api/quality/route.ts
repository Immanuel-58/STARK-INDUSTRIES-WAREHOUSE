import { NextResponse } from 'next/server';
import {
  createQualityCheck,
  performQualityCheck,
  getQualityChecks,
} from '@/lib/services/quality';
import { updateOrderStatus } from '@/lib/services/order';
import { OrderStatus } from '@/lib/types';
import { qualityCheckSchema } from '@/lib/validators';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get('order_id') || undefined;
    const checks = getQualityChecks({ order_id: orderId });
    return NextResponse.json({ success: true, data: checks });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action } = body;

    if (action === 'create') {
      const { order_id, packing_task_id } = body;
      if (!order_id || !packing_task_id) {
        return NextResponse.json({ success: false, error: 'order_id and packing_task_id required' }, { status: 400 });
      }
      const qc = createQualityCheck(order_id, packing_task_id);
      updateOrderStatus(order_id, OrderStatus.QUALITY_CHECK);
      return NextResponse.json({ success: true, data: qc });
    }

    if (action === 'perform') {
      const { check_id, passed, notes, order_id } = body;
      if (!check_id || passed === undefined) {
        return NextResponse.json({ success: false, error: 'check_id and passed are required' }, { status: 400 });
      }
      const result = performQualityCheck(check_id, Boolean(passed), notes);
      if (order_id) {
        if (passed) {
          updateOrderStatus(order_id, OrderStatus.DISPATCHED);
        } else {
          updateOrderStatus(order_id, OrderStatus.EXCEPTION);
        }
      }
      return NextResponse.json({ success: true, data: result });
    }

    return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
