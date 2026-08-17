import { NextResponse } from 'next/server';
import {
  getInventory,
  getAvailableStock,
  reserveStock,
  releaseReservation,
  markDamaged,
  markQuarantined,
  adjustStock,
  getMovementHistory,
  getLowStockProducts,
  getOutOfStockProducts,
} from '@/lib/services/inventory';
import { DEMO_PRODUCTS } from '@/lib/seed-data';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const productId = searchParams.get('product_id') || undefined;
    const warehouseId = searchParams.get('warehouse_id') || undefined;
    const type = searchParams.get('type');

    if (type === 'low_stock') {
      const lowStock = getLowStockProducts(DEMO_PRODUCTS);
      return NextResponse.json({ success: true, data: lowStock });
    }

    if (type === 'out_of_stock') {
      const outOfStock = getOutOfStockProducts(DEMO_PRODUCTS);
      return NextResponse.json({ success: true, data: outOfStock });
    }

    if (type === 'movements') {
      const movements = getMovementHistory(undefined, productId);
      return NextResponse.json({ success: true, data: movements });
    }

    const items = getInventory({ product_id: productId, warehouse_id: warehouseId });
    return NextResponse.json({ success: true, data: items });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, inventory_id, quantity, reference_id, reason } = body;

    if (!inventory_id || quantity === undefined) {
      return NextResponse.json({ success: false, error: 'inventory_id and quantity are required' }, { status: 400 });
    }

    let result;
    switch (action) {
      case 'reserve':
        result = reserveStock(inventory_id, Number(quantity), reference_id || 'manual-reservation');
        break;
      case 'release':
        result = releaseReservation(inventory_id, Number(quantity), reference_id || 'manual-release');
        break;
      case 'damage':
        result = markDamaged(inventory_id, Number(quantity), reason || 'Reported damaged');
        break;
      case 'quarantine':
        result = markQuarantined(inventory_id, Number(quantity), reason || 'Quality quarantine');
        break;
      case 'adjust':
        result = adjustStock(inventory_id, Number(quantity), reason || 'Inventory adjustment');
        break;
      default:
        return NextResponse.json({ success: false, error: `Invalid action: ${action}` }, { status: 400 });
    }

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true, data: result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
