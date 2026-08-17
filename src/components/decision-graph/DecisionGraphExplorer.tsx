'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type {
  GraphNode,
  GraphEdge,
  GraphNodeStatus,
  DecisionGraphData,
  LayoutConfig,
} from './graphTypes';
import { NODE_STATUS_COLORS, NODE_TYPE_ICONS, DEFAULT_LAYOUT_CONFIG } from './graphTypes';

// ─── Props ──────────────────────────────────────────────────────────────────

interface DecisionGraphExplorerProps {
  onRefreshParent: () => void;
  showToast: (text: string, type: 'success' | 'info' | 'warning' | 'error') => void;
}

// ─── Order Summary (for picker) ─────────────────────────────────────────────

interface OrderSummary {
  id: string;
  order_number: string;
  customer_name: string;
  customer_tier: string;
  status: string;
  priority_score: number;
  decision_count: number;
  channel: string;
  total_value: number;
}

// ─── Layout engine ──────────────────────────────────────────────────────────

interface LayoutNode extends GraphNode {
  x: number;
  y: number;
  width: number;
  height: number;
}

function computeLayout(
  nodes: GraphNode[],
  edges: GraphEdge[],
  config: LayoutConfig = DEFAULT_LAYOUT_CONFIG
): { layoutNodes: LayoutNode[]; totalWidth: number; totalHeight: number } {
  if (nodes.length === 0) return { layoutNodes: [], totalWidth: 0, totalHeight: 0 };

  // Group nodes by layer
  const layers = new Map<number, GraphNode[]>();
  nodes.forEach((n) => {
    const layer = n.layer ?? 0;
    if (!layers.has(layer)) layers.set(layer, []);
    layers.get(layer)!.push(n);
  });

  const sortedLayers = [...layers.keys()].sort((a, b) => a - b);
  const layoutNodes: LayoutNode[] = [];
  let maxRowWidth = 0;

  sortedLayers.forEach((layerIdx, rowIdx) => {
    const layerNodes = layers.get(layerIdx)!;
    const rowWidth = layerNodes.length * config.nodeWidth + (layerNodes.length - 1) * config.horizontalSpacing;
    maxRowWidth = Math.max(maxRowWidth, rowWidth);

    layerNodes.forEach((node, colIdx) => {
      const x = config.padding + colIdx * (config.nodeWidth + config.horizontalSpacing);
      const y = config.padding + rowIdx * (config.nodeHeight + config.verticalSpacing);

      layoutNodes.push({
        ...node,
        x,
        y,
        width: config.nodeWidth,
        height: config.nodeHeight,
      });
    });
  });

  // Center narrower rows
  const totalWidth = maxRowWidth + config.padding * 2;
  sortedLayers.forEach((layerIdx) => {
    const layerNodes = layoutNodes.filter((n) => n.layer === layerIdx);
    if (layerNodes.length === 0) return;
    const rowWidth = layerNodes.length * config.nodeWidth + (layerNodes.length - 1) * config.horizontalSpacing;
    const offset = (totalWidth - rowWidth - config.padding * 2) / 2;
    layerNodes.forEach((n) => {
      n.x += offset;
    });
  });

  const totalHeight = sortedLayers.length * (config.nodeHeight + config.verticalSpacing) + config.padding * 2;

  return { layoutNodes, totalWidth, totalHeight };
}

// ─── Edge path generator ────────────────────────────────────────────────────

function generateEdgePath(
  source: LayoutNode,
  target: LayoutNode
): string {
  const sx = source.x + source.width / 2;
  const sy = source.y + source.height;
  const tx = target.x + target.width / 2;
  const ty = target.y;

  const midY = sy + (ty - sy) / 2;

  // Smooth cubic bezier
  return `M ${sx} ${sy} C ${sx} ${midY}, ${tx} ${midY}, ${tx} ${ty}`;
}

// ─── Tier badge color ───────────────────────────────────────────────────────

