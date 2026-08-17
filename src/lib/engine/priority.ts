import {
  PriorityWeights,
  PriorityInputs,
  Order,
  OrderStatus,
  OrderChannel,
  OrderItem,
  Customer
} from '@/lib/types';

export const DEFAULT_WEIGHTS: PriorityWeights = {
  sla_urgency: 0.35,
  order_value: 0.25,
  order_age: 0.20,
  business_importance: 0.10,
  channel_priority: 0.10,
};

export type OrderWithDetails = Order & { items: OrderItem[], customer: Customer };

export function calculatePriorityScore(inputs: PriorityInputs, weights: PriorityWeights = DEFAULT_WEIGHTS, now: Date = new Date()): number {
  const current_time = now.getTime();
  
  const slaDate = new Date(inputs.sla_deadline).getTime();
  const hours_to_deadline = (slaDate - current_time) / (1000 * 60 * 60);

  const createdDate = new Date(inputs.created_at).getTime();
  const order_age_hours = (current_time - createdDate) / (1000 * 60 * 60);

  let sla_score = 0;
  if (hours_to_deadline <= 0) sla_score = 100;
  else if (hours_to_deadline >= 72) sla_score = 0;
  else {
    sla_score = Math.min(100, Math.pow((72 - hours_to_deadline) / 7.2, 2));
  }

  const max_value = 10000;
  const value_score = Math.min(100, ((inputs.order_value || 0) / max_value) * 100);

  const age_score = Math.min(100, (order_age_hours / 72) * 100);

  let biz_score = 40; 
  if (inputs.customer_tier === 'vip') biz_score = 100;
  else if (inputs.customer_tier === 'premium') biz_score = 70;

  let channel_score = 30; 
  if (inputs.channel === OrderChannel.WHOLESALE) channel_score = 90;
  else if (inputs.channel === OrderChannel.MARKETPLACE) channel_score = 70;
  else if (inputs.channel === OrderChannel.WEB) channel_score = 60;
  else if (inputs.channel === OrderChannel.MOBILE) channel_score = 50;

  const total = (
    sla_score * weights.sla_urgency +
    value_score * weights.order_value +
    age_score * weights.order_age +
    biz_score * weights.business_importance +
    channel_score * weights.channel_priority
  );

  return Math.min(100, Math.max(0, total));
}

export function classifyPriority(score: number): 'critical' | 'high' | 'medium' | 'low' {
  if (score >= 80) return 'critical';
  if (score >= 60) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}

export function rankOrders(orders: OrderWithDetails[]): OrderWithDetails[] {
  return [...orders].sort((a: any, b: any) => (b.priority_score || 0) - (a.priority_score || 0));
}

export function detectSLARisk(order: {sla_deadline: string, status: OrderStatus, created_at: string}, current_time: number = Date.now()): { at_risk: boolean, hours_remaining: number, risk_level: 'none'|'warning'|'critical' } {
  const deadline = new Date(order.sla_deadline).getTime();
  const hoursRemaining = (deadline - current_time) / (1000 * 60 * 60);
  
  if (hoursRemaining <= 12) {
    return { at_risk: true, hours_remaining: hoursRemaining, risk_level: 'critical' };
  } else if (hoursRemaining <= 24) {
    return { at_risk: true, hours_remaining: hoursRemaining, risk_level: 'warning' };
  }
  return { at_risk: false, hours_remaining: hoursRemaining, risk_level: 'none' };
}
