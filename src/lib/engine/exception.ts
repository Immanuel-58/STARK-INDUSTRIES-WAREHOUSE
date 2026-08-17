import { Order, Product, Inventory, AllocationResult, Exception, ExceptionType, ExceptionSeverity, Customer } from '@/lib/types';

export interface ExceptionContext {
  order?: Order;
  customer?: Customer;
  product?: Product;
  inventory?: Inventory;
  allocation_result?: AllocationResult;
}

export function detectExceptions(context: ExceptionContext): Omit<Exception, 'id' | 'created_at' | 'resolved_by' | 'resolved_at' | 'resolution'>[] {
  const exceptions: Omit<Exception, 'id' | 'created_at' | 'resolved_by' | 'resolved_at' | 'resolution'>[] = [];

  if (context.inventory && context.product) {
    if (context.inventory.available_quantity === 0) {
      exceptions.push({
        type: ExceptionType.OUT_OF_STOCK,
        title: `Product ${context.product.name} is out of stock`,
        description: `Inventory for ${context.product.name} is completely depleted.`,
        severity: classifySeverity(ExceptionType.OUT_OF_STOCK, context),
        product_id: context.product.id,
        inventory_id: context.inventory.id
      });
    } else if (context.inventory.available_quantity < (context.product.reorder_point || 0)) {
      exceptions.push({
        type: ExceptionType.LOW_STOCK,
        title: `Product ${context.product.name} is below reorder point`,
        description: `Available quantity is ${context.inventory.available_quantity}, reorder point is ${context.product.reorder_point}.`,
        severity: classifySeverity(ExceptionType.LOW_STOCK, context),
        product_id: context.product.id,
        inventory_id: context.inventory.id
      });
    }
    
    if (context.inventory.damaged_quantity && context.inventory.damaged_quantity > 0) {
      exceptions.push({
        type: ExceptionType.DAMAGED_ITEM,
        title: `Found ${context.inventory.damaged_quantity} damaged units of ${context.product.name}`,
        description: `Damaged units need to be processed.`,
        severity: classifySeverity(ExceptionType.DAMAGED_ITEM, context),
        product_id: context.product.id,
        inventory_id: context.inventory.id
      });
    }
  }

  if (context.order && context.allocation_result) {
    if (context.allocation_result.is_partial) {
      exceptions.push({
        type: ExceptionType.PARTIAL_ALLOCATION,
        title: `Order ${context.order.id} was partially allocated`,
        description: `Order could not be fully allocated.`,
        severity: classifySeverity(ExceptionType.PARTIAL_ALLOCATION, context),
        order_id: context.order.id,
        product_id: context.allocation_result.product_id
      });
    }
  }

  if (context.order && context.order.sla_deadline) {
    const deadline = new Date(context.order.sla_deadline).getTime();
    const hoursRemaining = (deadline - Date.now()) / (1000 * 60 * 60);
    if (hoursRemaining <= 24 && context.order.status !== 'DISPATCHED' && context.order.status !== 'COMPLETED') {
      exceptions.push({
        type: ExceptionType.SLA_RISK,
        title: `Order ${context.order.id} is at risk of missing SLA`,
        description: `Only ${Math.floor(hoursRemaining)} hours remaining until deadline.`,
        severity: classifySeverity(ExceptionType.SLA_RISK, context),
        order_id: context.order.id
      });
    }
  }

  return exceptions;
}

export function classifySeverity(type: ExceptionType, context: ExceptionContext): ExceptionSeverity {
  if (type === ExceptionType.OUT_OF_STOCK && context.order && context.order.priority_score >= 80) return ExceptionSeverity.CRITICAL;
  if (type === ExceptionType.SLA_RISK && context.customer && context.customer.tier === 'vip') return ExceptionSeverity.CRITICAL;
  if (type === ExceptionType.PARTIAL_ALLOCATION) return ExceptionSeverity.HIGH;
  if (type === ExceptionType.LOW_STOCK) return ExceptionSeverity.MEDIUM;
  if (type === ExceptionType.DAMAGED_ITEM) return ExceptionSeverity.LOW;
  
  return ExceptionSeverity.MEDIUM;
}

export function recommendResolution(exception: Omit<Exception, 'id'|'created_at'|'resolved_by'|'resolved_at'|'resolution'>): string {
  switch (exception.type) {
    case ExceptionType.OUT_OF_STOCK:
      return `Place emergency reorder for product ${exception.product_id}: 50 units recommended`;
    case ExceptionType.PARTIAL_ALLOCATION:
      return `Reallocate units from lower priority orders to fulfill order ${exception.order_id}`;
    case ExceptionType.LOW_STOCK:
      return `Trigger standard reorder process for product ${exception.product_id}`;
    case ExceptionType.DAMAGED_ITEM:
      return `Move inventory ${exception.inventory_id} to quarantine area and inspect`;
    case ExceptionType.SLA_RISK:
      return `Expedite picking and shipping for order ${exception.order_id}`;
    default:
      return 'Investigate manually and resolve';
  }
}
