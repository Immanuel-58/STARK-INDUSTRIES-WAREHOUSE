import { NextResponse } from 'next/server';
import {
  createDispatch,
  updateDispatchStatus,
  getDispatches,
} from '@/lib/services/dispatch';
import { updateOrderStatus } from '@/lib/services/order';
import { OrderStatus, DispatchStatus } from '@/lib/types';
import { dispatchSchema } from '@/lib/validators';

export async function GET() {
  try {
    const dispatches = getDispatches();
    return NextResponse.json({ success: true, data: dispatches });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = dispatchSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ success: false, error: 'Validation failed', details: parsed.error.format() }, { status: 400 });
    }

    const dispatch = createDispatch(parsed.data.order_id, parsed.data.carrier);
    dispatch.tracking_number = parsed.data.tracking_number;
    updateOrderStatus(parsed.data.order_id, OrderStatus.DISPATCHED);

    return NextResponse.json({ success: true, data: dispatch });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { dispatch_id, status, tracking_number, order_id } = body;

    if (!dispatch_id || !status) {
      return NextResponse.json({ success: false, error: 'dispatch_id and status are required' }, { status: 400 });
    }

    const result = updateDispatchStatus(dispatch_id, status as DispatchStatus, tracking_number);
    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    if (status === DispatchStatus.DELIVERED && order_id) {
      updateOrderStatus(order_id, OrderStatus.COMPLETED);
    }

    return NextResponse.json({ success: true, data: result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
