'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Order,
  OrderStatus,
  OrderChannel,
  OrderItem,
  Inventory,
  DecisionEvent,
  Exception,
  AnalyticsSummary,
  Product,
  Customer,
} from '@/lib/types';
import { DEMO_PRODUCTS, DEMO_CUSTOMERS, DEMO_SCENARIOS } from '@/lib/seed-data';
import PickingStation from '@/components/workstations/PickingStation';
import PackingStation from '@/components/workstations/PackingStation';
import QualityStation from '@/components/workstations/QualityStation';
import DispatchStation from '@/components/workstations/DispatchStation';
import GodModeSimulator from '@/components/simulator/GodModeSimulator';
import AnalyticsDashboard from '@/components/analytics/AnalyticsDashboard';
import DecisionGraphExplorer from '@/components/decision-graph/DecisionGraphExplorer';
import HudTelemetryTicker from '@/components/hud/HudTelemetryTicker';
import LiveDemoPresenter from '@/components/hud/LiveDemoPresenter';
import KeyboardShortcutsModal from '@/components/hud/KeyboardShortcutsModal';
import { jarvisAudio } from '@/components/hud/JarvisAudio';
import JarvisCinematicOverlay from '@/components/hud/JarvisCinematicOverlay';
import type { CinematicMetrics } from '@/components/hud/JarvisCinematicOverlay';

interface OrderWithExtras extends Order {
  items: OrderItem[];
  sla_risk?: {
    at_risk: boolean;
    hours_remaining: number;
    risk_level: 'none' | 'warning' | 'critical';
  };
}

