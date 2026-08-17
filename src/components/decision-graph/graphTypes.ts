// Decision Graph TypeScript interfaces
// These define the node-edge structure for the interactive decision visualization

import { DecisionType, ExceptionType, ExceptionSeverity } from '@/lib/types';

// ─── Node Types ─────────────────────────────────────────────────────────────

export type GraphNodeType =
  | 'order_created'
  | 'priority_evaluation'
  | 'sla_risk'
  | 'inventory_check'
  | 'allocation'
  | 'conflict_resolution'
  | 'exception'
  | 'resolution'
  | 'reorder_recommendation'
  | 'pipeline_stage';

export type GraphNodeStatus = 'success' | 'warning' | 'error' | 'info' | 'neutral';

export interface GraphNode {
  id: string;
  type: GraphNodeType;
  label: string;
  subtitle?: string;
  status: GraphNodeStatus;
  decisionType?: DecisionType;
  timestamp?: string;
  score?: number;
  decision?: string;
  reason?: string;
  recommendedAction?: string;
  inputs?: Record<string, unknown>;
  outputs?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  // Layout (computed)
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  layer?: number;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  type?: 'normal' | 'exception' | 'resolution';
}

export interface DecisionGraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  order: {
    id: string;
    order_number: string;
    customer_name: string;
    customer_tier: string;
    channel: string;
    total_value: number;
    priority_score: number;
    status: string;
    sla_deadline: string;
    created_at: string;
    items: { product_id: string; product_name: string; quantity: number; allocated: number }[];
  };
  exceptions: {
    type: ExceptionType;
    severity: ExceptionSeverity;
    title: string;
    description: string;
    resolution?: string;
  }[];
  recommendations: string[];
}

// ─── Layout Types ───────────────────────────────────────────────────────────

export interface LayoutConfig {
  nodeWidth: number;
  nodeHeight: number;
  horizontalSpacing: number;
  verticalSpacing: number;
  padding: number;
}

export interface LayoutResult {
  nodes: (GraphNode & { x: number; y: number; width: number; height: number })[];
  edges: GraphEdge[];
  totalWidth: number;
  totalHeight: number;
}

export const DEFAULT_LAYOUT_CONFIG: LayoutConfig = {
  nodeWidth: 260,
  nodeHeight: 72,
  horizontalSpacing: 60,
  verticalSpacing: 80,
  padding: 60,
};

// ─── Status Mapping ─────────────────────────────────────────────────────────

export const NODE_STATUS_COLORS: Record<GraphNodeStatus, { bg: string; border: string; text: string; accent: string }> = {
  success: { bg: '#064e3b', border: '#10b981', text: '#a7f3d0', accent: '#34d399' },
  warning: { bg: '#78350f', border: '#f59e0b', text: '#fde68a', accent: '#fbbf24' },
  error:   { bg: '#7f1d1d', border: '#ef4444', text: '#fecaca', accent: '#f87171' },
  info:    { bg: '#164e63', border: '#06b6d4', text: '#a5f3fc', accent: '#22d3ee' },
  neutral: { bg: '#1e293b', border: '#475569', text: '#cbd5e1', accent: '#94a3b8' },
};

export const NODE_TYPE_ICONS: Record<GraphNodeType, string> = {
  order_created: '📦',
  priority_evaluation: '⚡',
  sla_risk: '⏰',
  inventory_check: '🏬',
  allocation: '🎯',
  conflict_resolution: '⚔️',
  exception: '🚨',
  resolution: '🔧',
  reorder_recommendation: '📋',
  pipeline_stage: '▶️',
};
