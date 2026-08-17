'use client';

import React, { useState, useEffect } from 'react';
import { SimulationResult, OrderChannel } from '@/lib/types';
import { DEMO_PRODUCTS, DEMO_CUSTOMERS } from '@/lib/seed-data';
import { jarvisAudio } from '@/components/hud/JarvisAudio';

interface GodModeSimulatorProps {
  onRefreshParent: () => void;
  showToast: (text: string, type?: 'success' | 'info' | 'warning' | 'error') => void;
}

interface CustomOrderInput {
  customer_id: string;
  channel: OrderChannel;
  product_id: string;
  quantity: number;
  unit_price: number;
  sla_hours_from_now: number;
  notes?: string;
}

const PRESET_SIMULATIONS = [
  {
    id: 'preset-scarce-conflict',
    name: 'Conflict: VIP Order vs Standard Web (Scarce Phones)',
    description: 'VIP Wholesale customer needs 10 SmartPhone X12 units (urgent 12h SLA), while a Standard Web customer requests 5 units. Only 7 units are available in inventory. The engine must protect the VIP order, partially allocate 7 units, and flag shortage.',
    damagedUnits: 0,
    orders: [
      {
        customer_id: 'cust-001', // Apex Technologies (VIP)
        channel: OrderChannel.WHOLESALE,
        product_id: 'prod-002', // SmartPhone X12
        quantity: 10,
        unit_price: 899.99,
        sla_hours_from_now: 12,
        notes: 'URGENT: VIP Launch order',
      },
      {
        customer_id: 'cust-003', // Jane Smith (Standard)
        channel: OrderChannel.WEB,
        product_id: 'prod-002', // SmartPhone X12
        quantity: 5,
        unit_price: 899.99,
        sla_hours_from_now: 72,
        notes: 'Standard web customer',
      },
    ],
  },
  {
    id: 'preset-damaged-quarantine',
    name: 'Shock: Sudden Hardware Damage in Transit',
    description: '3 NoiseCancel Pro headphones are found damaged and moved to quarantine. An incoming order for 6 units arrives. The engine detects insufficient undamaged stock and logs an exception.',
    damagedUnits: 3,
    orders: [
      {
        customer_id: 'cust-002', // Metro Retail Group (Premium)
        channel: OrderChannel.MARKETPLACE,
        product_id: 'prod-004', // NoiseCancel Pro
        quantity: 6,
        unit_price: 349.99,
        sla_hours_from_now: 24,
        notes: 'Priority marketplace order',
      },
    ],
  },
  {
    id: 'preset-sla-bottleneck',
    name: 'SLA Breach Threat: Multiple Simultaneous Orders',
    description: 'Two large corporate replenishment orders arrive simultaneously with tight SLA deadlines (<8h). The engine prioritizes the highest value order and alerts picking supervisors.',
    damagedUnits: 0,
    orders: [
      {
        customer_id: 'cust-005', // GlobalMart (VIP)
        channel: OrderChannel.WHOLESALE,
        product_id: 'prod-001', // ProBook Laptop 15"
        quantity: 12,
        unit_price: 1299.99,
        sla_hours_from_now: 6,
        notes: 'High-value enterprise batch',
      },
      {
        customer_id: 'cust-004', // TechStart Inc (Premium)
        channel: OrderChannel.WEB,
        product_id: 'prod-003', // TabPro 10"
        quantity: 15,
        unit_price: 499.99,
        sla_hours_from_now: 8,
        notes: 'Urgent tablet rollout',
      },
    ],
  },
  {
    id: 'preset-low-stock-reorder',
    name: 'Auto-Reorder Trigger: SmartWatch Stock Below ROP',
    description: 'Order for 5 SmartWatch S5 units depletes stock past the reorder point (ROP 20). Engine calculates deterministic replenishment quantity needed.',
    damagedUnits: 0,
    orders: [
      {
        customer_id: 'cust-004',
        channel: OrderChannel.WEB,
        product_id: 'prod-005',
        quantity: 5,
        unit_price: 249.99,
        sla_hours_from_now: 48,
        notes: 'Standard consumer order',
      },
    ],
  },
];

