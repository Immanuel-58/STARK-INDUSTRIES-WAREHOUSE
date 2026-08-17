import { NextResponse } from 'next/server';
import { computeAnalytics } from '@/lib/services/analytics';
import { DEMO_PRODUCTS } from '@/lib/seed-data';

export async function GET() {
  try {
    const summary = computeAnalytics(DEMO_PRODUCTS);
    return NextResponse.json({ success: true, data: summary });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