function tierColor(tier: string): string {
  switch (tier) {
    case 'vip': return '#f59e0b';
    case 'premium': return '#8b5cf6';
    default: return '#64748b';
  }
}

function statusBadgeColor(status: string): { bg: string; text: string } {
  switch (status) {
    case 'COMPLETED': return { bg: '#064e3b', text: '#34d399' };
    case 'DISPATCHED': return { bg: '#164e63', text: '#22d3ee' };
    case 'EXCEPTION': return { bg: '#7f1d1d', text: '#f87171' };
    case 'CANCELLED': return { bg: '#374151', text: '#9ca3af' };
    default: return { bg: '#1e293b', text: '#94a3b8' };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export default function DecisionGraphExplorer({ onRefreshParent, showToast }: DecisionGraphExplorerProps) {
  const [ordersList, setOrdersList] = useState<OrderSummary[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [graphData, setGraphData] = useState<DecisionGraphData | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [hoveredEdge, setHoveredEdge] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [graphLoading, setGraphLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  // Pan & Zoom state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // ── Fetch order list ─────────────────────────────────────────────────────
  useEffect(() => {
    setLoading(true);
    fetch('/api/decision-graph')
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setOrdersList(data.data || []);
        }
      })
      .catch((err) => console.error('Failed to load order list:', err))
      .finally(() => setLoading(false));
  }, []);

  // ── Fetch graph for selected order ───────────────────────────────────────
  useEffect(() => {
    if (!selectedOrderId) {
      setGraphData(null);
      setSelectedNode(null);
      return;
    }
    setGraphLoading(true);
    fetch(`/api/decision-graph?order_id=${selectedOrderId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setGraphData(data.data);
          setSelectedNode(null);
          setZoom(1);
          setPan({ x: 0, y: 0 });
        } else {
          showToast(data.error || 'Failed to load graph', 'error');
        }
      })
      .catch((err) => {
        console.error('Failed to load decision graph:', err);
        showToast('Network error loading graph', 'error');
      })
      .finally(() => setGraphLoading(false));
  }, [selectedOrderId, showToast]);

  // ── Computed layout ──────────────────────────────────────────────────────
  const layout = useMemo(() => {
    if (!graphData) return null;
    return computeLayout(graphData.nodes, graphData.edges);
  }, [graphData]);

  const nodeMap = useMemo(() => {
    if (!layout) return new Map<string, LayoutNode>();
    const map = new Map<string, LayoutNode>();
    layout.layoutNodes.forEach((n) => map.set(n.id, n));
    return map;
  }, [layout]);

  // ── Filter orders list ───────────────────────────────────────────────────
  const filteredOrders = useMemo(() => {
    return ordersList.filter((o) => {
      if (filterStatus !== 'all' && o.status !== filterStatus) return false;
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        return (
          o.order_number.toLowerCase().includes(term) ||
          o.customer_name.toLowerCase().includes(term) ||
          o.channel.toLowerCase().includes(term)
        );
      }
      return true;
    });
  }, [ordersList, filterStatus, searchTerm]);

  // ── Pan and Zoom handlers ────────────────────────────────────────────────
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.08 : 0.08;
    setZoom((z) => Math.max(0.3, Math.min(3, z + delta)));
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 0 && (e.target as HTMLElement).tagName === 'svg' || (e.target as HTMLElement).tagName === 'rect') {
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  }, [pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPanning) return;
    setPan({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
  }, [isPanning, panStart]);

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
  }, []);

  const resetView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  // ── Unique statuses for filter ───────────────────────────────────────────
  const uniqueStatuses = useMemo(() => {
    const statuses = new Set(ordersList.map((o) => o.status));
    return ['all', ...Array.from(statuses)];
  }, [ordersList]);

  // ═════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═════════════════════════════════════════════════════════════════════════

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white font-mono tracking-tight flex items-center gap-2">
            <span className="text-xl">🌳</span>
            Interactive Decision Graph
          </h2>
          <p className="text-xs text-slate-400 mt-0.5 font-mono">
            Trace every deterministic decision for any order through the fulfillment pipeline
          </p>
        </div>
        <div className="flex items-center gap-2">
          {selectedOrderId && (
            <button
              onClick={() => { setSelectedOrderId(null); setGraphData(null); setSelectedNode(null); }}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-lg border border-slate-700 transition"
            >
              ← Back to Orders
            </button>
          )}
          <button
            onClick={resetView}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-lg border border-slate-700 transition"
            title="Reset zoom and pan"
          >
            🔍 Reset View
          </button>
        </div>
      </div>

      {/* ─── ORDER PICKER (when no graph is selected) ─────────────────────── */}
      {!selectedOrderId && (
        <div className="space-y-3">
          {/* Search & Filter */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-md">
              <input
                type="text"
                placeholder="Search orders by number, customer, channel..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-slate-900/80 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 outline-none font-mono"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-sm"
                >
                  ✕
                </button>
              )}
            </div>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="bg-slate-900/80 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 font-mono focus:ring-1 focus:ring-cyan-500 outline-none"
            >
              {uniqueStatuses.map((s) => (
                <option key={s} value={s}>{s === 'all' ? 'All Statuses' : s}</option>
              ))}
            </select>
            <span className="text-xs text-slate-500 font-mono">
              {filteredOrders.length} order{filteredOrders.length !== 1 ? 's' : ''}
            </span>
          </div>

          {/* Orders Grid */}
          {loading ? (
            <div className="flex items-center justify-center py-20 text-slate-400 font-mono text-sm">
              <span className="animate-spin mr-2">⏳</span> Loading orders...
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-500">
              <span className="text-4xl mb-3">📦</span>
              <p className="font-mono text-sm">No orders found. Seed data using the toolbar above.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredOrders.map((order) => {
                const sb = statusBadgeColor(order.status);
                return (
                  <button
                    key={order.id}
                    onClick={() => setSelectedOrderId(order.id)}
                    className="group bg-[#0f172a]/90 border border-slate-800 hover:border-cyan-500/40 rounded-xl p-4 text-left transition-all hover:shadow-lg hover:shadow-cyan-500/5 relative overflow-hidden"
                  >
                    {/* Priority indicator bar */}
                    <div
                      className="absolute top-0 left-0 h-1 rounded-t-xl transition-all"
                      style={{
                        width: `${Math.min(100, order.priority_score)}%`,
                        backgroundColor: order.priority_score >= 80 ? '#ef4444' : order.priority_score >= 60 ? '#f59e0b' : '#22d3ee',
                      }}
                    />

                    <div className="flex items-start justify-between mt-1">
                      <div>
                        <div className="text-sm font-bold text-white font-mono group-hover:text-cyan-300 transition">
                          {order.order_number}
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5">{order.customer_name}</div>
                      </div>
                      <div
                        className="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold"
                        style={{ backgroundColor: sb.bg, color: sb.text }}
                      >
                        {order.status}
                      </div>
                    </div>

                    <div className="mt-3 flex items-center justify-between text-[11px] font-mono text-slate-400">
                      <div className="flex items-center gap-3">
                        <span style={{ color: tierColor(order.customer_tier) }}>
                          {order.customer_tier.toUpperCase()}
                        </span>
                        <span>{order.channel}</span>
                        <span>${order.total_value.toFixed(0)}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-cyan-400/80">
                        <span>📊 {order.decision_count} decisions</span>
                        <span className="opacity-0 group-hover:opacity-100 transition text-cyan-400">→</span>
                      </div>
                    </div>

                    <div className="mt-2 flex items-center gap-2">
                      <div className="flex-1 h-1 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${Math.min(100, order.priority_score)}%`,
                            background: order.priority_score >= 80
                              ? 'linear-gradient(90deg, #ef4444, #dc2626)'
                              : order.priority_score >= 60
                              ? 'linear-gradient(90deg, #f59e0b, #d97706)'
                              : 'linear-gradient(90deg, #06b6d4, #0891b2)',
                          }}
                        />
                      </div>
                      <span className="text-[10px] font-mono text-slate-500">
                        P:{order.priority_score.toFixed(0)}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ─── GRAPH VISUALIZATION ──────────────────────────────────────────── */}
      {selectedOrderId && (
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-4">
          {/* Graph Canvas */}
          <div
            ref={containerRef}
            className="bg-[#0a0f1c] border border-slate-800 rounded-xl overflow-hidden relative"
            style={{ minHeight: 520 }}
          >
            {/* Zoom Controls */}
            <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5 bg-slate-900/90 border border-slate-700 rounded-lg p-1">
              <button
                onClick={() => setZoom((z) => Math.min(3, z + 0.2))}
                className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 rounded text-sm transition"
              >
                +
              </button>
              <span className="text-[10px] font-mono text-slate-500 w-10 text-center">
                {(zoom * 100).toFixed(0)}%
              </span>
              <button
                onClick={() => setZoom((z) => Math.max(0.3, z - 0.2))}
                className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 rounded text-sm transition"
              >
                −
              </button>
            </div>

            {/* Legend */}
            <div className="absolute top-3 right-3 z-10 bg-slate-900/90 border border-slate-700 rounded-lg px-3 py-2">
              <div className="text-[10px] font-mono text-slate-500 mb-1.5 uppercase tracking-wider">Legend</div>
              <div className="space-y-1">
                {(['success', 'warning', 'error', 'info', 'neutral'] as GraphNodeStatus[]).map((status) => (
                  <div key={status} className="flex items-center gap-2 text-[10px]">
                    <div
                      className="w-3 h-3 rounded-sm border"
                      style={{
                        backgroundColor: NODE_STATUS_COLORS[status].bg,
                        borderColor: NODE_STATUS_COLORS[status].border,
                      }}
                    />
                    <span style={{ color: NODE_STATUS_COLORS[status].text }}>
                      {status.charAt(0).toUpperCase() + status.slice(1)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {graphLoading ? (
              <div className="flex items-center justify-center h-full min-h-[520px] text-slate-400 font-mono text-sm">
                <span className="animate-spin mr-2">⏳</span> Loading decision graph...
              </div>
            ) : layout && graphData ? (
              <svg
                ref={svgRef}
                width="100%"
                height={Math.max(520, layout.totalHeight * zoom + 40)}
                onWheel={handleWheel}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                style={{ cursor: isPanning ? 'grabbing' : 'grab' }}
              >
                <defs>
                  {/* Arrow markers */}
                  <marker id="arrow-normal" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="#475569" />
                  </marker>
                  <marker id="arrow-exception" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="#ef4444" />
                  </marker>
                  <marker id="arrow-resolution" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="#22d3ee" />
                  </marker>
                  {/* Glow filter */}
                  <filter id="glow">
                    <feGaussianBlur stdDeviation="3" result="blur" />
                    <feMerge>
                      <feMergeNode in="blur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>

                <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
                  {/* Background grid (subtle) */}
                  <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                    <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#1e293b" strokeWidth="0.5" opacity="0.4" />
                  </pattern>
                  <rect width={layout.totalWidth + 100} height={layout.totalHeight + 100} fill="url(#grid)" />

                  {/* Edges */}
                  {graphData.edges.map((edge) => {
                    const source = nodeMap.get(edge.source);
                    const target = nodeMap.get(edge.target);
                    if (!source || !target) return null;

                    const path = generateEdgePath(source, target);
                    const isHovered = hoveredEdge === edge.id;
                    const edgeColor = edge.type === 'exception' ? '#ef4444' : edge.type === 'resolution' ? '#22d3ee' : '#475569';
                    const markerId = edge.type === 'exception' ? 'arrow-exception' : edge.type === 'resolution' ? 'arrow-resolution' : 'arrow-normal';

                    return (
                      <g
                        key={edge.id}
                        onMouseEnter={() => setHoveredEdge(edge.id)}
                        onMouseLeave={() => setHoveredEdge(null)}
                      >
                        <path
                          d={path}
                          fill="none"
                          stroke={edgeColor}
                          strokeWidth={isHovered ? 2.5 : 1.5}
                          strokeDasharray={edge.type === 'exception' ? '6,4' : edge.type === 'resolution' ? '4,4' : undefined}
                          markerEnd={`url(#${markerId})`}
                          opacity={isHovered ? 1 : 0.7}
                          style={{ transition: 'all 0.15s ease' }}
                        />
                        {edge.label && (
                          <text
                            x={(source.x + source.width / 2 + target.x + target.width / 2) / 2}
                            y={(source.y + source.height + target.y) / 2 - 6}
                            textAnchor="middle"
                            fill={isHovered ? '#e2e8f0' : '#64748b'}
                            fontSize="10"
                            fontFamily="monospace"
                            style={{ transition: 'fill 0.15s ease' }}
                          >
                            {edge.label}
                          </text>
                        )}
                      </g>
                    );
                  })}

                  {/* Nodes */}
                  {layout.layoutNodes.map((node) => {
                    const colors = NODE_STATUS_COLORS[node.status];
                    const icon = NODE_TYPE_ICONS[node.type] || '▶️';
                    const isHovered = hoveredNode === node.id;
                    const isSelected = selectedNode?.id === node.id;

                    return (
                      <g
                        key={node.id}
                        transform={`translate(${node.x}, ${node.y})`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedNode(node);
                        }}
                        onMouseEnter={() => setHoveredNode(node.id)}
                        onMouseLeave={() => setHoveredNode(null)}
                        style={{ cursor: 'pointer' }}
                      >
                        {/* Selection glow */}
                        {isSelected && (
                          <rect
                            x={-3}
                            y={-3}
                            width={node.width + 6}
                            height={node.height + 6}
                            rx={12}
                            ry={12}
                            fill="none"
                            stroke={colors.accent}
                            strokeWidth={2}
                            opacity={0.6}
                            filter="url(#glow)"
                          />
                        )}

                        {/* Node body */}
                        <rect
                          x={0}
                          y={0}
                          width={node.width}
                          height={node.height}
                          rx={10}
                          ry={10}
                          fill={colors.bg}
                          stroke={isHovered || isSelected ? colors.accent : colors.border}
                          strokeWidth={isHovered || isSelected ? 2 : 1}
                          opacity={isHovered ? 1 : 0.92}
                          style={{ transition: 'all 0.15s ease' }}
                        />

                        {/* Status bar */}
                        <rect
                          x={0}
                          y={0}
                          width={4}
                          height={node.height}
                          rx={2}
                          fill={colors.accent}
                          opacity={0.8}
                        />

                        {/* Icon */}
                        <text
                          x={16}
                          y={node.height / 2 - 8}
                          fontSize="16"
                          dominantBaseline="middle"
                        >
                          {icon}
                        </text>

                        {/* Label */}
                        <text
                          x={38}
                          y={node.height / 2 - 8}
                          fill={colors.text}
                          fontSize="12"
                          fontWeight="600"
                          fontFamily="monospace"
                          dominantBaseline="middle"
                        >
                          {node.label.length > 26 ? node.label.slice(0, 24) + '…' : node.label}
                        </text>

                        {/* Subtitle */}
                        {node.subtitle && (
                          <text
                            x={38}
                            y={node.height / 2 + 10}
                            fill={colors.text}
                            fontSize="9"
                            fontFamily="monospace"
                            opacity={0.7}
                            dominantBaseline="middle"
                          >
                            {node.subtitle.length > 34 ? node.subtitle.slice(0, 32) + '…' : node.subtitle}
                          </text>
                        )}

                        {/* Score badge */}
                        {node.score !== undefined && node.type === 'priority_evaluation' && (
                          <g>
                            <rect
                              x={node.width - 48}
                              y={6}
                              width={40}
                              height={18}
                              rx={9}
                              fill={colors.accent}
                              opacity={0.25}
                            />
                            <text
                              x={node.width - 28}
                              y={15}
                              fill={colors.accent}
                              fontSize="10"
                              fontWeight="700"
                              fontFamily="monospace"
                              textAnchor="middle"
                              dominantBaseline="middle"
                            >
                              P:{node.score.toFixed(0)}
                            </text>
                          </g>
                        )}
                      </g>
                    );
                  })}
                </g>
              </svg>
            ) : (
              <div className="flex items-center justify-center h-full min-h-[520px] text-slate-500 font-mono text-sm">
                Select an order to visualize its decision chain
              </div>
            )}
          </div>

          {/* ─── DETAIL PANEL ────────────────────────────────────────────────── */}
          <div className="space-y-3">
            {/* Order Info Card */}
            {graphData && (
              <div className="bg-[#0f172a]/90 border border-slate-800 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold text-white font-mono">
                    {graphData.order.order_number}
                  </h3>
                  <div
                    className="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold"
                    style={{
                      backgroundColor: statusBadgeColor(graphData.order.status).bg,
                      color: statusBadgeColor(graphData.order.status).text,
                    }}
                  >
                    {graphData.order.status}
                  </div>
                </div>

                <div className="space-y-1.5 text-xs font-mono text-slate-400">
                  <div className="flex justify-between">
                    <span>Customer</span>
                    <span className="text-slate-200">{graphData.order.customer_name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Tier</span>
                    <span style={{ color: tierColor(graphData.order.customer_tier) }}>
                      {graphData.order.customer_tier.toUpperCase()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Channel</span>
                    <span className="text-slate-200">{graphData.order.channel}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Value</span>
                    <span className="text-emerald-400">${graphData.order.total_value.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Priority</span>
                    <span className={graphData.order.priority_score >= 80 ? 'text-red-400' : graphData.order.priority_score >= 60 ? 'text-amber-400' : 'text-cyan-400'}>
                      {graphData.order.priority_score.toFixed(1)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Nodes</span>
                    <span className="text-slate-200">{graphData.nodes.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Edges</span>
                    <span className="text-slate-200">{graphData.edges.length}</span>
                  </div>
                </div>

                {/* Items */}
                <div className="mt-3 pt-3 border-t border-slate-800">
                  <div className="text-[10px] font-mono text-slate-500 mb-1.5 uppercase tracking-wider">Line Items</div>
                  <div className="space-y-1">
                    {graphData.order.items.map((item, i) => (
                      <div key={i} className="flex items-center justify-between text-[11px] font-mono">
                        <span className="text-slate-300 truncate max-w-[180px]">{item.product_name}</span>
                        <span className={item.allocated >= item.quantity ? 'text-emerald-400' : item.allocated > 0 ? 'text-amber-400' : 'text-slate-500'}>
                          {item.allocated}/{item.quantity}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Node Inspector */}
            {selectedNode ? (
              <div className="bg-[#0f172a]/90 border border-slate-800 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-lg">{NODE_TYPE_ICONS[selectedNode.type]}</span>
                  <div>
                    <h3 className="text-sm font-bold text-white font-mono">{selectedNode.label}</h3>
                    {selectedNode.subtitle && (
                      <p className="text-[11px] text-slate-400 font-mono">{selectedNode.subtitle}</p>
                    )}
                  </div>
                </div>

                <div className="space-y-3">
                  {/* Decision */}
                  {selectedNode.decision && (
                    <div>
                      <div className="text-[10px] font-mono text-slate-500 uppercase tracking-wider mb-1">Decision</div>
                      <p className="text-xs text-slate-200 font-mono leading-relaxed bg-slate-900/60 rounded-lg p-2.5 border border-slate-800">
                        {selectedNode.decision}
                      </p>
                    </div>
                  )}

                  {/* Reason (WHY) */}
                  {selectedNode.reason && (
                    <div>
                      <div className="text-[10px] font-mono text-cyan-400/80 uppercase tracking-wider mb-1">
                        💡 Why This Decision
                      </div>
                      <p className="text-xs text-cyan-200/90 font-mono leading-relaxed bg-cyan-950/20 rounded-lg p-2.5 border border-cyan-800/30">
                        {selectedNode.reason}
                      </p>
                    </div>
                  )}

                  {/* Recommended Action */}
                  {selectedNode.recommendedAction && (
                    <div>
                      <div className="text-[10px] font-mono text-amber-400/80 uppercase tracking-wider mb-1">
                        ⚡ Recommended Action
                      </div>
                      <p className="text-xs text-amber-200/90 font-mono leading-relaxed bg-amber-950/20 rounded-lg p-2.5 border border-amber-800/30">
                        {selectedNode.recommendedAction}
                      </p>
                    </div>
                  )}

                  {/* Inputs */}
                  {selectedNode.inputs && Object.keys(selectedNode.inputs).length > 0 && (
                    <div>
                      <div className="text-[10px] font-mono text-slate-500 uppercase tracking-wider mb-1">Inputs</div>
                      <div className="bg-slate-900/60 rounded-lg p-2.5 border border-slate-800 space-y-1">
                        {Object.entries(selectedNode.inputs).map(([key, val]) => (
                          <div key={key} className="flex justify-between text-[11px] font-mono">
                            <span className="text-slate-500">{key}</span>
                            <span className="text-slate-300 max-w-[180px] truncate text-right">
                              {typeof val === 'object' ? JSON.stringify(val).slice(0, 40) : String(val)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Outputs */}
                  {selectedNode.outputs && Object.keys(selectedNode.outputs).length > 0 && (
                    <div>
                      <div className="text-[10px] font-mono text-slate-500 uppercase tracking-wider mb-1">Outputs</div>
                      <div className="bg-slate-900/60 rounded-lg p-2.5 border border-slate-800 space-y-1">
                        {Object.entries(selectedNode.outputs).map(([key, val]) => (
                          <div key={key} className="flex justify-between text-[11px] font-mono">
                            <span className="text-slate-500">{key}</span>
                            <span className="text-slate-300 max-w-[180px] truncate text-right">
                              {typeof val === 'object' ? JSON.stringify(val).slice(0, 40) : String(val)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Timestamp */}
                  {selectedNode.timestamp && (
                    <div className="text-[10px] font-mono text-slate-600 pt-1 border-t border-slate-800/50">
                      🕐 {new Date(selectedNode.timestamp).toLocaleString()}
                    </div>
                  )}
                </div>
              </div>
            ) : graphData ? (
              <div className="bg-[#0f172a]/90 border border-slate-800 rounded-xl p-6 flex flex-col items-center text-center">
                <span className="text-3xl mb-2">🔍</span>
                <p className="text-xs text-slate-400 font-mono">
                  Click a node in the graph to inspect its decision details
                </p>
              </div>
            ) : null}

            {/* Exceptions */}
            {graphData && graphData.exceptions.length > 0 && (
              <div className="bg-rose-950/20 border border-rose-800/30 rounded-xl p-4">
                <div className="text-[10px] font-mono text-rose-400 uppercase tracking-wider mb-2">
                  🚨 Active Exceptions
                </div>
                <div className="space-y-2">
                  {graphData.exceptions.map((exc, i) => (
                    <div key={i} className="text-xs font-mono text-rose-300/80">
                      <span className="text-rose-400 font-semibold">[{exc.severity}]</span> {exc.title}
                      <p className="text-rose-400/60 mt-0.5">{exc.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recommendations */}
            {graphData && graphData.recommendations.length > 0 && (
              <div className="bg-amber-950/20 border border-amber-800/30 rounded-xl p-4">
                <div className="text-[10px] font-mono text-amber-400 uppercase tracking-wider mb-2">
                  ⚡ Recommendations
                </div>
                <div className="space-y-1.5">
                  {graphData.recommendations.map((rec, i) => (
                    <p key={i} className="text-xs font-mono text-amber-300/80">• {rec}</p>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
