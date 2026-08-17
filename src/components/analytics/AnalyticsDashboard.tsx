'use client';

import React, { useState, useEffect } from 'react';
import { AnalyticsSummary, Product } from '@/lib/types';
import { DEMO_PRODUCTS } from '@/lib/seed-data';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';

interface AnalyticsDashboardProps {
  onRefreshParent: () => void;
  showToast: (text: string, type?: 'success' | 'info' | 'warning' | 'error') => void;
}

const COLORS = ['#8b5cf6', '#06b6d4', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#ec4899'];
const TIER_COLORS = ['#a855f7', '#3b82f6', '#64748b'];

export default function AnalyticsDashboard({ onRefreshParent, showToast }: AnalyticsDashboardProps) {
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [activeTimeframe, setActiveTimeframe] = useState<string>('today');
  const [mounted, setMounted] = useState<boolean>(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/analytics');
      const data = await res.json();
      if (data.success) {
        setAnalytics(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch analytics', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const stageData = analytics?.stage_distribution || [
    { stage: 'Created', count: 0 },
    { stage: 'Prioritized', count: 0 },
    { stage: 'Allocated', count: 0 },
    { stage: 'Picking', count: 0 },
    { stage: 'Packing', count: 0 },
    { stage: 'QC', count: 0 },
    { stage: 'Dispatched', count: 0 },
    { stage: 'Completed', count: 0 },
  ];

  const throughputData = analytics?.shift_throughput || [
    { hour: '08:00', received: 2, allocated: 1, picked: 0, packed: 0, dispatched: 0 },
    { hour: '10:00', received: 4, allocated: 3, picked: 2, packed: 0, dispatched: 0 },
    { hour: '12:00', received: 7, allocated: 6, picked: 4, packed: 2, dispatched: 1 },
    { hour: '14:00', received: 9, allocated: 8, picked: 7, packed: 5, dispatched: 3 },
    { hour: '16:00 (Now)', received: analytics?.total_orders || 10, allocated: 8, picked: 7, packed: 6, dispatched: 4 },
  ];

  const skuData = (analytics?.sku_stock_distribution || []).map((s) => ({
    name: s.name.length > 12 ? s.name.slice(0, 12) + '...' : s.name,
    available: s.available,
    reserved: s.reserved,
    damaged: s.damaged,
    reorder_point: s.reorder_point,
  }));

  const tierData = analytics?.tier_distribution || [
    { tier: 'VIP Customer', count: 3, value: 12000 },
    { tier: 'Premium Account', count: 4, value: 5400 },
    { tier: 'Standard Channel', count: 5, value: 2100 },
  ];

  const channelData = analytics?.channel_distribution || [
    { channel: 'WHOLESALE', count: 4 },
    { channel: 'WEB', count: 5 },
    { channel: 'MARKETPLACE', count: 3 },
  ];

  return (
    <div className="space-y-6 font-mono">
      {/* HEADER & LIVE TELEMETRY */}
      <div className="bg-[#0c1222] border border-slate-800 rounded-xl p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center font-bold text-black text-xl shadow-lg shadow-cyan-500/20">
              📊
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold uppercase text-white tracking-wide">
                  Operational Analytics & Fulfillment Telemetry
                </h2>
                <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
                  REALTIME METRICS
                </span>
              </div>
              <p className="text-xs text-slate-400">
                End-to-end throughput velocity, SLA compliance, stock health curves, and bottleneck diagnostics.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <div className="flex items-center bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
              {['today', 'shift', 'week'].map((tf) => (
                <button
                  key={tf}
                  onClick={() => setActiveTimeframe(tf)}
                  className={`px-3 py-1 rounded uppercase font-semibold transition ${
                    activeTimeframe === tf
                      ? 'bg-cyan-600 text-black'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {tf}
                </button>
              ))}
            </div>

            <button
              onClick={fetchAnalytics}
              disabled={loading}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-700 transition"
              title="Refresh Telemetry"
            >
              🔄
            </button>
          </div>
        </div>
      </div>

      {/* TOP KPI STRIP */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
        <div className="bg-[#0f172a]/90 border border-slate-800 rounded-xl p-4">
          <div className="text-slate-500 text-[10px] uppercase">Fulfillment Rate</div>
          <div className="text-2xl font-bold text-emerald-400 mt-1">
            {analytics ? `${Math.round(analytics.fulfillment_rate * 100)}%` : '0%'}
          </div>
          <div className="text-[10px] text-slate-400 mt-1">Delivered / Total Orders</div>
        </div>

        <div className="bg-[#0f172a]/90 border border-slate-800 rounded-xl p-4">
          <div className="text-slate-500 text-[10px] uppercase">Allocation Efficiency</div>
          <div className="text-2xl font-bold text-cyan-300 mt-1">
            {analytics ? `${Math.round(analytics.allocation_rate * 100)}%` : '0%'}
          </div>
          <div className="text-[10px] text-slate-400 mt-1">
            {analytics?.partial_allocations || 0} partial allocations
          </div>
        </div>

        <div className="bg-[#0f172a]/90 border border-slate-800 rounded-xl p-4">
          <div className="text-slate-500 text-[10px] uppercase">Inventory Utilization</div>
          <div className="text-2xl font-bold text-blue-400 mt-1">
            {analytics ? `${Math.round(analytics.inventory_utilization * 100)}%` : '0%'}
          </div>
          <div className="text-[10px] text-slate-400 mt-1">Of 10,000 unit capacity</div>
        </div>

        <div className="bg-[#0f172a]/90 border border-slate-800 rounded-xl p-4">
          <div className="text-slate-500 text-[10px] uppercase">SLA Urgent Queue</div>
          <div className="text-2xl font-bold text-amber-400 mt-1">
            {analytics?.urgent_orders || 0}
          </div>
          <div className="text-[10px] text-amber-400/80 mt-1">Orders approaching deadline</div>
        </div>

        <div className="bg-[#0f172a]/90 border border-slate-800 rounded-xl p-4">
          <div className="text-slate-500 text-[10px] uppercase">Station Workload</div>
          <div className="text-2xl font-bold text-indigo-300 mt-1">
            {(analytics?.picking_backlog || 0) + (analytics?.packing_backlog || 0) + (analytics?.dispatch_backlog || 0)}
          </div>
          <div className="text-[10px] text-slate-400 mt-1">Active tasks in transit</div>
        </div>

        <div className="bg-[#0f172a]/90 border border-slate-800 rounded-xl p-4">
          <div className="text-slate-500 text-[10px] uppercase">Damaged Quarantined</div>
          <div className="text-2xl font-bold text-rose-400 mt-1">
            {analytics?.damaged_inventory || 0}
          </div>
          <div className="text-[10px] text-slate-400 mt-1">Units isolated from pool</div>
        </div>
      </div>

      {/* CHARTS GRID — ROW 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* CHART 1: SHIFT THROUGHPUT VELOCITY */}
        <div className="lg:col-span-7 bg-[#0c1222] border border-slate-800 rounded-xl p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                Fulfillment Velocity & Shift Progression
              </h3>
              <p className="text-[11px] text-slate-400">
                Order flow across shift intervals (Received $\rightarrow$ Allocated $\rightarrow$ Picked $\rightarrow$ Packed $\rightarrow$ Dispatched)
              </p>
            </div>
            <span className="text-[10px] text-cyan-400 bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-500/30">
              Shift 1 (08:00 - 16:00)
            </span>
          </div>

          <div className="h-[280px] w-full pt-2">
            {mounted ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={throughputData}>
                <defs>
                  <linearGradient id="colorRec" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorDisp" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="hour" stroke="#64748b" tick={{ fontSize: 11 }} />
                <YAxis stroke="#64748b" tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#090d16', borderColor: '#334155', fontSize: '11px', fontFamily: 'monospace' }}
                />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                <Area type="monotone" dataKey="received" name="Orders Received" stroke="#06b6d4" fillOpacity={1} fill="url(#colorRec)" />
                <Area type="monotone" dataKey="allocated" name="Allocated" stroke="#3b82f6" fillOpacity={0.2} fill="#3b82f6" />
                <Area type="monotone" dataKey="picked" name="Picked" stroke="#f59e0b" fillOpacity={0.2} fill="#f59e0b" />
                <Area type="monotone" dataKey="dispatched" name="Dispatched" stroke="#10b981" fillOpacity={1} fill="url(#colorDisp)" />
              </AreaChart>
            </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-slate-500 font-mono">Loading throughput chart...</div>
            )}
          </div>
        </div>

        {/* CHART 2: PIPELINE STAGE DISTRIBUTION */}
        <div className="lg:col-span-5 bg-[#0c1222] border border-slate-800 rounded-xl p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                Orders by Workflow Stage
              </h3>
              <p className="text-[11px] text-slate-400">Current load across all fulfillment steps</p>
            </div>
            <span className="text-[10px] text-slate-400">{analytics?.total_orders || 0} Total</span>
          </div>

          <div className="h-[280px] w-full pt-2">
            {mounted ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stageData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis type="number" stroke="#64748b" tick={{ fontSize: 11 }} />
                <YAxis dataKey="stage" type="category" stroke="#94a3b8" tick={{ fontSize: 10 }} width={85} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#090d16', borderColor: '#334155', fontSize: '11px', fontFamily: 'monospace' }}
                />
                <Bar dataKey="count" name="Order Count" fill="#8b5cf6" radius={[0, 4, 4, 0]}>
                  {stageData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-slate-500 font-mono">Loading stage breakdown...</div>
            )}
          </div>
        </div>
      </div>

      {/* CHARTS GRID — ROW 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* CHART 3: SKU INVENTORY VS REORDER POINT */}
        <div className="lg:col-span-8 bg-[#0c1222] border border-slate-800 rounded-xl p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                SKU Stock Levels vs Reorder Point (ROP)
              </h3>
              <p className="text-[11px] text-slate-400">
                Available vs Reserved vs Damaged stock with ROP thresholds
              </p>
            </div>
            <span className="text-[10px] text-slate-400">8 Managed SKUs</span>
          </div>

          <div className="h-[280px] w-full pt-2">
            {mounted ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={skuData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="name" stroke="#64748b" tick={{ fontSize: 10 }} angle={-15} textAnchor="end" height={40} />
                <YAxis stroke="#64748b" tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#090d16', borderColor: '#334155', fontSize: '11px', fontFamily: 'monospace' }}
                />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                <Bar dataKey="available" name="Available Units" fill="#06b6d4" stackId="a" />
                <Bar dataKey="reserved" name="Reserved Units" fill="#3b82f6" stackId="a" />
                <Bar dataKey="damaged" name="Damaged (Quarantine)" fill="#ef4444" stackId="a" />
                <Bar dataKey="reorder_point" name="Reorder Point (ROP)" fill="#f59e0b" />
              </BarChart>
            </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-slate-500 font-mono">Loading inventory distribution...</div>
            )}
          </div>
        </div>

        {/* CHART 4: REVENUE & VOLUME BY CUSTOMER TIER */}
        <div className="lg:col-span-4 bg-[#0c1222] border border-slate-800 rounded-xl p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                Customer Tier Split
              </h3>
              <p className="text-[11px] text-slate-400">VIP vs Premium vs Standard demand</p>
            </div>
          </div>

          <div className="h-[200px] w-full pt-2">
            {mounted ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={tierData}
                  cx="50%"
                  cy="50%"
                  innerRadius={45}
                  outerRadius={75}
                  paddingAngle={4}
                  dataKey="count"
                  nameKey="tier"
                >
                  {tierData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={TIER_COLORS[index % TIER_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ backgroundColor: '#090d16', borderColor: '#334155', fontSize: '11px', fontFamily: 'monospace' }}
                />
              </PieChart>
            </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-slate-500 font-mono">Loading tier chart...</div>
            )}
          </div>

          {/* Tier Legend Breakdown */}
          <div className="space-y-1.5 pt-2 border-t border-slate-800 text-xs font-mono">
            {tierData.map((t, idx) => (
              <div key={idx} className="flex items-center justify-between text-[11px]">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: TIER_COLORS[idx % TIER_COLORS.length] }} />
                  <span className="text-slate-300">{t.tier}</span>
                </div>
                <span className="font-bold text-white">
                  {t.count} orders (${t.value.toFixed(0)})
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* BOTTLENECK DIAGNOSTICS & RESOLUTION MATRIX */}
      <div className="bg-[#0c1222] border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex items-center gap-2">
          <span className="text-base">🚨</span>
          <h3 className="text-xs font-bold uppercase tracking-wider text-amber-300">
            Realtime Operational Bottlenecks & Anomaly Diagnostics
          </h3>
        </div>

        {analytics?.bottlenecks && analytics.bottlenecks.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {analytics.bottlenecks.map((bn, idx) => (
              <div
                key={idx}
                className="bg-slate-900/90 border border-amber-500/20 rounded-xl p-3.5 space-y-2 text-xs"
              >
                <div className="flex items-center justify-between">
                  <span className="text-amber-400 font-bold text-[10px] uppercase">
                    Anomaly Diagnostic #{idx + 1}
                  </span>
                  <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    ATTENTION NEEDED
                  </span>
                </div>
                <p className="text-slate-200 font-medium">{bn}</p>
                <div className="text-[10px] text-cyan-400 pt-1 border-t border-slate-800/80">
                  Recommended: Trigger reallocation wave or expedite workstation batching.
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-emerald-950/20 border border-emerald-500/30 rounded-xl p-4 text-xs text-emerald-300 flex items-center gap-2">
            <span>✓</span>
            <span>All warehouse subsystems operating at nominal throughput. Zero critical bottlenecks detected.</span>
          </div>
        )}
      </div>
    </div>
  );
}
