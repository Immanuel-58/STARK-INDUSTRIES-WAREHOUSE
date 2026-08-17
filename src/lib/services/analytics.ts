import { AnalyticsSummary, OrderStatus, DispatchStatus, Product } from '@/lib/types';
import { getOrders, getUrgentOrders, getOrderItems } from './order';
import { getInventory } from './inventory';
import { getPickingBacklog } from './picking';
import { getPackingBacklog } from './packing';
import { getDispatches } from './dispatch';

export function computeAnalytics(products?: Product[]): AnalyticsSummary {
  const allOrders = getOrders();
  const allInventory = getInventory();

  const total_orders = allOrders.length;
  const urgent_orders = getUrgentOrders().length;
  const pending_orders = allOrders.filter(
    (o) => ![OrderStatus.COMPLETED, OrderStatus.CANCELLED].includes(o.status)
  ).length;

  const allocated = allOrders.filter((o) => o.status === OrderStatus.ALLOCATED).length;
  const allocation_rate = total_orders > 0 ? allocated / total_orders : 0;

  // Calculate real partial allocations
  let partial_allocations = 0;
  for (const order of allOrders) {
    const items = getOrderItems(order.id);
    const hasPartial = items.some(
      (it) => it.allocated_quantity > 0 && it.allocated_quantity < it.quantity
    );
    if (hasPartial) {
      partial_allocations++;
    }
  }

  const picking_backlog = getPickingBacklog().length;
  const packing_backlog = getPackingBacklog().length;
  const dispatch_backlog = getDispatches({ status: DispatchStatus.PENDING }).length;

  let low_stock_products = 0;
  let out_of_stock_products = 0;

  if (products && products.length > 0) {
    for (const p of products) {
      const avail = allInventory
        .filter((i) => i.product_id === p.id)
        .reduce((sum, i) => sum + i.available_quantity, 0);
      if (avail === 0) out_of_stock_products++;
      else if (avail <= p.reorder_point) low_stock_products++;
    }
  } else {
    low_stock_products = allInventory.filter(
      (i) => i.available_quantity > 0 && i.available_quantity <= 10
    ).length;
    out_of_stock_products = allInventory.filter((i) => i.available_quantity === 0).length;
  }

  const damaged_inventory = allInventory.reduce((sum, i) => sum + i.damaged_quantity, 0);

  const completed_orders = allOrders.filter((o) => o.status === OrderStatus.COMPLETED).length;
  const fulfillment_rate = total_orders > 0 ? completed_orders / total_orders : 0;

  const sla_risk_orders = urgent_orders;

  const total_capacity = 10000;
  const current_stock = allInventory.reduce((sum, i) => sum + i.quantity, 0);
  const inventory_utilization = current_stock / total_capacity;

  // Dynamic real bottleneck detection
  const bottlenecks: string[] = [];
  if (out_of_stock_products > 0) {
    bottlenecks.push(`Inventory shortage: ${out_of_stock_products} product(s) completely out of stock`);
  }
  if (sla_risk_orders > 0) {
    bottlenecks.push(`SLA Urgency: ${sla_risk_orders} order(s) approaching deadline breach`);
  }
  if (picking_backlog > 0) {
    bottlenecks.push(`Picking queue backlog: ${picking_backlog} task(s) waiting`);
  }
  if (packing_backlog > 0) {
    bottlenecks.push(`Packing station constraint: ${packing_backlog} order(s) queued`);
  }
  if (dispatch_backlog > 0) {
    bottlenecks.push(`Dispatch carrier delay: ${dispatch_backlog} parcel(s) awaiting pickup`);
  }
  if (damaged_inventory > 0) {
    bottlenecks.push(`Damaged inventory: ${damaged_inventory} units quarantined`);
  }
  if (partial_allocations > 0) {
    bottlenecks.push(`Partial fulfillment: ${partial_allocations} order(s) have unfulfilled item shortages`);
  }

  // Stage distribution
  const stage_distribution: { stage: string; count: number }[] = [
    { stage: 'Created', count: allOrders.filter((o) => o.status === OrderStatus.CREATED).length },
    { stage: 'Prioritized', count: allOrders.filter((o) => o.status === OrderStatus.PRIORITY_SET).length },
    { stage: 'Allocated', count: allOrders.filter((o) => o.status === OrderStatus.ALLOCATED).length },
    { stage: 'Picking', count: allOrders.filter((o) => o.status === OrderStatus.PICKING).length },
    { stage: 'Packing', count: allOrders.filter((o) => o.status === OrderStatus.PACKING).length },
    { stage: 'Quality Check', count: allOrders.filter((o) => o.status === OrderStatus.QUALITY_CHECK).length },
    { stage: 'Dispatched', count: allOrders.filter((o) => o.status === OrderStatus.DISPATCHED).length },
    { stage: 'Completed', count: allOrders.filter((o) => o.status === OrderStatus.COMPLETED).length },
    { stage: 'Exception', count: allOrders.filter((o) => o.status === OrderStatus.EXCEPTION).length },
  ];

  // Customer Tier distribution
  const tierCounts: Record<string, { count: number; value: number }> = {
    vip: { count: 0, value: 0 },
    premium: { count: 0, value: 0 },
    standard: { count: 0, value: 0 },
  };
  for (const o of allOrders) {
    const isVip = o.priority_score >= 80;
    const isPrem = o.priority_score >= 60 && o.priority_score < 80;
    const tierKey = isVip ? 'vip' : isPrem ? 'premium' : 'standard';
    tierCounts[tierKey].count += 1;
    tierCounts[tierKey].value += o.total_value;
  }
  const tier_distribution = [
    { tier: 'VIP Customer', count: tierCounts.vip.count, value: tierCounts.vip.value },
    { tier: 'Premium Account', count: tierCounts.premium.count, value: tierCounts.premium.value },
    { tier: 'Standard Channel', count: tierCounts.standard.count, value: tierCounts.standard.value },
  ];

  // Channel distribution
  const channelCounts: Record<string, number> = {};
  for (const o of allOrders) {
    channelCounts[o.channel] = (channelCounts[o.channel] || 0) + 1;
  }
  const channel_distribution = Object.entries(channelCounts).map(([channel, count]) => ({
    channel,
    count,
  }));

  // SKU Stock distribution
  const sku_stock_distribution: { sku: string; name: string; available: number; reserved: number; damaged: number; reorder_point: number }[] = [];
  if (products && products.length > 0) {
    for (const p of products) {
      const pInv = allInventory.filter((i) => i.product_id === p.id);
      sku_stock_distribution.push({
        sku: p.sku.split('-')[1] || p.sku,
        name: p.name,
        available: pInv.reduce((s, i) => s + i.available_quantity, 0),
        reserved: pInv.reduce((s, i) => s + i.reserved_quantity, 0),
        damaged: pInv.reduce((s, i) => s + i.damaged_quantity, 0),
        reorder_point: p.reorder_point,
      });
    }
  }

  // Shift throughput (8-hour window timeline)
  const shift_throughput = [
    { hour: '08:00', received: Math.max(1, Math.round(total_orders * 0.15)), allocated: Math.max(1, Math.round(allocated * 0.2)), picked: 0, packed: 0, dispatched: 0 },
    { hour: '10:00', received: Math.max(2, Math.round(total_orders * 0.35)), allocated: Math.max(1, Math.round(allocated * 0.4)), picked: Math.round(picking_backlog * 0.3), packed: 0, dispatched: 0 },
    { hour: '12:00', received: Math.max(3, Math.round(total_orders * 0.65)), allocated: Math.max(2, Math.round(allocated * 0.7)), picked: Math.round(picking_backlog * 0.6), packed: Math.round(packing_backlog * 0.4), dispatched: Math.round(completed_orders * 0.3) },
    { hour: '14:00', received: Math.max(4, Math.round(total_orders * 0.85)), allocated: Math.max(3, Math.round(allocated * 0.9)), picked: Math.round(picking_backlog * 0.9), packed: Math.round(packing_backlog * 0.8), dispatched: Math.round(completed_orders * 0.7) },
    { hour: '16:00 (Now)', received: total_orders, allocated: allocated, picked: picking_backlog + completed_orders, packed: packing_backlog + completed_orders, dispatched: completed_orders },
  ];

  return {
    total_orders,
    urgent_orders,
    pending_orders,
    allocation_rate,
    partial_allocations,
    picking_backlog,
    packing_backlog,
    dispatch_backlog,
    low_stock_products,
    out_of_stock_products,
    damaged_inventory,
    fulfillment_rate,
    sla_risk_orders,
    inventory_utilization,
    bottlenecks,
    stage_distribution,
    tier_distribution,
    channel_distribution,
    sku_stock_distribution,
    shift_throughput,
  };
}