export default function ControlTowerPage() {
  // Core state
  const [orders, setOrders] = useState<OrderWithExtras[]>([]);
  const [inventory, setInventory] = useState<Inventory[]>([]);
  const [decisions, setDecisions] = useState<DecisionEvent[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);
  const [selectedScenario, setSelectedScenario] = useState<string>('scenario-3');
  const [activeTab, setActiveTab] = useState<'all' | 'urgent' | 'allocated' | 'workstations' | 'completed'>('all');
  const [selectedStageFilter, setSelectedStageFilter] = useState<string | null>(null);
  const [activeNav, setActiveNav] = useState<string>('control-tower');
  const [selectedOrder, setSelectedOrder] = useState<OrderWithExtras | null>(null);
  const [orderDecisions, setOrderDecisions] = useState<DecisionEvent[]>([]);
  
  // HUD & Presentation States (Checkpoint 20)
  const [presentationMode, setPresentationMode] = useState<boolean>(false);
  const [demoPresenterOpen, setDemoPresenterOpen] = useState<boolean>(false);
  const [shortcutsOpen, setShortcutsOpen] = useState<boolean>(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);

  // Cinematic Mode State (Checkpoint 19)
  const [cinematicActive, setCinematicActive] = useState<boolean>(false);
  const [cinematicMetrics, setCinematicMetrics] = useState<CinematicMetrics | null>(null);

  // Active Presentation / J.A.R.V.I.S Mode
  const isPresentationMode = presentationMode || demoPresenterOpen || cinematicActive;

  // UI states
  const [loading, setLoading] = useState<boolean>(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'info' | 'warning' | 'error' } | null>(null);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());
  const [mounted, setMounted] = useState<boolean>(false);

  useEffect(() => {
    setMounted(true);
    setSoundEnabled(jarvisAudio.isEnabled());
  }, []);

  const showToast = (text: string, type: 'success' | 'info' | 'warning' | 'error' = 'info') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 4000);
  };

  const handleToggleSound = () => {
    const nextState = jarvisAudio.toggle();
    setSoundEnabled(nextState);
    showToast(`J.A.R.V.I.S Audio FX: ${nextState ? 'ONLINE (Audio FX Active)' : 'MUTED'}`, 'info');
  };

  // ─── Cinematic Mode Trigger (Checkpoint 19) ──────────────────────────
  const triggerCinematic = useCallback(() => {
    // Build metrics snapshot from current state
    const fulfillmentRate = analytics?.fulfillment_rate ?? 0;
    const slaRiskCount = analytics?.sla_risk_orders ?? 0;
    const slaStatus = slaRiskCount > 0 ? `${slaRiskCount} AT RISK` : 'ON TRACK';
    const totalReserved = inventory.reduce((s, inv) => s + inv.reserved_quantity, 0);
    const inventoryImpact = `${totalReserved} units reserved`;
    const allocationPct = analytics?.allocation_rate ?? 0;
    const efficiency = `${Math.round(allocationPct * 100)}%`;

    setCinematicMetrics({
      fulfillmentRate,
      slaStatus,
      inventoryImpact,
      efficiency,
      ordersProcessed: orders.length,
      allocationsResolved: orders.filter(o =>
        o.status !== 'CREATED' && o.status !== 'PRIORITY_SET'
      ).length,
      decisionsLogged: decisions.length,
    });
    setCinematicActive(true);
  }, [analytics, inventory, orders, decisions]);

  const handleCinematicComplete = useCallback(() => {
    setCinematicActive(false);
    setCinematicMetrics(null);
  }, []);

  // Fetch all warehouse telemetry
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [ordersRes, invRes, decRes, anaRes] = await Promise.all([
        fetch('/api/orders'),
        fetch('/api/inventory'),
        fetch('/api/decisions'),
        fetch('/api/analytics'),
      ]);

      const [ordersData, invData, decData, anaData] = await Promise.all([
        ordersRes.json(),
        invRes.json(),
        decRes.json(),
        anaRes.json(),
      ]);

      if (ordersData.success) setOrders(ordersData.data || []);
      if (invData.success) setInventory(invData.data || []);
      if (decData.success) {
        const sortedDecs = [...(decData.data || [])].sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
        setDecisions(sortedDecs);
      }
      if (anaData.success) setAnalytics(anaData.data || null);

      setLastRefreshed(new Date());
    } catch (err) {
      console.error('Failed to fetch warehouse telemetry:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-refresh interval
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchData();
    }, 6000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchData]);

  // Load decision chain when an order is selected
  useEffect(() => {
    if (!selectedOrder) {
      setOrderDecisions([]);
      return;
    }
    fetch(`/api/decisions?order_id=${selectedOrder.id}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setOrderDecisions(data.data || []);
        }
      })
      .catch((err) => console.error('Failed to load order decisions', err));
  }, [selectedOrder]);

  // Actions
  const handleSeed = async (scenarioId: string) => {
    try {
      setActionLoading('seed');
      jarvisAudio.playBoot();
      const res = await fetch('/api/seed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario_id: scenarioId }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(`Initialized: ${data.message}`, 'success');
        await fetchData();
        // Checkpoint 19: Trigger cinematic after seed
        setTimeout(() => triggerCinematic(), 300);
      } else {
        showToast(data.error || 'Seeding failed', 'error');
      }
    } catch (err) {
      showToast('Network error during seeding', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRunAllocation = async () => {
    try {
      setActionLoading('allocation');
      jarvisAudio.playArcReactor();
      const res = await fetch('/api/allocation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.success) {
        const summary = data.data?.summary;
        if (summary?.shortages > 0) {
          jarvisAudio.playAlert();
        } else {
          jarvisAudio.playConfirm();
        }
        showToast(
          `Allocation complete: ${summary?.fullyAllocated || 0} full, ${summary?.partialAllocated || 0} partial, ${summary?.shortages || 0} shortages detected`,
          summary?.shortages > 0 ? 'warning' : 'success'
        );
        await fetchData();
        // Checkpoint 19: Trigger cinematic after major allocation
        setTimeout(() => triggerCinematic(), 300);
      } else {
        showToast(data.error || 'Allocation failed', 'error');
      }
    } catch (err) {
      showToast('Network error during allocation', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleAdvancePipeline = async () => {
    try {
      setActionLoading('pipeline');
      jarvisAudio.playConfirm();
      const res = await fetch('/api/pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.success) {
        showToast(`Advanced ${data.data?.advanced || 0} orders across fulfillment stages`, 'info');
        await fetchData();
      } else {
        showToast(data.error || 'Pipeline advance failed', 'error');
      }
    } catch (err) {
      showToast('Network error during pipeline step', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleMarkDamaged = async (invId: string) => {
    try {
      setActionLoading('damage');
      jarvisAudio.playAlert();
      const res = await fetch('/api/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'damage',
          inventory_id: invId,
          quantity: 1,
          reason: 'Manual warehouse quality flag: Damaged during transit',
        }),
      });
      const data = await res.json();
      if (data.success) {
        showToast('Inventory unit quarantined as damaged', 'warning');
        await fetchData();
      } else {
        showToast(data.error || 'Action failed', 'error');
      }
    } catch (err) {
      showToast('Network error', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  // Keyboard Shortcuts Listener for Hackathon Presenters
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return;

      if (e.key === 'd' || e.key === 'D') {
        e.preventDefault();
        setDemoPresenterOpen((prev) => !prev);
        jarvisAudio.playBlip(750, 0.08);
      } else if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        e.preventDefault();
        setShortcutsOpen((prev) => !prev);
        jarvisAudio.playBlip(600, 0.08);
      } else if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        handleToggleSound();
      } else if (e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        handleRunAllocation();
      } else if (e.key === 'p' || e.key === 'P') {
        e.preventDefault();
        handleAdvancePipeline();
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        fetchData();
        jarvisAudio.playBlip(900, 0.05);
      } else if (e.key === '1') {
        setActiveNav('control-tower');
        jarvisAudio.playBlip(500, 0.04);
      } else if (e.key === '2') {
        setActiveNav('orders');
        setActiveTab('all');
        jarvisAudio.playBlip(550, 0.04);
      } else if (e.key === '3') {
        setActiveNav('inventory');
        jarvisAudio.playBlip(600, 0.04);
      } else if (e.key === '4') {
        setActiveNav('picking');
        jarvisAudio.playBlip(650, 0.04);
      } else if (e.key === '5') {
        setActiveNav('packing');
        jarvisAudio.playBlip(700, 0.04);
      } else if (e.key === '6') {
        setActiveNav('quality');
        jarvisAudio.playBlip(750, 0.04);
      } else if (e.key === '7') {
        setActiveNav('dispatch');
        jarvisAudio.playBlip(800, 0.04);
      } else if (e.key === '8') {
        setActiveNav('decisions');
        jarvisAudio.playBlip(850, 0.04);
      } else if (e.key === '9') {
        setActiveNav('analytics');
        jarvisAudio.playBlip(900, 0.04);
      } else if (e.key === '0') {
        setActiveNav('decision-graph');
        jarvisAudio.playBlip(950, 0.04);
      } else if (e.key === 's' || e.key === 'S') {
        setActiveNav('simulator');
        jarvisAudio.playBlip(1000, 0.04);
      } else if (e.key === 'Escape') {
        setSelectedOrder(null);
        setShortcutsOpen(false);
        // Checkpoint 19: Allow Escape to dismiss cinematic if active
        if (cinematicActive) {
          setCinematicActive(false);
          setCinematicMetrics(null);
        }
      } else if (e.key === 'c' || e.key === 'C') {
        // Checkpoint 19: Manual cinematic trigger for demo
        e.preventDefault();
        if (!cinematicActive) {
          triggerCinematic();
        }
      } else if (e.key === 't' || e.key === 'T') {
        // Checkpoint 20: Toggle STARK Presentation Mode
        e.preventDefault();
        setPresentationMode((prev) => {
          const next = !prev;
          jarvisAudio.playBlip(next ? 850 : 500, 0.08);
          showToast(
            next
              ? 'STARK PRESENTATION / J.A.R.V.I.S MODE: ACTIVE'
              : 'NORMAL MODE: ACTIVE (Standard Warehouse Labels)',
            'info'
          );
          return next;
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [fetchData]);

  // Derived calculations
  const pipelineStages: { stage: OrderStatus; label: string; count: number }[] = [
    { stage: OrderStatus.CREATED, label: 'Created', count: orders.filter((o) => o.status === OrderStatus.CREATED).length },
    { stage: OrderStatus.PRIORITY_SET, label: 'Prioritized', count: orders.filter((o) => o.status === OrderStatus.PRIORITY_SET).length },
    { stage: OrderStatus.ALLOCATED, label: 'Allocated', count: orders.filter((o) => o.status === OrderStatus.ALLOCATED).length },
    { stage: OrderStatus.PICKING, label: 'Picking', count: orders.filter((o) => o.status === OrderStatus.PICKING).length },
    { stage: OrderStatus.PACKING, label: 'Packing', count: orders.filter((o) => o.status === OrderStatus.PACKING).length },
    { stage: OrderStatus.QUALITY_CHECK, label: 'Quality Check', count: orders.filter((o) => o.status === OrderStatus.QUALITY_CHECK).length },
    { stage: OrderStatus.DISPATCHED, label: 'Dispatched', count: orders.filter((o) => o.status === OrderStatus.DISPATCHED).length },
    { stage: OrderStatus.COMPLETED, label: 'Completed', count: orders.filter((o) => o.status === OrderStatus.COMPLETED).length },
  ];

  const exceptionsCount = orders.filter((o) => o.status === OrderStatus.EXCEPTION).length;
  const urgentOrders = orders.filter((o) => o.sla_risk?.at_risk || o.priority_score >= 80);

  // Filtered orders list
  const filteredOrders = orders.filter((order) => {
    if (selectedStageFilter && order.status !== selectedStageFilter) return false;
    if (activeTab === 'urgent') return order.sla_risk?.at_risk || order.priority_score >= 80;
    if (activeTab === 'allocated') return order.status === OrderStatus.ALLOCATED;
    if (activeTab === 'workstations') {
      return [OrderStatus.PICKING, OrderStatus.PACKING, OrderStatus.QUALITY_CHECK].includes(order.status);
    }
    if (activeTab === 'completed') {
      return [OrderStatus.DISPATCHED, OrderStatus.COMPLETED].includes(order.status);
    }
    return true;
  });

  const getCustomer = (id: string): Customer | undefined => {
    return DEMO_CUSTOMERS.find((c) => c.id === id);
  };

  const getProduct = (id: string): Product | undefined => {
    return DEMO_PRODUCTS.find((p) => p.id === id);
  };

  const formatHoursLeft = (deadline: string) => {
    const diff = (new Date(deadline).getTime() - Date.now()) / (1000 * 60 * 60);
    if (diff <= 0) return 'Breached';
    if (diff < 24) return `${diff.toFixed(1)}h remaining`;
    return `${Math.round(diff / 24)}d remaining`;
  };

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 flex flex-col antialiased">
      {/* Toast Notification */}
      {toastMessage && (
        <div
          className={`fixed top-4 right-4 z-50 flex items-center gap-3 px-4 py-3 rounded-lg shadow-2xl border text-sm font-medium transition-all ${
            toastMessage.type === 'success'
              ? 'bg-emerald-950/90 border-emerald-500/50 text-emerald-200'
              : toastMessage.type === 'warning'
              ? 'bg-amber-950/90 border-amber-500/50 text-amber-200'
              : toastMessage.type === 'error'
              ? 'bg-rose-950/90 border-rose-500/50 text-rose-200'
              : 'bg-cyan-950/90 border-cyan-500/50 text-cyan-200'
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-current animate-ping" />
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* TOP STREAMING HUD TELEMETRY TICKER */}
      <HudTelemetryTicker
        ordersCount={orders.length}
        slaRiskCount={urgentOrders.length}
        allocationRate={analytics?.allocation_rate || 0}
        decisionsCount={decisions.length}
        damagedCount={analytics?.damaged_inventory || 0}
        soundEnabled={soundEnabled}
        isPresentationMode={isPresentationMode}
        onToggleSound={handleToggleSound}
        onOpenShortcuts={() => setShortcutsOpen(true)}
      />

      {/* TOP COMMAND HEADER */}
      <header className="border-b border-slate-800 bg-[#0c1222]/90 backdrop-blur sticky top-0 z-40 px-6 py-3">
        <div className="max-w-[1700px] mx-auto flex flex-wrap items-center justify-between gap-4">
          {/* Logo & Operational Status */}
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20 font-mono font-bold text-black text-lg">
              ⚡
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold tracking-tight text-white uppercase font-mono">
                  STARK INDUSTRIES WAREHOUSE
                </h1>
                <span className="px-2 py-0.5 text-[10px] font-mono tracking-wider font-semibold rounded bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
                  {isPresentationMode ? 'J.A.R.V.I.S WMS ACTIVE' : 'WAREHOUSE WMS ONLINE'}
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono">
                {isPresentationMode
                  ? 'AI-Powered Warehouse Operations & Deterministic Decision Intelligence'
                  : 'Warehouse Operations & Deterministic Decision Intelligence'}
              </p>
            </div>
          </div>

          {/* Quick Actions & Scenario Injector */}
          <div className="flex items-center flex-wrap gap-2.5">
            {/* STARK Presentation Mode / Normal Mode Toggle (Checkpoint 20) */}
            <button
              onClick={() => {
                const next = !presentationMode;
                setPresentationMode(next);
                jarvisAudio.playBlip(next ? 850 : 500, 0.08);
                showToast(
                  next
                    ? 'STARK PRESENTATION / J.A.R.V.I.S MODE: ACTIVE'
                    : 'NORMAL MODE: ACTIVE (Standard Warehouse Labels)',
                  'info'
                );
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold border transition flex items-center gap-1.5 ${
                isPresentationMode
                  ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 shadow-md shadow-cyan-950/50'
                  : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200'
              }`}
              title="Toggle STARK Presentation Mode / Normal Warehouse Mode [Hotkey: T]"
            >
              <span>{isPresentationMode ? '⚡ STARK MODE' : '🏢 NORMAL MODE'}</span>
              <span className={`w-1.5 h-1.5 rounded-full ${isPresentationMode ? 'bg-cyan-400 animate-ping' : 'bg-slate-600'}`} />
            </button>

            {/* Live Keynote Demo Controller Launcher */}
            <button
              onClick={() => {
                setDemoPresenterOpen(!demoPresenterOpen);
                jarvisAudio.playBlip(800, 0.08);
              }}
              className="px-3 py-1.5 bg-gradient-to-r from-amber-500 via-orange-500 to-rose-600 hover:from-amber-400 hover:to-rose-500 text-black font-bold text-xs rounded-lg shadow-lg shadow-amber-500/25 flex items-center gap-1.5 transition animate-pulse"
              title="Open Interactive Live Demo & Keynote Presenter [Hotkey: D]"
            >
              <span>🎬</span>
              <span>LIVE DEMO PLAYBOOK</span>
            </button>

            {/* Scenario Picker */}
            <div className="flex items-center bg-slate-900/90 border border-slate-700/80 rounded-lg p-1">
              <span className="text-xs font-mono text-slate-400 px-2">Scenario:</span>
              <select
                value={selectedScenario}
                onChange={(e) => setSelectedScenario(e.target.value)}
                className="bg-slate-800 text-xs font-mono text-slate-200 border-none rounded px-2.5 py-1 focus:ring-1 focus:ring-cyan-500 outline-none"
              >
                {DEMO_SCENARIOS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
                <option value="all">⚡ All 6 Scenarios Combined</option>
              </select>
              <button
                onClick={() => handleSeed(selectedScenario)}
                disabled={actionLoading === 'seed'}
                className="ml-1.5 px-3 py-1 bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-800 text-black font-semibold text-xs rounded transition flex items-center gap-1.5 shadow-sm"
              >
                {actionLoading === 'seed' ? (
                  <span className="animate-spin text-[10px]">⏳</span>
                ) : (
                  <span>🚀</span>
                )}
                <span>Prime / Reset</span>
              </button>
            </div>

            {/* Core Decision Actions */}
            <button
              onClick={handleRunAllocation}
              disabled={actionLoading === 'allocation'}
              className="px-3 py-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 text-white text-xs font-medium rounded-lg border border-blue-400/30 shadow-md shadow-blue-900/30 flex items-center gap-1.5 transition"
              title="Resolve Allocation [Hotkey: A]"
            >
              <span>🧠</span>
              <span>Resolve Allocation</span>
            </button>

            <button
              onClick={handleAdvancePipeline}
              disabled={actionLoading === 'pipeline'}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 text-xs font-medium rounded-lg border border-slate-700 flex items-center gap-1.5 transition"
              title="Advance Pipeline Step [Hotkey: P]"
            >
              <span>⏩</span>
              <span>Advance Pipeline Step</span>
            </button>

            <button
              onClick={() => {
                fetchData();
                jarvisAudio.playBlip(900, 0.05);
              }}
              disabled={loading}
              className="p-2 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-lg border border-slate-700/80 text-xs transition"
              title="Refresh Live Data [Hotkey: R]"
            >
              <span className={loading ? 'animate-spin inline-block' : ''}>🔄</span>
            </button>

            {/* Auto-Refresh Toggle */}
            <button
              onClick={() => {
                setAutoRefresh(!autoRefresh);
                jarvisAudio.playBlip(600, 0.05);
              }}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-mono border transition flex items-center gap-1.5 ${
                autoRefresh
                  ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-400'
                  : 'bg-slate-900 border-slate-700 text-slate-400'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${autoRefresh ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
              <span>{autoRefresh ? 'Live (6s)' : 'Paused'}</span>
            </button>
          </div>
        </div>

        {/* WORKSPACE NAVIGATION BAR (Checkpoint 20: Dynamic Labels) */}
        <div className="max-w-[1700px] mx-auto mt-3 pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs font-medium">
          <nav className="flex items-center gap-1 overflow-x-auto pb-1">
            {[
              { id: 'control-tower', label: isPresentationMode ? 'MISSION CONTROL' : 'Orders', icon: isPresentationMode ? '📡' : '📦' },
              { id: 'inventory', label: isPresentationMode ? 'INVENTORY' : 'Inventory', icon: '🏬', badge: inventory.length },
              { id: 'picking', label: isPresentationMode ? 'FIELD DEPLOYMENT' : 'Picking', icon: '🚜', badge: analytics?.picking_backlog },
              { id: 'packing', label: isPresentationMode ? 'PACKING BAY' : 'Packing', icon: '🎁', badge: analytics?.packing_backlog },
              { id: 'quality', label: isPresentationMode ? 'SUIT INSPECTION' : 'Quality', icon: '🔍', badge: orders.filter(o => o.status === OrderStatus.QUALITY_CHECK).length },
              { id: 'dispatch', label: isPresentationMode ? 'LAUNCH SEQUENCE' : 'Dispatch', icon: '🚀', badge: analytics?.dispatch_backlog },
              { id: 'decisions', label: isPresentationMode ? 'J.A.R.V.I.S ENGINE' : 'AI Decision Engine', icon: '📜', badge: decisions.length },
              { id: 'analytics', label: isPresentationMode ? 'STARK INTEL' : 'Analytics', icon: '📊' },
              { id: 'decision-graph', label: isPresentationMode ? 'DECISION GRAPH' : 'Decision Analysis', icon: '🌳' },
              { id: 'simulator', label: isPresentationMode ? 'GOD MODE' : 'Operational Simulation', icon: '🎮' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveNav(tab.id);
                  if (tab.id === 'control-tower') setActiveTab('all');
                  jarvisAudio.playBlip(700, 0.04);
                }}
                className={`px-3 py-1.5 rounded-md transition flex items-center gap-1.5 whitespace-nowrap ${
                  activeNav === tab.id || (tab.id === 'control-tower' && activeNav === 'orders')
                    ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 font-semibold'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
                {tab.badge !== undefined && tab.badge > 0 && (
                  <span className="ml-1 px-1.5 py-0.2 text-[10px] font-mono rounded-full bg-slate-800 border border-slate-700 text-slate-300">
                    {tab.badge}
                  </span>
                )}
              </button>
            ))}
          </nav>
          <div className="hidden lg:flex items-center gap-3 text-[11px] font-mono text-slate-400">
            <span>Last Sync: {mounted ? lastRefreshed.toLocaleTimeString() : 'Live Connected'}</span>
          </div>
        </div>
      </header>

      {/* MAIN BODY CONTENT */}
      <main className="flex-1 max-w-[1700px] w-full mx-auto p-6 space-y-6">
        {/* DEDICATED WORKSTATION VIEWS */}
        {activeNav === 'picking' && (
          <PickingStation onRefreshParent={fetchData} showToast={showToast} isPresentationMode={isPresentationMode} />
        )}

        {activeNav === 'packing' && (
          <PackingStation onRefreshParent={fetchData} showToast={showToast} isPresentationMode={isPresentationMode} />
        )}

        {activeNav === 'quality' && (
          <QualityStation onRefreshParent={fetchData} showToast={showToast} isPresentationMode={isPresentationMode} />
        )}

        {activeNav === 'dispatch' && (
          <DispatchStation onRefreshParent={fetchData} showToast={showToast} isPresentationMode={isPresentationMode} />
        )}

        {/* GOD MODE / WHAT-IF SIMULATOR */}
        {activeNav === 'simulator' && (
          <GodModeSimulator onRefreshParent={fetchData} showToast={showToast} isPresentationMode={isPresentationMode} />
        )}

        {/* INTERACTIVE DECISION GRAPH */}
        {activeNav === 'decision-graph' && (
          <DecisionGraphExplorer onRefreshParent={fetchData} showToast={showToast} isPresentationMode={isPresentationMode} />
        )}

        {/* OPERATIONAL ANALYTICS + TREND CHARTS */}
        {activeNav === 'analytics' && (
          <AnalyticsDashboard onRefreshParent={fetchData} showToast={showToast} isPresentationMode={isPresentationMode} />
        )}

        {/* DEFAULT: CONTROL TOWER DASHBOARD */}
        {!['picking', 'packing', 'quality', 'dispatch', 'simulator', 'analytics', 'decision-graph'].includes(activeNav) && (
          <>
        {/* TOP LEVEL METRICS GRID */}
        <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
          {/* Total Orders */}
          <div className="hud-panel bg-[#0f172a]/90 border border-slate-800 rounded-xl p-4 flex flex-col justify-between relative overflow-hidden shadow-sm">
            <div className="flex items-center justify-between text-slate-400 text-xs font-mono">
              <span>ACTIVE ORDERS</span>
              <span className="text-slate-500">📦</span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold font-mono text-white">{orders.length}</span>
              <span className="text-xs text-slate-400 font-mono">
                ({orders.filter((o) => o.status === OrderStatus.COMPLETED).length} fulfilled)
              </span>
            </div>
            <div className="mt-2 text-[11px] text-slate-400 flex items-center gap-1.5 font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
              <span>{orders.filter((o) => o.status !== OrderStatus.COMPLETED && o.status !== OrderStatus.CANCELLED).length} in flight</span>
            </div>
          </div>

          {/* Urgent & SLA Risks */}
          <div className="hud-panel bg-[#0f172a]/90 border border-slate-800 rounded-xl p-4 flex flex-col justify-between relative overflow-hidden shadow-sm">
            <div className="flex items-center justify-between text-slate-400 text-xs font-mono">
              <span>SLA RISK / URGENT</span>
              <span className="text-amber-400">⚠️</span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold font-mono text-amber-400">{urgentOrders.length}</span>
              <span className="text-xs text-amber-400/80 font-mono">orders</span>
            </div>
            <div className="mt-2 text-[11px] text-amber-400/80 flex items-center gap-1.5 font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
              <span>Priority threshold ≥ 80 / &lt;24h</span>
            </div>
          </div>

          {/* Allocation & Shortages */}
          <div className="hud-panel bg-[#0f172a]/90 border border-slate-800 rounded-xl p-4 flex flex-col justify-between relative overflow-hidden shadow-sm">
            <div className="flex items-center justify-between text-slate-400 text-xs font-mono">
              <span>ALLOCATION RATE</span>
              <span className="text-cyan-400">⚡</span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold font-mono text-cyan-300">
                {analytics ? `${Math.round(analytics.allocation_rate * 100)}%` : '0%'}
              </span>
              <span className="text-xs text-slate-400 font-mono">
                ({analytics?.partial_allocations || 0} partial)
              </span>
            </div>
            <div className="mt-2 text-[11px] text-slate-400 font-mono truncate">
              {exceptionsCount > 0 ? `${exceptionsCount} exception(s) logged` : 'Optimal allocation pool'}
            </div>
          </div>

          {/* Backlog Pipeline */}
          <div className="hud-panel bg-[#0f172a]/90 border border-slate-800 rounded-xl p-4 flex flex-col justify-between relative overflow-hidden shadow-sm">
            <div className="flex items-center justify-between text-slate-400 text-xs font-mono">
              <span>WORKSTATIONS QUEUE</span>
              <span className="text-indigo-400">⚙️</span>
            </div>
            <div className="mt-2 flex items-baseline gap-1 text-xs font-mono text-slate-200">
              <span className="font-bold text-base text-white">{analytics?.picking_backlog || 0}</span>
              <span className="text-slate-400">Pick</span> •
              <span className="font-bold text-base text-white">{analytics?.packing_backlog || 0}</span>
              <span className="text-slate-400">Pack</span> •
              <span className="font-bold text-base text-white">{analytics?.dispatch_backlog || 0}</span>
              <span className="text-slate-400">Dock</span>
            </div>
            <div className="mt-2 text-[11px] text-slate-400 font-mono">
              Active workstation tasks
            </div>
          </div>

          {/* Inventory Health */}
          <div className="hud-panel bg-[#0f172a]/90 border border-slate-800 rounded-xl p-4 flex flex-col justify-between relative overflow-hidden shadow-sm">
            <div className="flex items-center justify-between text-slate-400 text-xs font-mono">
              <span>STOCK SCARCITY</span>
              <span className="text-rose-400">🚨</span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold font-mono text-rose-400">
                {analytics?.out_of_stock_products || 0}
              </span>
              <span className="text-xs text-rose-300 font-mono">OOS / {analytics?.low_stock_products || 0} Low</span>
            </div>
            <div className="mt-2 text-[11px] text-slate-400 font-mono">
              {analytics?.damaged_inventory ? `${analytics.damaged_inventory} units damaged` : 'No damage quarantined'}
            </div>
          </div>

          {/* Fulfillment Throughput */}
          <div className="hud-panel bg-[#0f172a]/90 border border-slate-800 rounded-xl p-4 flex flex-col justify-between relative overflow-hidden shadow-sm">
            <div className="flex items-center justify-between text-slate-400 text-xs font-mono">
              <span>FULFILLMENT RATE</span>
              <span className="text-emerald-400">📈</span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold font-mono text-emerald-400">
                {analytics ? `${Math.round(analytics.fulfillment_rate * 100)}%` : '0%'}
              </span>
              <span className="text-xs text-slate-400 font-mono">delivered</span>
            </div>
            <div className="mt-2 text-[11px] text-emerald-400/80 font-mono">
              {orders.filter(o => o.status === OrderStatus.DISPATCHED || o.status === OrderStatus.COMPLETED).length} orders dispatched
            </div>
          </div>
        </section>

        {/* WORKFLOW PIPELINE VISUALIZATION STRIP */}
        <section className="hud-panel bg-[#0c1222] border border-slate-800 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-300">
                End-to-End Fulfillment Pipeline
              </h2>
              <span className="text-[11px] text-slate-500 font-mono">
                (Click any stage to filter queue)
              </span>
            </div>
            {selectedStageFilter && (
              <button
                onClick={() => setSelectedStageFilter(null)}
                className="text-xs font-mono text-cyan-400 hover:underline flex items-center gap-1"
              >
                <span>✕ Clear Filter ({selectedStageFilter})</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
            {pipelineStages.map((st, idx) => {
              const isSelected = selectedStageFilter === st.stage;
              return (
                <button
                  key={st.stage}
                  onClick={() => {
                    setSelectedStageFilter(isSelected ? null : st.stage);
                    jarvisAudio.playBlip(600 + idx * 40, 0.04);
                  }}
                  className={`p-3 rounded-lg border text-left transition relative flex flex-col justify-between ${
                    isSelected
                      ? 'bg-cyan-950/40 border-cyan-500/80 text-cyan-200 shadow-md shadow-cyan-950'
                      : st.count > 0
                      ? 'bg-slate-900/90 border-slate-700/80 hover:border-slate-600 text-slate-200'
                      : 'bg-slate-950/50 border-slate-800/60 text-slate-500 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between text-[11px] font-mono">
                    <span className="text-slate-400 font-semibold">{idx + 1}.</span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${
                        st.count > 0 ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30' : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {st.count}
                    </span>
                  </div>
                  <div className="mt-2 text-xs font-semibold tracking-tight truncate">
                    {st.label}
                  </div>
                  <div className="mt-1 w-full bg-slate-800 h-1 rounded-full overflow-hidden">
                    <div
                      className="bg-cyan-500 h-full transition-all"
                      style={{
                        width: orders.length > 0 ? `${(st.count / orders.length) * 100}%` : '0%',
                      }}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* DETERMINISTIC BOTTLENECK & EXCEPTION ALERTS */}
        {analytics?.bottlenecks && analytics.bottlenecks.length > 0 && (
          <section className="bg-gradient-to-r from-amber-950/40 via-rose-950/20 to-slate-900 border border-amber-500/30 rounded-xl p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-base">🚨</span>
              <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-amber-300">
                Operational Bottlenecks & Anomaly Detection
              </h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 mt-2">
              {analytics.bottlenecks.map((bn, idx) => (
                <div
                  key={idx}
                  className="bg-slate-900/90 border border-amber-500/20 rounded-lg px-3.5 py-2 text-xs text-amber-200/90 font-mono flex items-start gap-2"
                >
                  <span className="text-amber-400 font-bold mt-0.5">•</span>
                  <span>{bn}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* MAIN DUAL CONTROL VIEW */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* LEFT 7 COLS: ORDERS & FULFILLMENT QUEUE */}
          <div className="lg:col-span-7 space-y-6">
            {/* ORDERS TABLE CONTAINER */}
            <div className="hud-panel bg-[#0c1222] border border-slate-800 rounded-xl overflow-hidden shadow-sm">
              {/* Header & Tabs */}
              <div className="p-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-mono font-bold uppercase tracking-wider text-white">
                    {isPresentationMode ? 'MISSION CONTROL // Fulfillment Queue' : 'Fulfillment Orders Queue'}
                  </h3>
                  <span className="text-xs text-slate-400 font-mono">({filteredOrders.length})</span>
                </div>

                {/* Filter Tabs */}
                <div className="flex items-center gap-1 bg-slate-900/90 p-1 rounded-lg border border-slate-800 text-xs font-mono">
                  {[
                    { id: 'all', label: 'All' },
                    { id: 'urgent', label: '⚡ Urgent / SLA' },
                    { id: 'allocated', label: 'Allocated' },
                    { id: 'workstations', label: 'Workstations' },
                    { id: 'completed', label: 'Completed' },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => {
                        setActiveTab(tab.id as any);
                        jarvisAudio.playBlip(700, 0.04);
                      }}
                      className={`px-2.5 py-1 rounded transition ${
                        activeTab === tab.id
                          ? 'bg-slate-800 text-cyan-300 font-semibold border border-slate-700'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-900/80 text-slate-400 font-mono border-b border-slate-800 uppercase text-[11px]">
                    <tr>
                      <th className="py-3 px-4">Order #</th>
                      <th className="py-3 px-4">Customer / Tier</th>
                      <th className="py-3 px-4">Priority Score</th>
                      <th className="py-3 px-4">Items / Allocated</th>
                      <th className="py-3 px-4">SLA Window</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Inspect</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {filteredOrders.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-slate-500 font-mono">
                          No orders matching this filter. Click <span className="text-cyan-400 font-semibold">Prime / Reset</span> above to load demo scenarios.
                        </td>
                      </tr>
                    ) : (
                      filteredOrders.map((order) => {
                        const cust = getCustomer(order.customer_id);
                        const isSlaRisk = order.sla_risk?.at_risk;
                        const isSelected = selectedOrder?.id === order.id;

                        // Total requested vs allocated items
                        const totalReq = (order.items || []).reduce((s, it) => s + it.quantity, 0);
                        const totalAlloc = (order.items || []).reduce((s, it) => s + it.allocated_quantity, 0);
                        const isPartial = totalAlloc > 0 && totalAlloc < totalReq;

                        return (
                          <tr
                            key={order.id}
                            onClick={() => {
                              setSelectedOrder(order);
                              jarvisAudio.playWhoosh();
                            }}
                            className={`cursor-pointer transition ${
                              isSelected
                                ? 'bg-cyan-950/30 text-white'
                                : 'hover:bg-slate-900/60 text-slate-300'
                            }`}
                          >
                            {/* Order Number */}
                            <td className="py-3 px-4">
                              <div className="font-bold text-white flex items-center gap-1.5">
                                <span>{order.order_number}</span>
                                {order.priority_score >= 80 && (
                                  <span className="text-[10px] px-1 bg-rose-500/20 text-rose-300 rounded border border-rose-500/30">
                                    VIP
                                  </span>
                                )}
                              </div>
                              <div className="text-[10px] text-slate-500">
                                {order.channel} • ${order.total_value.toFixed(2)}
                              </div>
                            </td>

                            {/* Customer & Tier */}
                            <td className="py-3 px-4">
                              <div className="font-medium text-slate-200 truncate max-w-[140px]">
                                {cust?.name || 'Customer'}
                              </div>
                              <span
                                className={`text-[10px] px-1.5 py-0.2 rounded font-semibold uppercase ${
                                  cust?.tier === 'vip'
                                    ? 'bg-purple-950/80 text-purple-300 border border-purple-500/40'
                                    : cust?.tier === 'premium'
                                    ? 'bg-blue-950/80 text-blue-300 border border-blue-500/40'
                                    : 'bg-slate-800 text-slate-400'
                                }`}
                              >
                                {cust?.tier || 'standard'}
                              </span>
                            </td>

                            {/* Priority Score */}
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-2">
                                <div
                                  className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs ${
                                    order.priority_score >= 80
                                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                                      : order.priority_score >= 60
                                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                      : 'bg-slate-800 text-slate-300 border border-slate-700'
                                  }`}
                                >
                                  {Math.round(order.priority_score)}
                                </div>
                                <div className="text-[10px] text-slate-400 leading-tight">
                                  {order.priority_score >= 80
                                    ? 'Critical'
                                    : order.priority_score >= 60
                                    ? 'High'
                                    : 'Normal'}
                                </div>
                              </div>
                            </td>

                            {/* Items & Allocation Progress */}
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-slate-200">
                                  {totalAlloc}/{totalReq} units
                                </span>
                                {isPartial && (
                                  <span className="text-[9px] px-1 bg-amber-500/20 text-amber-300 rounded border border-amber-500/30">
                                    PARTIAL
                                  </span>
                                )}
                              </div>
                              <div className="text-[10px] text-slate-500 truncate max-w-[150px]">
                                {(order.items || []).map((it) => {
                                  const p = getProduct(it.product_id);
                                  return `${p?.name.slice(0, 10) || 'Item'} (${it.quantity})`;
                                }).join(', ')}
                              </div>
                            </td>

                            {/* SLA Window */}
                            <td className="py-3 px-4">
                              <div
                                className={`text-xs font-semibold flex items-center gap-1 ${
                                  isSlaRisk ? 'text-amber-400' : 'text-slate-300'
                                }`}
                              >
                                {isSlaRisk && <span>⚠️</span>}
                                <span>{formatHoursLeft(order.sla_deadline)}</span>
                              </div>
                              <div className="text-[10px] text-slate-500">
                                {new Date(order.sla_deadline).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit' })}
                              </div>
                            </td>

                            {/* Status */}
                            <td className="py-3 px-4">
                              <span
                                className={`px-2 py-1 rounded text-[10px] font-semibold uppercase ${
                                  order.status === OrderStatus.COMPLETED
                                    ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-500/30'
                                    : order.status === OrderStatus.DISPATCHED
                                    ? 'bg-blue-950/80 text-blue-300 border border-blue-500/30'
                                    : order.status === OrderStatus.EXCEPTION
                                    ? 'bg-rose-950/80 text-rose-300 border border-rose-500/40 animate-pulse'
                                    : order.status === OrderStatus.ALLOCATED
                                    ? 'bg-cyan-950/80 text-cyan-300 border border-cyan-500/30'
                                    : 'bg-slate-800 text-slate-300 border border-slate-700'
                                }`}
                              >
                                {order.status.replace('_', ' ')}
                              </span>
                            </td>

                            {/* Action Button */}
                            <td className="py-3 px-4 text-right">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedOrder(order);
                                  jarvisAudio.playWhoosh();
                                }}
                                className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-cyan-400 text-[11px] rounded border border-slate-700 transition"
                              >
                                Trace 🔍
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* INVENTORY SCARCITY & PHYSICAL STOCK GRID */}
            <div className="hud-panel bg-[#0c1222] border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-mono font-bold uppercase tracking-wider text-white">
                    {isPresentationMode ? 'INVENTORY // Warehouse Stock Pools' : 'Warehouse Inventory & Stock Pools'}
                  </h3>
                  <p className="text-xs text-slate-400 font-mono">
                    Deterministic stock reservation, damaged item quarantine, and reorder triggers.
                  </p>
                </div>
                <span className="text-xs font-mono text-slate-400">
                  {inventory.length} Stock Locations
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {DEMO_PRODUCTS.map((prod) => {
                  const pools = inventory.filter((i) => i.product_id === prod.id);
                  const totalOnHand = pools.reduce((s, i) => s + i.quantity, 0);
                  const totalAvail = pools.reduce((s, i) => s + i.available_quantity, 0);
                  const totalRes = pools.reduce((s, i) => s + i.reserved_quantity, 0);
                  const totalDamaged = pools.reduce((s, i) => s + i.damaged_quantity, 0);

                  const isOOS = totalAvail === 0;
                  const isLow = totalAvail > 0 && totalAvail <= prod.reorder_point;

                  return (
                    <div
                      key={prod.id}
                      className={`p-3.5 rounded-xl border flex flex-col justify-between transition ${
                        isOOS
                          ? 'bg-rose-950/20 border-rose-500/40 text-rose-100'
                          : isLow
                          ? 'bg-amber-950/20 border-amber-500/40 text-amber-100'
                          : 'bg-slate-900/80 border-slate-800 text-slate-200'
                      }`}
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <span className="text-[10px] font-mono text-slate-400 uppercase">
                              {prod.category} • {prod.sku}
                            </span>
                            <h4 className="text-xs font-bold font-mono text-white mt-0.5 truncate max-w-[180px]">
                              {prod.name}
                            </h4>
                          </div>
                          <span
                            className={`px-1.5 py-0.5 text-[9px] font-mono font-bold rounded uppercase ${
                              isOOS
                                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                                : isLow
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                            }`}
                          >
                            {isOOS ? 'DEPLETED' : isLow ? 'LOW STOCK' : 'AVAILABLE'}
                          </span>
                        </div>

                        {/* Quantity Breakdown */}
                        <div className="grid grid-cols-4 gap-1 text-center mt-3 bg-slate-950/60 p-2 rounded-lg font-mono text-xs border border-slate-800/80">
                          <div>
                            <div className="text-[10px] text-slate-500">Avail</div>
                            <div className={`font-bold ${isOOS ? 'text-rose-400' : isLow ? 'text-amber-400' : 'text-cyan-300'}`}>
                              {totalAvail}
                            </div>
                          </div>
                          <div>
                            <div className="text-[10px] text-slate-500">Rsrv</div>
                            <div className="font-semibold text-slate-300">{totalRes}</div>
                          </div>
                          <div>
                            <div className="text-[10px] text-slate-500">Dmg</div>
                            <div className={`font-semibold ${totalDamaged > 0 ? 'text-rose-400' : 'text-slate-500'}`}>
                              {totalDamaged}
                            </div>
                          </div>
                          <div>
                            <div className="text-[10px] text-slate-500">ROP</div>
                            <div className="font-semibold text-slate-400">{prod.reorder_point}</div>
                          </div>
                        </div>
                      </div>

                      {/* Action to test damage / quarantine */}
                      {pools[0] && totalAvail > 0 && (
                        <div className="mt-3 pt-2 border-t border-slate-800/60 flex items-center justify-between text-[10px] font-mono">
                          <span className="text-slate-500">${prod.unit_price} / unit</span>
                          <button
                            onClick={() => handleMarkDamaged(pools[0].id)}
                            disabled={actionLoading === 'damage'}
                            className="text-rose-400 hover:text-rose-300 hover:underline flex items-center gap-1"
                          >
                            <span>⚠️ Flag 1 Damaged</span>
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* RIGHT 5 COLS: EXPLAINABLE DECISION ENGINE & AUDIT STREAM */}
          <div className="lg:col-span-5 space-y-6">
            {/* DECISION AUDIT STREAM CONTAINER */}
            <div className="hud-panel bg-[#0c1222] border border-slate-800 rounded-xl overflow-hidden shadow-sm flex flex-col h-[760px]">
              <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                  <h3 className="text-sm font-mono font-bold uppercase tracking-wider text-white">
                    {isPresentationMode ? 'J.A.R.V.I.S ENGINE // Decision Stream' : 'AI Decision Engine Stream'}
                  </h3>
                </div>
                <span className="text-xs font-mono text-cyan-400 bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-500/30">
                  {decisions.length} Logged Events
                </span>
              </div>

              {/* Scrollable Decision Cards */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
                {decisions.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-500 font-mono text-xs text-center px-6">
                    <span className="text-2xl mb-2">🧠</span>
                    <span>No decision events recorded yet.</span>
                    <span className="mt-1 text-slate-600">
                      Click <strong className="text-cyan-400">Resolve Allocation</strong> or <strong className="text-cyan-400">Prime / Reset</strong> to generate explainable audit events.
                    </span>
                  </div>
                ) : (
                  decisions.map((dec) => {
                    const isPriority = dec.decision_type === 'ORDER_PRIORITIZATION';
                    const isAlloc = dec.decision_type === 'INVENTORY_ALLOCATION' || dec.decision_type === 'PARTIAL_ALLOCATION';
                    const isPicking = dec.decision_type === 'PICKING_PRIORITIZATION';

                    return (
                      <div
                        key={dec.id}
                        className={`p-3.5 rounded-xl border text-xs font-mono space-y-2 transition ${
                          isPriority
                            ? 'bg-slate-900/90 border-purple-500/30 shadow-sm'
                            : isAlloc
                            ? 'bg-slate-900/90 border-cyan-500/30 shadow-sm'
                            : isPicking
                            ? 'bg-slate-900/90 border-blue-500/30 shadow-sm'
                            : 'bg-slate-900/90 border-slate-800'
                        }`}
                      >
                        {/* Event Header */}
                        <div className="flex items-center justify-between text-[11px]">
                          <span
                            className={`px-2 py-0.5 rounded font-bold uppercase ${
                              isPriority
                                ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                                : isAlloc
                                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                                : isPicking
                                ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                                : 'bg-slate-800 text-slate-300'
                            }`}
                          >
                            {dec.decision_type.replace(/_/g, ' ')}
                          </span>
                          <span className="text-slate-500 text-[10px]">
                            {new Date(dec.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                          </span>
                        </div>

                        {/* Title & Decision */}
                        <div className="font-bold text-white text-xs">
                          {dec.decision}
                        </div>

                        {/* Reason / Explainability breakdown */}
                        <div className="bg-slate-950/70 p-2.5 rounded-lg border border-slate-800/80 text-slate-300 leading-relaxed text-[11px]">
                          <div className="text-[10px] uppercase font-bold text-cyan-400/80 mb-1">
                            Decision Justification:
                          </div>
                          {dec.reason}
                        </div>

                        {/* Recommended Action */}
                        {dec.recommended_action && (
                          <div className="text-[11px] text-emerald-400/90 flex items-start gap-1.5">
                            <span className="font-bold">👉 Action:</span>
                            <span>{dec.recommended_action}</span>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
        </>
        )}
      </main>

      {/* ORDER INSPECTION DRAWER / DECISION CHAIN MODAL */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex justify-end">
          <div className="bg-[#0c1222] border-l border-slate-800 w-full max-w-xl h-full overflow-y-auto p-6 space-y-6 shadow-2xl flex flex-col justify-between font-mono">
            <div>
              {/* Header */}
              <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                <div>
                  <span className="text-[10px] text-cyan-400 font-bold uppercase tracking-wider">
                    Deterministic Audit Inspector
                  </span>
                  <h3 className="text-lg font-bold text-white mt-0.5">
                    Order {selectedOrder.order_number}
                  </h3>
                </div>
                <button
                  onClick={() => setSelectedOrder(null)}
                  className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs"
                >
                  ✕ Close
                </button>
              </div>

              {/* Order Metadata Card */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 mt-4 space-y-3 text-xs">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-slate-500 text-[10px] uppercase">Customer</span>
                    <div className="font-bold text-slate-200">
                      {getCustomer(selectedOrder.customer_id)?.name} ({getCustomer(selectedOrder.customer_id)?.tier.toUpperCase()})
                    </div>
                  </div>
                  <div>
                    <span className="text-slate-500 text-[10px] uppercase">Channel & Value</span>
                    <div className="font-bold text-slate-200">
                      {selectedOrder.channel} • ${selectedOrder.total_value.toFixed(2)}
                    </div>
                  </div>
                  <div>
                    <span className="text-slate-500 text-[10px] uppercase">Priority Score</span>
                    <div className="font-bold text-amber-300">
                      {Math.round(selectedOrder.priority_score)}/100
                    </div>
                  </div>
                  <div>
                    <span className="text-slate-500 text-[10px] uppercase">SLA Deadline</span>
                    <div className="font-bold text-slate-200">
                      {new Date(selectedOrder.sla_deadline).toLocaleString()}
                    </div>
                  </div>
                </div>

                {/* Items List with Allocations */}
                <div className="mt-3 pt-3 border-t border-slate-800">
                  <span className="text-slate-400 text-[10px] uppercase font-bold">Line Items:</span>
                  <div className="mt-2 space-y-1.5">
                    {(selectedOrder.items || []).map((it) => {
                      const p = getProduct(it.product_id);
                      return (
                        <div
                          key={it.id}
                          className="bg-slate-950/70 p-2 rounded border border-slate-800 flex items-center justify-between text-xs"
                        >
                          <div>
                            <div className="font-semibold text-white">{p?.name || 'Product'}</div>
                            <div className="text-[10px] text-slate-500">{p?.sku}</div>
                          </div>
                          <div className="text-right">
                            <span className="font-bold text-cyan-300">
                              {it.allocated_quantity} / {it.quantity} allocated
                            </span>
                            <div className="text-[10px] text-slate-500">${it.unit_price} ea</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Order Specific Decision Chain */}
              <div className="mt-6">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-3 flex items-center gap-2">
                  <span>📜 Explainable Decision Chain</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400">
                    {orderDecisions.length} events
                  </span>
                </h4>

                {orderDecisions.length === 0 ? (
                  <div className="p-4 bg-slate-950 rounded-lg text-slate-500 text-xs text-center border border-slate-800">
                    No decision events recorded directly for this order yet.
                  </div>
                ) : (
                  <div className="space-y-3 relative pl-4 border-l border-slate-800">
                    {orderDecisions.map((dec) => (
                      <div key={dec.id} className="relative">
                        <span className="absolute -left-[21px] top-1.5 w-2.5 h-2.5 rounded-full bg-cyan-500 border-2 border-[#0c1222]" />
                        <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-3 text-xs space-y-1">
                          <div className="flex items-center justify-between text-[10px] text-slate-400">
                            <span className="font-bold text-cyan-400 uppercase">
                              {dec.decision_type.replace(/_/g, ' ')}
                            </span>
                            <span>{new Date(dec.created_at).toLocaleTimeString()}</span>
                          </div>
                          <div className="font-bold text-white">{dec.decision}</div>
                          <p className="text-slate-300 text-[11px] bg-slate-950/60 p-2 rounded border border-slate-800/80">
                            {dec.reason}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Bottom Actions */}
            <div className="pt-4 border-t border-slate-800 flex items-center justify-between">
              <button
                onClick={() => setSelectedOrder(null)}
                className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold rounded-lg transition"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}

      {/* LIVE DEMO / KEYNOTE PRESENTER OVERLAY */}
      <LiveDemoPresenter
        isOpen={demoPresenterOpen}
        onClose={() => setDemoPresenterOpen(false)}
        onNavigateTab={(tabId) => {
          setActiveNav(tabId);
          if (tabId === 'orders') setActiveTab('all');
        }}
        onRunSeed={handleSeed}
        onRunAllocation={handleRunAllocation}
        onAdvancePipeline={handleAdvancePipeline}
        showToast={showToast}
      />

      {/* KEYBOARD SHORTCUTS MODAL */}
      <KeyboardShortcutsModal
        isOpen={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
        isPresentationMode={isPresentationMode}
      />

      {/* J.A.R.V.I.S CINEMATIC OVERLAY (Checkpoint 19) */}
      <JarvisCinematicOverlay
        active={cinematicActive}
        metrics={cinematicMetrics}
        onComplete={handleCinematicComplete}
      />
    </div>
  );
}
