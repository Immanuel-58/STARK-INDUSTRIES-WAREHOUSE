import { NextResponse } from 'next/server';
import { getDecisionChain, getDecisionLog } from '@/lib/engine/decision';
import { getOrder, getOrderItems, getOrders } from '@/lib/services/order';
import { detectSLARisk } from '@/lib/engine/priority';
import { recommendResolution } from '@/lib/engine/exception';
import { DEMO_CUSTOMERS, DEMO_PRODUCTS } from '@/lib/seed-data';
import {
  DecisionType,
  DecisionEvent,
  OrderStatus,
  ExceptionType,
  ExceptionSeverity,
} from '@/lib/types';
import type {
  GraphNode,
  GraphEdge,
  GraphNodeType,
  GraphNodeStatus,
  DecisionGraphData,
} from '@/components/decision-graph/graphTypes';

// ─── Transform decision events into an interactive graph ────────────────────

function mapDecisionTypeToNodeType(dt: DecisionType): GraphNodeType {
  switch (dt) {
    case DecisionType.ORDER_PRIORITIZATION:
      return 'priority_evaluation';
    case DecisionType.INVENTORY_ALLOCATION:
      return 'allocation';
    case DecisionType.PARTIAL_ALLOCATION:
      return 'allocation';
    case DecisionType.REALLOCATION:
      return 'conflict_resolution';
    case DecisionType.REORDER_RECOMMENDATION:
      return 'reorder_recommendation';
    case DecisionType.PICKING_PRIORITIZATION:
      return 'pipeline_stage';
    case DecisionType.EXCEPTION_SEVERITY:
      return 'exception';
    case DecisionType.SLA_RISK_DETECTION:
      return 'sla_risk';
    default:
      return 'pipeline_stage';
  }
}

function decisionStatus(event: DecisionEvent): GraphNodeStatus {
  const d = event.decision.toLowerCase();
  const r = event.reason.toLowerCase();
  if (r.includes('out of stock') || r.includes('failed') || d.includes('exception'))
    return 'error';
  if (r.includes('partial') || r.includes('shortage') || r.includes('risk') || r.includes('below'))
    return 'warning';
  if (d.includes('allocated') || d.includes('created') || d.includes('passed') || d.includes('complete'))
    return 'success';
  return 'info';
}

