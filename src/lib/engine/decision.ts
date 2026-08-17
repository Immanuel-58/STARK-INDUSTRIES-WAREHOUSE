import { DecisionEvent, DecisionType } from '@/lib/types';

let decisionLog: DecisionEvent[] = [];

export function recordDecision(decision: Omit<DecisionEvent, 'id' | 'created_at'>): DecisionEvent {
  const newDecision: DecisionEvent = {
    ...decision,
    id: crypto.randomUUID(),
    created_at: new Date().toISOString()
  };
  decisionLog.push(newDecision);
  return newDecision;
}

export function getDecisionLog(filters?: { decision_type?: DecisionType | string, order_id?: string, from?: string, to?: string }): DecisionEvent[] {
  let logs = decisionLog;

  if (filters) {
    if (filters.decision_type) {
      logs = logs.filter(log => log.decision_type === filters.decision_type);
    }
    if (filters.order_id) {
      logs = logs.filter(log => log.affected_orders.includes(filters.order_id!));
    }
    if (filters.from) {
      const fromTime = new Date(filters.from).getTime();
      logs = logs.filter(log => new Date(log.created_at).getTime() >= fromTime);
    }
    if (filters.to) {
      const toTime = new Date(filters.to).getTime();
      logs = logs.filter(log => new Date(log.created_at).getTime() <= toTime);
    }
  }

  return logs;
}

export function getDecisionChain(order_id: string): DecisionEvent[] {
  return decisionLog
    .filter(log => log.affected_orders.includes(order_id))
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
}

export function clearDecisionLog(): void {
  decisionLog = [];
}
