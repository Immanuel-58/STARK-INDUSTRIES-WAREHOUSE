import { NextResponse } from 'next/server';
import { getDecisionLog, getDecisionChain } from '@/lib/engine/decision';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get('order_id');
    const decisionType = searchParams.get('type') || undefined;

    if (orderId) {
      const chain = getDecisionChain(orderId);
      return NextResponse.json({ success: true, data: chain });
    }

    const logs = getDecisionLog({ decision_type: decisionType });
    return NextResponse.json({ success: true, data: logs });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