function buildOrderGraph(orderId: string): DecisionGraphData | null {
  const order = getOrder(orderId);
  if (!order) return null;

  const items = getOrderItems(orderId);
  const chain = getDecisionChain(orderId);
  const customer = DEMO_CUSTOMERS.find((c) => c.id === order.customer_id);

  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const exceptions: DecisionGraphData['exceptions'] = [];
  const recommendations: string[] = [];

  // ── ROOT: Order Created ──────────────────────────────────────────────────
  const rootId = `node-order-${orderId}`;
  nodes.push({
    id: rootId,
    type: 'order_created',
    label: order.order_number,
    subtitle: `${customer?.name || 'Unknown'} · ${order.channel}`,
    status: 'info',
    timestamp: order.created_at,
    score: order.priority_score,
    decision: `Order created — ${items.length} line item(s)`,
    reason: `Total value: $${order.total_value.toFixed(2)} | Channel: ${order.channel} | Tier: ${customer?.tier || 'standard'}`,
    inputs: {
      customer_id: order.customer_id,
      customer_tier: customer?.tier,
      channel: order.channel,
      total_value: order.total_value,
    },
    outputs: { status: order.status, items_count: items.length },
    metadata: { order_id: orderId },
    layer: 0,
  });

  // ── PRIORITY EVALUATION ──────────────────────────────────────────────────
  const priorityId = `node-priority-${orderId}`;
  const prioDecisions = chain.filter(
    (d) => d.decision_type === DecisionType.ORDER_PRIORITIZATION
  );

  const priorityLabel = prioDecisions.length > 0
    ? prioDecisions[0].decision
    : `Priority: ${order.priority_score.toFixed(1)}`;

  nodes.push({
    id: priorityId,
    type: 'priority_evaluation',
    label: 'Priority Evaluation',
    subtitle: priorityLabel,
    status: order.priority_score >= 80 ? 'error' : order.priority_score >= 60 ? 'warning' : 'success',
    decisionType: DecisionType.ORDER_PRIORITIZATION,
    timestamp: prioDecisions[0]?.created_at || order.created_at,
    score: order.priority_score,
    decision: priorityLabel,
    reason: prioDecisions[0]?.reason || `Composite score based on SLA urgency, value, age, tier, and channel`,
    inputs: prioDecisions[0]?.inputs || { priority_score: order.priority_score },
    outputs: { priority_score: order.priority_score, classification: order.priority_score >= 80 ? 'critical' : order.priority_score >= 60 ? 'high' : order.priority_score >= 40 ? 'medium' : 'low' },
    metadata: prioDecisions.length > 0 ? { event_id: prioDecisions[0].id } : undefined,
    layer: 1,
  });

  edges.push({
    id: `edge-${rootId}-${priorityId}`,
    source: rootId,
    target: priorityId,
    label: 'Prioritize',
    type: 'normal',
  });

  // ── SLA RISK CHECK ───────────────────────────────────────────────────────
  const slaRisk = detectSLARisk(order);
  const slaId = `node-sla-${orderId}`;
  const slaDecisions = chain.filter(
    (d) => d.decision_type === DecisionType.SLA_RISK_DETECTION
  );

  nodes.push({
    id: slaId,
    type: 'sla_risk',
    label: 'SLA Risk Assessment',
    subtitle: slaRisk.at_risk
      ? `⚠ ${slaRisk.hours_remaining.toFixed(1)}h remaining`
      : `✓ ${slaRisk.hours_remaining.toFixed(1)}h remaining`,
    status: slaRisk.risk_level === 'critical' ? 'error' : slaRisk.risk_level === 'warning' ? 'warning' : 'success',
    decisionType: DecisionType.SLA_RISK_DETECTION,
    timestamp: slaDecisions[0]?.created_at,
    score: slaRisk.hours_remaining,
    decision: slaRisk.at_risk ? `SLA at risk — ${slaRisk.risk_level}` : 'SLA on track',
    reason: `Deadline: ${new Date(order.sla_deadline).toLocaleString()} | ${slaRisk.hours_remaining.toFixed(1)} hours remaining`,
    inputs: { sla_deadline: order.sla_deadline, current_status: order.status },
    outputs: { at_risk: slaRisk.at_risk, risk_level: slaRisk.risk_level, hours_remaining: slaRisk.hours_remaining },
    layer: 2,
  });

  edges.push({
    id: `edge-${priorityId}-${slaId}`,
    source: priorityId,
    target: slaId,
    label: 'SLA Check',
    type: 'normal',
  });

  if (slaRisk.at_risk) {
    exceptions.push({
      type: ExceptionType.SLA_RISK,
      severity: slaRisk.risk_level === 'critical' ? ExceptionSeverity.CRITICAL : ExceptionSeverity.HIGH,
      title: `SLA risk for ${order.order_number}`,
      description: `Only ${slaRisk.hours_remaining.toFixed(1)} hours until deadline`,
    });
    recommendations.push(`Expedite processing for order ${order.order_number}`);
  }

  // ── INVENTORY CHECK ──────────────────────────────────────────────────────
  const invCheckId = `node-invcheck-${orderId}`;
  nodes.push({
    id: invCheckId,
    type: 'inventory_check',
    label: 'Inventory Check',
    subtitle: `${items.length} SKU(s) to verify`,
    status: [OrderStatus.ALLOCATED, OrderStatus.PICKING, OrderStatus.PACKING, OrderStatus.QUALITY_CHECK, OrderStatus.DISPATCHED, OrderStatus.COMPLETED].includes(order.status) ? 'success' : 'neutral',
    timestamp: order.updated_at,
    decision: 'Check inventory availability for all line items',
    reason: items.map((i) => {
      const prod = DEMO_PRODUCTS.find((p) => p.id === i.product_id);
      return `${prod?.name || i.product_id}: need ${i.quantity}, allocated ${i.allocated_quantity}`;
    }).join(' | '),
    inputs: { items: items.map((i) => ({ product_id: i.product_id, quantity: i.quantity })) },
    outputs: { items_checked: items.length },
    layer: 2,
  });

  edges.push({
    id: `edge-${priorityId}-${invCheckId}`,
    source: priorityId,
    target: invCheckId,
    label: 'Check Stock',
    type: 'normal',
  });

  // ── ALLOCATION DECISIONS ─────────────────────────────────────────────────
  const allocDecisions = chain.filter(
    (d) =>
      d.decision_type === DecisionType.INVENTORY_ALLOCATION ||
      d.decision_type === DecisionType.PARTIAL_ALLOCATION
  );

  const allocationId = `node-alloc-${orderId}`;
  const hasPartial = allocDecisions.some((d) => d.decision_type === DecisionType.PARTIAL_ALLOCATION);
  const hasAlloc = allocDecisions.length > 0;

  nodes.push({
    id: allocationId,
    type: 'allocation',
    label: 'Stock Allocation',
    subtitle: hasAlloc
      ? `${allocDecisions.length} allocation(s) made${hasPartial ? ' (partial)' : ''}`
      : 'Awaiting allocation',
    status: hasPartial ? 'warning' : hasAlloc ? 'success' : 'neutral',
    decisionType: DecisionType.INVENTORY_ALLOCATION,
    timestamp: allocDecisions[0]?.created_at,
    decision: hasAlloc
      ? allocDecisions.map((d) => d.decision).join('; ')
      : 'No allocation decisions yet',
    reason: hasAlloc
      ? allocDecisions.map((d) => d.reason).join(' | ')
      : 'Waiting for allocation engine to run',
    inputs: hasAlloc ? allocDecisions[0]?.inputs : undefined,
    outputs: hasAlloc ? { allocations_count: allocDecisions.length, has_partial: hasPartial } : undefined,
    metadata: hasAlloc ? { event_ids: allocDecisions.map((d) => d.id) } : undefined,
    layer: 3,
  });

  edges.push({
    id: `edge-${invCheckId}-${allocationId}`,
    source: invCheckId,
    target: allocationId,
    label: hasPartial ? 'Partial' : 'Allocate',
    type: hasPartial ? 'exception' : 'normal',
  });

  // ── CONFLICT RESOLUTION ──────────────────────────────────────────────────
  const conflictDecisions = chain.filter(
    (d) => d.decision_type === DecisionType.REALLOCATION
  );

  if (conflictDecisions.length > 0 || hasPartial) {
    const conflictId = `node-conflict-${orderId}`;
    nodes.push({
      id: conflictId,
      type: 'conflict_resolution',
      label: 'Contention Resolution',
      subtitle: conflictDecisions.length > 0
        ? `${conflictDecisions.length} reallocation(s)`
        : 'Priority-based arbitration',
      status: conflictDecisions.length > 0 ? 'warning' : 'info',
      decisionType: DecisionType.REALLOCATION,
      timestamp: conflictDecisions[0]?.created_at,
      decision: conflictDecisions.length > 0
        ? conflictDecisions[0].decision
        : 'Priority-ordered allocation to resolve scarcity',
      reason: conflictDecisions.length > 0
        ? conflictDecisions[0].reason
        : 'Higher priority orders are allocated first when inventory is scarce',
      inputs: conflictDecisions[0]?.inputs,
      outputs: conflictDecisions[0]?.affected_items,
      metadata: conflictDecisions.length > 0 ? { event_ids: conflictDecisions.map((d) => d.id) } : undefined,
      layer: 3,
    });

    edges.push({
      id: `edge-${allocationId}-${conflictId}`,
      source: allocationId,
      target: conflictId,
      label: 'Resolve Conflict',
      type: 'exception',
    });
  }

  // ── WORKSTATION PIPELINE STAGES ──────────────────────────────────────────
  const pickDecisions = chain.filter(
    (d) => d.decision_type === DecisionType.PICKING_PRIORITIZATION
  );

  const stages: { key: string; label: string; status: OrderStatus; reached: boolean }[] = [
    { key: 'picking', label: 'Picking', status: OrderStatus.PICKING, reached: false },
    { key: 'packing', label: 'Packing', status: OrderStatus.PACKING, reached: false },
    { key: 'quality', label: 'Quality Check', status: OrderStatus.QUALITY_CHECK, reached: false },
    { key: 'dispatch', label: 'Dispatch', status: OrderStatus.DISPATCHED, reached: false },
  ];

  const statusOrder = [
    OrderStatus.CREATED, OrderStatus.PRIORITY_SET, OrderStatus.INVENTORY_CHECKED,
    OrderStatus.ALLOCATED, OrderStatus.PICKING, OrderStatus.PACKING,
    OrderStatus.QUALITY_CHECK, OrderStatus.DISPATCHED, OrderStatus.COMPLETED,
  ];
  const currentIdx = statusOrder.indexOf(order.status);
  stages.forEach((s) => {
    s.reached = currentIdx >= statusOrder.indexOf(s.status);
  });

  let prevStageId = allocationId;
  stages.forEach((stage, i) => {
    const stageId = `node-stage-${stage.key}-${orderId}`;
    const relatedDecisions = stage.key === 'picking' ? pickDecisions : [];

    nodes.push({
      id: stageId,
      type: 'pipeline_stage',
      label: stage.label,
      subtitle: stage.reached
        ? (order.status === stage.status ? '● In Progress' : '✓ Completed')
        : '○ Pending',
      status: stage.reached
        ? (order.status === stage.status ? 'info' : 'success')
        : 'neutral',
      decisionType: stage.key === 'picking' ? DecisionType.PICKING_PRIORITIZATION : undefined,
      timestamp: relatedDecisions[0]?.created_at,
      decision: relatedDecisions.length > 0
        ? relatedDecisions[0].decision
        : `${stage.label} stage`,
      reason: relatedDecisions.length > 0
        ? relatedDecisions[0].reason
        : stage.reached ? `Order passed through ${stage.label}` : `Order has not reached ${stage.label} yet`,
      recommendedAction: relatedDecisions[0]?.recommended_action,
      inputs: relatedDecisions[0]?.inputs,
      metadata: relatedDecisions.length > 0 ? { event_ids: relatedDecisions.map((d) => d.id) } : undefined,
      layer: 4 + i,
    });

    edges.push({
      id: `edge-${prevStageId}-${stageId}`,
      source: prevStageId,
      target: stageId,
      label: i === 0 ? 'Begin Fulfillment' : undefined,
      type: 'normal',
    });

    prevStageId = stageId;
  });

  // ── EXCEPTION NODES ──────────────────────────────────────────────────────
  const exceptionDecisions = chain.filter(
    (d) => d.decision_type === DecisionType.EXCEPTION_SEVERITY
  );

  exceptionDecisions.forEach((exc, i) => {
    const excId = `node-exception-${orderId}-${i}`;
    nodes.push({
      id: excId,
      type: 'exception',
      label: 'Exception',
      subtitle: exc.decision,
      status: 'error',
      decisionType: DecisionType.EXCEPTION_SEVERITY,
      timestamp: exc.created_at,
      decision: exc.decision,
      reason: exc.reason,
      recommendedAction: exc.recommended_action,
      inputs: exc.inputs,
      outputs: exc.affected_items,
      metadata: { event_id: exc.id },
      layer: 3,
    });

    // Connect exception to allocation node
    edges.push({
      id: `edge-${allocationId}-${excId}`,
      source: allocationId,
      target: excId,
      label: 'Exception',
      type: 'exception',
    });

    // Add resolution node if recommended_action exists
    if (exc.recommended_action) {
      const resId = `node-resolution-${orderId}-${i}`;
      nodes.push({
        id: resId,
        type: 'resolution',
        label: 'Resolution',
        subtitle: exc.recommended_action,
        status: 'info',
        timestamp: exc.created_at,
        decision: 'Recommended resolution',
        reason: exc.recommended_action,
        layer: 4,
      });

      edges.push({
        id: `edge-${excId}-${resId}`,
        source: excId,
        target: resId,
        label: 'Resolve',
        type: 'resolution',
      });
    }
  });

  // ── REORDER RECOMMENDATIONS ──────────────────────────────────────────────
  const reorderDecisions = chain.filter(
    (d) => d.decision_type === DecisionType.REORDER_RECOMMENDATION
  );

  reorderDecisions.forEach((reorder, i) => {
    const reorderId = `node-reorder-${orderId}-${i}`;
    nodes.push({
      id: reorderId,
      type: 'reorder_recommendation',
      label: 'Reorder Recommendation',
      subtitle: reorder.decision,
      status: 'warning',
      decisionType: DecisionType.REORDER_RECOMMENDATION,
      timestamp: reorder.created_at,
      decision: reorder.decision,
      reason: reorder.reason,
      recommendedAction: reorder.recommended_action,
      inputs: reorder.inputs,
      outputs: reorder.affected_items,
      metadata: { event_id: reorder.id },
      layer: 4,
    });

    edges.push({
      id: `edge-${allocationId}-${reorderId}`,
      source: allocationId,
      target: reorderId,
      label: 'Reorder',
      type: 'exception',
    });

    if (reorder.recommended_action) {
      recommendations.push(reorder.recommended_action);
    }
  });

  return {
    nodes,
    edges,
    order: {
      id: order.id,
      order_number: order.order_number,
      customer_name: customer?.name || 'Unknown',
      customer_tier: customer?.tier || 'standard',
      channel: order.channel,
      total_value: order.total_value,
      priority_score: order.priority_score,
      status: order.status,
      sla_deadline: order.sla_deadline,
      created_at: order.created_at,
      items: items.map((item) => {
        const prod = DEMO_PRODUCTS.find((p) => p.id === item.product_id);
        return {
          product_id: item.product_id,
          product_name: prod?.name || item.product_id,
          quantity: item.quantity,
          allocated: item.allocated_quantity,
        };
      }),
    },
    exceptions,
    recommendations,
  };
}

// ─── GET /api/decision-graph ────────────────────────────────────────────────

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get('order_id');

    if (orderId) {
      const graph = buildOrderGraph(orderId);
      if (!graph) {
        return NextResponse.json(
          { success: false, error: `Order ${orderId} not found` },
          { status: 404 }
        );
      }
      return NextResponse.json({ success: true, data: graph });
    }

    // Return list of all orders with their graph summary (for picker)
    const allOrders = getOrders();
    const summaries = allOrders.map((order) => {
      const customer = DEMO_CUSTOMERS.find((c) => c.id === order.customer_id);
      const chain = getDecisionChain(order.id);
      return {
        id: order.id,
        order_number: order.order_number,
        customer_name: customer?.name || 'Unknown',
        customer_tier: customer?.tier || 'standard',
        status: order.status,
        priority_score: order.priority_score,
        decision_count: chain.length,
        channel: order.channel,
        total_value: order.total_value,
      };
    });

    return NextResponse.json({ success: true, data: summaries });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