export default function GodModeSimulator({ onRefreshParent, showToast }: GodModeSimulatorProps) {
  const [selectedPreset, setSelectedPreset] = useState<string>('preset-scarce-conflict');
  const [customOrders, setCustomOrders] = useState<CustomOrderInput[]>(PRESET_SIMULATIONS[0].orders);
  const [damagedStockQty, setDamagedStockQty] = useState<number>(0);
  const [damagedSku, setDamagedSku] = useState<string>('prod-002');
  const [simulationResult, setSimulationResult] = useState<SimulationResult | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'decisions' | 'allocations' | 'exceptions'>('overview');

  // Sync preset changes
  const handleSelectPreset = (presetId: string) => {
    setSelectedPreset(presetId);
    const found = PRESET_SIMULATIONS.find((p) => p.id === presetId);
    if (found) {
      setCustomOrders([...found.orders]);
      setDamagedStockQty(found.damagedUnits);
      setSimulationResult(null);
    }
  };

  const handleAddOrder = () => {
    setCustomOrders([
      ...customOrders,
      {
        customer_id: 'cust-001',
        channel: OrderChannel.WHOLESALE,
        product_id: 'prod-001',
        quantity: 5,
        unit_price: 1299.99,
        sla_hours_from_now: 24,
        notes: 'Custom simulated order',
      },
    ]);
  };

  const handleRemoveOrder = (index: number) => {
    setCustomOrders(customOrders.filter((_, idx) => idx !== index));
  };

  const handleUpdateOrder = (index: number, field: keyof CustomOrderInput, value: any) => {
    const updated = [...customOrders];
    updated[index] = { ...updated[index], [field]: value };
    setCustomOrders(updated);
  };

  const handleRunSimulation = async () => {
    try {
      setLoading(true);
      const payload = {
        scenario_type: selectedPreset,
        orders: customOrders.map((ord, idx) => ({
          id: `SIM-ORD-00${idx + 1}`,
          customer_id: ord.customer_id,
          channel: ord.channel,
          sla_deadline: new Date(Date.now() + ord.sla_hours_from_now * 3600 * 1000).toISOString(),
          items: [
            {
              product_id: ord.product_id,
              quantity: Number(ord.quantity),
              unit_price: Number(ord.unit_price),
            },
          ],
        })),
        damaged_stock: damagedStockQty > 0 ? [{ product_id: damagedSku, quantity: damagedStockQty }] : [],
      };

      const res = await fetch('/api/simulator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (data.success) {
        jarvisAudio.playArcReactor();
        setSimulationResult(data.data);
        showToast('What-If Simulation evaluated successfully by Decision Engine!', 'success');
      } else {
        jarvisAudio.playAlert();
        showToast(data.error || 'Simulation failed', 'error');
      }
    } catch (err) {
      showToast('Network error during simulation', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleApplyToLiveWarehouse = async () => {
    try {
      setLoading(true);
      // Create orders via /api/orders
      for (const ord of customOrders) {
        await fetch('/api/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customer_id: ord.customer_id,
            warehouse_id: 'wh-001',
            channel: ord.channel,
            sla_deadline: new Date(Date.now() + ord.sla_hours_from_now * 3600 * 1000).toISOString(),
            notes: `[Simulated Commit] ${ord.notes || ''}`,
            items: [
              {
                product_id: ord.product_id,
                quantity: Number(ord.quantity),
                unit_price: Number(ord.unit_price),
              },
            ],
          }),
        });
      }

      showToast('Simulated orders committed to live warehouse pipeline!', 'success');
      onRefreshParent();
    } catch (err) {
      showToast('Failed to commit orders', 'error');
    } finally {
      setLoading(false);
    }
  };

  const getCustomer = (id: string) => DEMO_CUSTOMERS.find((c) => c.id === id);
  const getProduct = (id: string) => DEMO_PRODUCTS.find((p) => p.id === id);

  return (
    <div className="space-y-6 font-mono">
      {/* HEADER BAR */}
      <div className="bg-[#0c1222] border border-slate-800 rounded-xl p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center font-bold text-white text-xl shadow-lg shadow-purple-500/20">
              🎮
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold uppercase text-white tracking-wide">
                  God Mode / What-If Conflict Simulator
                </h2>
                <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-purple-500/10 border border-purple-500/30 text-purple-400">
                  SANDBOX ISOLATED
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Stress-test priority scoring, multi-order stock contention, shortage isolation, and exception recommendations in zero-risk sandbox.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={handleRunSimulation}
              disabled={loading}
              className="px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-50 text-white font-bold text-xs rounded-lg transition shadow-md shadow-purple-900/30 flex items-center gap-2"
            >
              {loading ? <span>⏳</span> : <span>▶</span>}
              <span>Run What-If Simulation</span>
            </button>

            {simulationResult && (
              <button
                onClick={handleApplyToLiveWarehouse}
                disabled={loading}
                className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-cyan-300 text-xs font-semibold rounded-lg border border-slate-700 transition flex items-center gap-1.5"
                title="Commit these simulated orders to the live warehouse database"
              >
                <span>⚡</span>
                <span>Commit to Live Warehouse</span>
              </button>
            )}

            <button
              onClick={() => {
                setSimulationResult(null);
                handleSelectPreset(selectedPreset);
              }}
              className="p-2 bg-slate-900 hover:bg-slate-800 text-slate-400 rounded-lg border border-slate-800 text-xs transition"
              title="Reset Sandbox"
            >
              ⟲
            </button>
          </div>
        </div>
      </div>

      {/* SANDBOX CONTROLS: PRESET SELECTOR & INPUT CONFIG */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* LEFT 5 COLS: SCENARIO & CUSTOM INPUTS */}
        <div className="lg:col-span-5 space-y-4">
          {/* Preset Conflict Scenarios */}
          <div className="bg-[#0c1222] border border-slate-800 rounded-xl p-4 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
              1. Select Warehouse Conflict Scenario
            </h3>
            <div className="space-y-2">
              {PRESET_SIMULATIONS.map((preset) => {
                const isSelected = selectedPreset === preset.id;
                return (
                  <button
                    key={preset.id}
                    onClick={() => handleSelectPreset(preset.id)}
                    className={`w-full p-3 rounded-lg border text-left text-xs transition ${
                      isSelected
                        ? 'bg-purple-950/40 border-purple-500/80 text-white shadow-md shadow-purple-950'
                        : 'bg-slate-900/80 border-slate-800/80 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <div className="font-bold flex items-center justify-between">
                      <span>{preset.name}</span>
                      {isSelected && <span className="text-purple-400 text-xs">● Active</span>}
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                      {preset.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Damage Injection */}
          <div className="bg-[#0c1222] border border-slate-800 rounded-xl p-4 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
              2. Inject Simulated Hardware Damage (Optional)
            </h3>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="text-[10px] text-slate-500 uppercase">Target SKU</label>
                <select
                  value={damagedSku}
                  onChange={(e) => setDamagedSku(e.target.value)}
                  className="w-full mt-1 bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-200 outline-none focus:ring-1 focus:ring-purple-500 font-mono"
                >
                  {DEMO_PRODUCTS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.sku})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] text-slate-500 uppercase">Damaged Units</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={damagedStockQty}
                  onChange={(e) => setDamagedStockQty(Number(e.target.value))}
                  className="w-full mt-1 bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-200 outline-none focus:ring-1 focus:ring-purple-500 font-mono"
                />
              </div>
            </div>
          </div>

          {/* Orders Configurator */}
          <div className="bg-[#0c1222] border border-slate-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                3. Incoming Competing Orders ({customOrders.length})
              </h3>
              <button
                onClick={handleAddOrder}
                className="text-[11px] text-purple-400 hover:text-purple-300 font-bold flex items-center gap-1"
              >
                + Add Order
              </button>
            </div>

            <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1">
              {customOrders.map((ord, idx) => (
                <div
                  key={idx}
                  className="bg-slate-950 p-3 rounded-lg border border-slate-800/90 text-xs space-y-2 relative"
                >
                  <div className="flex items-center justify-between text-[11px] border-b border-slate-800 pb-1.5">
                    <span className="font-bold text-purple-300">Order #{idx + 1}</span>
                    {customOrders.length > 1 && (
                      <button
                        onClick={() => handleRemoveOrder(idx)}
                        className="text-slate-500 hover:text-rose-400 text-xs"
                      >
                        ✕ Remove
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div>
                      <label className="text-[10px] text-slate-500 uppercase">Customer Tier</label>
                      <select
                        value={ord.customer_id}
                        onChange={(e) => handleUpdateOrder(idx, 'customer_id', e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-slate-200 font-mono text-[11px]"
                      >
                        {DEMO_CUSTOMERS.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} ({c.tier.toUpperCase()})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-[10px] text-slate-500 uppercase">Channel</label>
                      <select
                        value={ord.channel}
                        onChange={(e) => handleUpdateOrder(idx, 'channel', e.target.value as OrderChannel)}
                        className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-slate-200 font-mono text-[11px]"
                      >
                        {Object.values(OrderChannel).map((ch) => (
                          <option key={ch} value={ch}>
                            {ch}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-[10px] text-slate-500 uppercase">Target SKU</label>
                      <select
                        value={ord.product_id}
                        onChange={(e) => handleUpdateOrder(idx, 'product_id', e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-slate-200 font-mono text-[11px]"
                      >
                        {DEMO_PRODUCTS.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name.slice(0, 18)}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-[10px] text-slate-500 uppercase">Qty Needed / SLA (hrs)</label>
                      <div className="flex gap-1">
                        <input
                          type="number"
                          min="1"
                          max="500"
                          value={ord.quantity}
                          onChange={(e) => handleUpdateOrder(idx, 'quantity', Number(e.target.value))}
                          className="w-1/2 bg-slate-900 border border-slate-800 rounded px-2 py-1 text-slate-200 font-mono text-[11px]"
                          placeholder="Qty"
                        />
                        <input
                          type="number"
                          min="1"
                          max="168"
                          value={ord.sla_hours_from_now}
                          onChange={(e) => handleUpdateOrder(idx, 'sla_hours_from_now', Number(e.target.value))}
                          className="w-1/2 bg-slate-900 border border-slate-800 rounded px-2 py-1 text-slate-200 font-mono text-[11px]"
                          placeholder="SLA h"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT 7 COLS: SIMULATION EVALUATION & DECISION ENGINE OUTPUT */}
        <div className="lg:col-span-7 space-y-4">
          {simulationResult ? (
            <div className="bg-[#0c1222] border border-slate-800 rounded-xl p-5 shadow-sm space-y-5">
              {/* Telemetry Before vs After Summary */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-3 text-xs">
                  <div className="text-slate-500 text-[10px] uppercase">Simulated Demand</div>
                  <div className="text-xl font-bold text-white mt-1">
                    {simulationResult.after_state?.simulated_orders} Orders
                  </div>
                  <div className="text-[10px] text-purple-400 mt-1">
                    {customOrders.reduce((s, o) => s + o.quantity, 0)} units requested
                  </div>
                </div>

                <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-3 text-xs">
                  <div className="text-slate-500 text-[10px] uppercase">Stock Available (Before)</div>
                  <div className="text-xl font-bold text-cyan-300 mt-1">
                    {simulationResult.before_state?.available_inventory} Units
                  </div>
                  <div className="text-[10px] text-slate-400 mt-1">Across all warehouse pools</div>
                </div>

                <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-3 text-xs">
                  <div className="text-slate-500 text-[10px] uppercase">Stock Remaining (After)</div>
                  <div className="text-xl font-bold text-emerald-400 mt-1">
                    {simulationResult.after_state?.remaining_inventory} Units
                  </div>
                  <div className="text-[10px] text-slate-400 mt-1">Safe inventory cushion</div>
                </div>
              </div>

              {/* Sub-tabs */}
              <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
                {[
                  { id: 'overview', label: '📊 Allocation Plans' },
                  { id: 'decisions', label: `🧠 Engine Decisions (${simulationResult.decisions?.length || 0})` },
                  { id: 'exceptions', label: `🚨 Exceptions (${simulationResult.exceptions?.length || 0})` },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`px-3 py-1 rounded transition font-semibold ${
                      activeTab === tab.id
                        ? 'bg-slate-800 text-purple-300 border border-slate-700'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* TAB 1: ALLOCATION PLANS MATRIX */}
              {activeTab === 'overview' && (
                <div className="space-y-3">
                  <div className="text-xs text-slate-400">
                    Conflict Resolution Output sorted by Priority Score:
                  </div>

                  <div className="space-y-2.5">
                    {(simulationResult.after_state?.plans || []).map((plan: any, idx: number) => {
                      const isFull = plan.fully_allocated;
                      return (
                        <div
                          key={idx}
                          className={`p-3.5 rounded-xl border text-xs space-y-2 ${
                            isFull
                              ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-100'
                              : plan.allocations.some((a: any) => a.allocated > 0)
                              ? 'bg-amber-950/20 border-amber-500/40 text-amber-100'
                              : 'bg-rose-950/20 border-rose-500/40 text-rose-100'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="font-bold text-white flex items-center gap-2">
                              <span>{plan.order_id}</span>
                              <span
                                className={`text-[10px] px-1.5 py-0.2 rounded font-bold uppercase ${
                                  isFull
                                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                    : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                }`}
                              >
                                {isFull ? 'FULLY ALLOCATED' : 'PARTIAL / SHORTAGE'}
                              </span>
                            </div>
                            <span className="text-xs font-mono">
                              Total Shortage: <strong>{plan.total_shortage} units</strong>
                            </span>
                          </div>

                          {/* Line item allocations */}
                          <div className="space-y-1 mt-2">
                            {plan.allocations.map((alloc: any, aIdx: number) => {
                              const prod = getProduct(alloc.product_id);
                              return (
                                <div
                                  key={aIdx}
                                  className="bg-slate-950/80 p-2 rounded border border-slate-800 flex items-center justify-between text-xs font-mono"
                                >
                                  <div>
                                    <span className="text-white font-semibold">{prod?.name || alloc.product_id}</span>
                                    <span className="text-[10px] text-slate-500 ml-2">({prod?.sku})</span>
                                  </div>
                                  <div className="flex items-center gap-3">
                                    <span>
                                      Allocated: <strong className="text-cyan-300">{alloc.allocated}</strong> / {alloc.requested}
                                    </span>
                                    {alloc.shortage > 0 && (
                                      <span className="text-rose-400 font-bold text-[10px]">
                                        Shortage: {alloc.shortage}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Recommendations */}
                  {simulationResult.recommendations && simulationResult.recommendations.length > 0 && (
                    <div className="mt-4 pt-3 border-t border-slate-800 space-y-1.5">
                      <div className="text-[10px] text-slate-400 font-bold uppercase">
                        Engine Recommendations:
                      </div>
                      {simulationResult.recommendations.map((rec, rIdx) => (
                        <div
                          key={rIdx}
                          className="bg-purple-950/30 border border-purple-500/20 rounded-lg p-2.5 text-xs text-purple-200 font-mono flex items-start gap-2"
                        >
                          <span className="text-purple-400 font-bold mt-0.5">👉</span>
                          <span>{rec}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: DECISIONS EXPLANATIONS */}
              {activeTab === 'decisions' && (
                <div className="space-y-3 max-h-[460px] overflow-y-auto pr-1">
                  {(simulationResult.decisions || []).map((dec, idx) => (
                    <div
                      key={idx}
                      className="bg-slate-900/90 border border-purple-500/30 rounded-xl p-3.5 text-xs space-y-2"
                    >
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="px-2 py-0.5 rounded font-bold uppercase bg-purple-500/20 text-purple-300 border border-purple-500/40">
                          {dec.decision_type.replace(/_/g, ' ')}
                        </span>
                        <span className="text-amber-300 font-bold">
                          Score: {Math.round(dec.priority_score || 0)}/100
                        </span>
                      </div>
                      <div className="font-bold text-white">{dec.decision}</div>
                      <p className="bg-slate-950/70 p-2 rounded text-slate-300 border border-slate-800 text-[11px] leading-relaxed">
                        {dec.reason}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {/* TAB 3: EXCEPTIONS */}
              {activeTab === 'exceptions' && (
                <div className="space-y-3 max-h-[460px] overflow-y-auto pr-1">
                  {(!simulationResult.exceptions || simulationResult.exceptions.length === 0) ? (
                    <div className="py-8 text-center text-slate-500 text-xs">
                      No operational exceptions logged in this simulation.
                    </div>
                  ) : (
                    simulationResult.exceptions.map((exc, idx) => (
                      <div
                        key={idx}
                        className="bg-slate-900/90 border border-rose-500/30 rounded-xl p-3.5 text-xs space-y-2"
                      >
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="px-2 py-0.5 rounded font-bold uppercase bg-rose-500/20 text-rose-300 border border-rose-500/40">
                            {exc.type}
                          </span>
                          <span className="font-bold uppercase text-rose-400">
                            Severity: {exc.severity}
                          </span>
                        </div>
                        <div className="font-bold text-white">{exc.title}</div>
                        <p className="text-slate-300 text-[11px]">{exc.description}</p>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="h-full min-h-[460px] bg-[#0c1222] border border-slate-800 rounded-xl flex flex-col items-center justify-center p-8 text-center text-slate-500 font-mono text-xs">
              <span className="text-3xl mb-3">🎮</span>
              <h4 className="text-sm font-bold text-slate-300">Sandbox Awaiting Execution</h4>
              <p className="text-xs text-slate-400 mt-1 max-w-sm">
                Select a preset conflict on the left or customize orders & stock damage, then click <strong className="text-purple-400">Run What-If Simulation</strong>.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
