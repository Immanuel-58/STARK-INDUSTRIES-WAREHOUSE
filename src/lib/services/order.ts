import { Order, OrderItem, OrderStatus, OrderChannel } from '@/lib/types';

let orderStore: Order[] = [];
let orderItemStore: OrderItem[] = [];

const VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.CREATED]: [OrderStatus.PRIORITY_SET, OrderStatus.CANCELLED],
  [OrderStatus.PRIORITY_SET]: [OrderStatus.INVENTORY_CHECKED, OrderStatus.CANCELLED],
  [OrderStatus.INVENTORY_CHECKED]: [OrderStatus.ALLOCATED, OrderStatus.EXCEPTION, OrderStatus.CANCELLED],
  [OrderStatus.ALLOCATED]: [OrderStatus.PICKING, OrderStatus.EXCEPTION, OrderStatus.CANCELLED],
  [OrderStatus.PICKING]: [OrderStatus.PACKING, OrderStatus.EXCEPTION],
  [OrderStatus.PACKING]: [OrderStatus.QUALITY_CHECK, OrderStatus.EXCEPTION],
  [OrderStatus.QUALITY_CHECK]: [OrderStatus.DISPATCHED, OrderStatus.EXCEPTION],
  [OrderStatus.DISPATCHED]: [OrderStatus.COMPLETED],
  [OrderStatus.COMPLETED]: [],
  [OrderStatus.CANCELLED]: [],
  [OrderStatus.EXCEPTION]: [OrderStatus.ALLOCATED, OrderStatus.PICKING, OrderStatus.CANCELLED],
};

let sequence = 0;

export function createOrder(data: { customer_id: string, warehouse_id: string, channel: OrderChannel, items: { product_id: string, quantity: number, unit_price: number }[], notes?: string, sla_deadline?: string }): Order {
  sequence++;
  const order_number = 'ORD-' + sequence.toString().padStart(6, '0');
  
  const created_at = new Date().toISOString();
  
  let sla_deadline = data.sla_deadline;
  if (!sla_deadline) {
    const deadline = new Date();
    deadline.setHours(deadline.getHours() + 48);
    sla_deadline = deadline.toISOString();
  }
  
  const order: Order = {
    id: crypto.randomUUID(),
    order_number,
    customer_id: data.customer_id,
    warehouse_id: data.warehouse_id,
    status: OrderStatus.CREATED,
    channel: data.channel,
    priority_score: 0,
    total_value: data.items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0),
    sla_deadline,
    notes: data.notes,
    created_at,
    updated_at: created_at
  };

  orderStore.push(order);

  data.items.forEach(item => {
    orderItemStore.push({
      id: crypto.randomUUID(),
      order_id: order.id,
      product_id: item.product_id,
      quantity: item.quantity,
      allocated_quantity: 0,
      picked_quantity: 0,
      unit_price: item.unit_price
    });
  });

  return order;
}

export function getOrder(id: string): Order | undefined {
  return orderStore.find(o => o.id === id);
}

export function getOrders(filters?: { status?: OrderStatus, warehouse_id?: string, customer_id?: string }): Order[] {
  let result = orderStore;
  if (filters) {
    if (filters.status) result = result.filter(o => o.status === filters.status);
    if (filters.warehouse_id) result = result.filter(o => o.warehouse_id === filters.warehouse_id);
    if (filters.customer_id) result = result.filter(o => o.customer_id === filters.customer_id);
  }
  return result;
}

export function getOrderItems(order_id: string): OrderItem[] {
  return orderItemStore.filter(i => i.order_id === order_id);
}

export function updateOrderStatus(order_id: string, new_status: OrderStatus): { success: boolean, error?: string } {
  const order = getOrder(order_id);
  if (!order) return { success: false, error: 'Order not found' };

  const validNextStatuses = VALID_TRANSITIONS[order.status] || [];
  if (!validNextStatuses.includes(new_status)) {
    return { success: false, error: `Invalid transition from ${order.status} to ${new_status}` };
  }

  order.status = new_status;
  order.updated_at = new Date().toISOString();
  return { success: true };
}

export function updateOrderPriority(order_id: string, priority_score: number): void {
  const order = getOrder(order_id);
  if (order) {
    order.priority_score = priority_score;
    order.updated_at = new Date().toISOString();
  }
}

export function updateOrderItemAllocation(order_item_id: string, allocated_quantity: number): void {
  const item = orderItemStore.find(i => i.id === order_item_id);
  if (item) {
    item.allocated_quantity = allocated_quantity;
  }
}

export function getOrdersByPriority(): Order[] {
  return [...orderStore].sort((a, b) => b.priority_score - a.priority_score);
}

export function getUrgentOrders(sla_hours_threshold: number = 24): Order[] {
  const now = new Date().getTime();
  const thresholdMs = sla_hours_threshold * 60 * 60 * 1000;
  
  return orderStore.filter(o => {
    if (!o.sla_deadline) return false;
    if ([OrderStatus.COMPLETED, OrderStatus.CANCELLED].includes(o.status)) return false;
    
    const deadline = new Date(o.sla_deadline).getTime();
    return (deadline - now) <= thresholdMs;
  });
}

export function resetOrders(): void {
  orderStore = [];
  orderItemStore = [];
  sequence = 0;
}
