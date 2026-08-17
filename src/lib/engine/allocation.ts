import { DecisionEvent, Exception, AllocationResult, DecisionType, ExceptionType, ExceptionSeverity } from '@/lib/types';

export interface AllocationRequest {
  order_id: string;
  items: { product_id: string; quantity: number }[];
  priority_score: number;
}

export interface InventoryPool {
  inventory_id: string;
  product_id: string;
  available_quantity: number;
  warehouse_id: string;
  location_id: string;
}

export interface AllocationPlan {
  order_id: string;
  allocations: AllocationResult[];
  fully_allocated: boolean;
  total_shortage: number;
  decisions: Omit<DecisionEvent, 'id' | 'created_at'>[];
  exceptions: Omit<Exception, 'id' | 'created_at' | 'resolved_by' | 'resolved_at' | 'resolution'>[];
}

export function allocateInventory(request: AllocationRequest, inventory: InventoryPool[]): AllocationPlan {
  const allocations: AllocationResult[] = [];
  const decisions: Omit<DecisionEvent, 'id' | 'created_at'>[] = [];
  const exceptions: Omit<Exception, 'id' | 'created_at' | 'resolved_by' | 'resolved_at' | 'resolution'>[] = [];
  
  let fully_allocated = true;
  let total_shortage = 0;

  for (const item of request.items) {
    const pools = inventory.filter(inv => inv.product_id === item.product_id && inv.available_quantity > 0);
    let remainingToAllocate = item.quantity;
    const source_inventory: { inventory_id: string; quantity: number }[] = [];

    for (const pool of pools) {
      if (remainingToAllocate <= 0) break;
      
      const allocateQty = Math.min(pool.available_quantity, remainingToAllocate);
      pool.available_quantity -= allocateQty;
      remainingToAllocate -= allocateQty;

      source_inventory.push({ inventory_id: pool.inventory_id, quantity: allocateQty });

      decisions.push({
        decision_type: DecisionType.INVENTORY_ALLOCATION,
        inputs: { product_id: item.product_id, quantity: allocateQty, inventory_id: pool.inventory_id },
        priority_score: request.priority_score,
        decision: `Allocated ${allocateQty}`,
        reason: `Allocated ${allocateQty} of ${item.product_id} from ${pool.location_id}`,
        affected_orders: [request.order_id],
        affected_items: { [item.product_id]: allocateQty }
      });
    }

    const allocated = item.quantity - remainingToAllocate;
    const is_partial = allocated > 0 && remainingToAllocate > 0;

    allocations.push({
      order_id: request.order_id,
      product_id: item.product_id,
      requested: item.quantity,
      allocated,
      is_partial,
      shortage: remainingToAllocate,
      source_inventory
    });

    if (remainingToAllocate > 0) {
      fully_allocated = false;
      total_shortage += remainingToAllocate;
      
      const type = remainingToAllocate === item.quantity ? ExceptionType.OUT_OF_STOCK : ExceptionType.PARTIAL_ALLOCATION;
      exceptions.push({
        type: type,
        title: `Missing ${remainingToAllocate} units of ${item.product_id} for order ${request.order_id}`,
        description: `Failed to allocate ${remainingToAllocate} units of product ${item.product_id}.`,
        severity: type === ExceptionType.OUT_OF_STOCK ? ExceptionSeverity.HIGH : ExceptionSeverity.MEDIUM,
        order_id: request.order_id,
        product_id: item.product_id
      });
    }
  }

  return { order_id: request.order_id, allocations, fully_allocated, total_shortage, decisions, exceptions };
}

export function resolveConflict(requests: AllocationRequest[], inventory: InventoryPool[]): { plans: AllocationPlan[], decisions: Omit<DecisionEvent, 'id'|'created_at'>[] } {
  const sortedRequests = [...requests].sort((a, b) => b.priority_score - a.priority_score);
  const clonedInventory = inventory.map(inv => ({ ...inv }));
  
  const plans: AllocationPlan[] = [];
  const decisions: Omit<DecisionEvent, 'id'|'created_at'>[] = [];

  for (const req of sortedRequests) {
    const plan = allocateInventory(req, clonedInventory);
    plans.push(plan);
    decisions.push(...plan.decisions);
  }

  return { plans, decisions };
}

export function calculateReorderRecommendation(product_id: string, current_stock: number, reorder_point: number, reorder_quantity: number, pending_orders: number): { should_reorder: boolean, recommended_quantity: number, reason: string } {
  const effective_stock = current_stock - pending_orders;
  if (effective_stock <= reorder_point) {
    const deficit = reorder_point - effective_stock;
    const recommended_quantity = Math.max(reorder_quantity, deficit);
    return { should_reorder: true, recommended_quantity, reason: `Effective stock (${effective_stock}) is below reorder point (${reorder_point})` };
  }
  return { should_reorder: false, recommended_quantity: 0, reason: `Effective stock (${effective_stock}) is sufficient` };
}
