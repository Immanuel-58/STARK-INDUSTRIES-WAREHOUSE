'use client';

import React, { useState, useEffect } from 'react';
import { PackingTask, PackingStatus, Order, OrderStatus, Product, Customer } from '@/lib/types';
import { DEMO_PRODUCTS, DEMO_CUSTOMERS } from '@/lib/seed-data';
import { jarvisAudio } from '@/components/hud/JarvisAudio';

interface PackingStationProps {
  onRefreshParent: () => void;
  showToast: (text: string, type?: 'success' | 'info' | 'warning' | 'error') => void;
}

export default function PackingStation({ onRefreshParent, showToast }: PackingStationProps) {
  const [tasks, setTasks] = useState<PackingTask[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedTask, setSelectedTask] = useState<PackingTask | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [verifiedItems, setVerifiedItems] = useState<Record<string, boolean>>({});
  const [selectedBoxSize, setSelectedBoxSize] = useState<string>('Carton B2 (12x10x6)');

  const fetchPackingData = async () => {
    try {
      setLoading(true);
      const [tasksRes, ordersRes] = await Promise.all([
        fetch('/api/packing'),
        fetch('/api/orders'),
      ]);
      const [tasksData, ordersData] = await Promise.all([tasksRes.json(), ordersRes.json()]);

      if (tasksData.success) {
        setTasks(tasksData.data || []);
      }
      if (ordersData.success) {
        setOrders(ordersData.data || []);
      }
    } catch (err) {
      console.error('Failed to load packing tasks', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPackingData();
  }, []);

  const getOrderForTask = (orderId: string) => orders.find((o) => o.id === orderId);
  const getCustomer = (id?: string) => DEMO_CUSTOMERS.find((c) => c.id === id);

  const handleStartPacking = async (task: PackingTask) => {
    try {
      setActionLoading(task.id);
      const res = await fetch('/api/packing', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task_id: task.id,
          status: PackingStatus.PACKING,
        }),
      });
      const data = await res.json();
      if (data.success) {
        jarvisAudio.playBlip(750, 0.08);
        showToast(`Packing bench initialized for Order ${getOrderForTask(task.order_id)?.order_number || task.order_id}`, 'info');
        await fetchPackingData();
        onRefreshParent();
      } else {
        showToast(data.error || 'Failed to start packing', 'error');
      }
    } catch (err) {
      showToast('Network error starting packing task', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleCompletePacking = async (task: PackingTask) => {
    try {
      setActionLoading(task.id);
      // 1. Mark task packed
      const res = await fetch('/api/packing', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task_id: task.id,
          status: PackingStatus.PACKED,
        }),
      });
      const data = await res.json();
      if (data.success) {
        // 2. Create Quality Check
        await fetch('/api/quality', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'create',
            order_id: task.order_id,
            packing_task_id: task.id,
          }),
        });

        jarvisAudio.playConfirm();
        showToast(`Carton sealed for Order ${getOrderForTask(task.order_id)?.order_number}! Routed to Quality Control Station.`, 'success');
        setSelectedTask(null);
        setVerifiedItems({});
        await fetchPackingData();
        onRefreshParent();
      } else {
        showToast(data.error || 'Failed to seal carton', 'error');
      }
    } catch (err) {
      showToast('Network error completing packing', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const pendingTasks = tasks.filter((t) => t.status === PackingStatus.PENDING);
  const activeTasks = tasks.filter((t) => t.status === PackingStatus.PACKING);
  const completedTasks = tasks.filter((t) => t.status === PackingStatus.PACKED);

  return (
    <div className="space-y-6 font-mono">
      {/* STATION HEADER & LIVE METRICS */}
      <div className="bg-[#0c1222] border border-slate-800 rounded-xl p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center font-bold text-white text-xl shadow-lg shadow-indigo-500/20">
              🎁
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold uppercase text-white tracking-wide">
                  Packing Workstation #2 (Carton & Seal Dock)
                </h2>
                <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-indigo-500/10 border border-indigo-500/30 text-indigo-400">
                  PACK SCALE ONLINE
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Item verification, dunnage optimization, barcoded sealing, and tare weight verification.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="bg-slate-900/90 border border-slate-800 rounded-lg px-3 py-1.5 text-right">
              <div className="text-[10px] text-slate-500 uppercase">Awaiting Pack</div>
              <div className="text-sm font-bold text-amber-400">{pendingTasks.length} orders</div>
            </div>
            <div className="bg-slate-900/90 border border-slate-800 rounded-lg px-3 py-1.5 text-right">
              <div className="text-[10px] text-slate-500 uppercase">On Bench</div>
              <div className="text-sm font-bold text-indigo-400">{activeTasks.length} orders</div>
            </div>
            <div className="bg-slate-900/90 border border-slate-800 rounded-lg px-3 py-1.5 text-right">
              <div className="text-[10px] text-slate-500 uppercase">Sealed Today</div>
              <div className="text-sm font-bold text-emerald-400">{completedTasks.length} cartons</div>
            </div>
            <button
              onClick={fetchPackingData}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-700 transition"
              title="Refresh Queue"
            >
              🔄
            </button>
          </div>
        </div>
      </div>

      {/* MAIN PACKING CONSOLE */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* LEFT 7 COLS: PACKING QUEUE */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-[#0c1222] border border-slate-800 rounded-xl overflow-hidden shadow-sm">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
              <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                Orders Awaiting Packaging
              </h3>
              <span className="text-xs text-slate-400">
                Sorted by SLA Urgency
              </span>
            </div>

            <div className="divide-y divide-slate-800/80">
              {tasks.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-xs">
                  No orders in packing queue. Complete picking tasks to route orders to packing.
                </div>
              ) : (
                tasks.map((task) => {
                  const ord = getOrderForTask(task.order_id);
                  const cust = getCustomer(ord?.customer_id);
                  const isSelected = selectedTask?.id === task.id;

                  return (
                    <div
                      key={task.id}
                      onClick={() => setSelectedTask(task)}
                      className={`p-4 cursor-pointer transition flex flex-wrap items-center justify-between gap-3 ${
                        isSelected
                          ? 'bg-indigo-950/20 border-l-4 border-indigo-500 text-white'
                          : 'hover:bg-slate-900/50 text-slate-300'
                      }`}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white">{ord?.order_number || task.order_id.slice(0, 8)}</span>
                          <span
                            className={`px-1.5 py-0.2 rounded text-[10px] font-bold uppercase ${
                              task.status === PackingStatus.PACKING
                                ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 animate-pulse'
                                : task.status === PackingStatus.PACKED
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            {task.status}
                          </span>
                          {ord?.priority_score && ord.priority_score >= 80 && (
                            <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                              VIP EXPRESS
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          Destination: <strong className="text-slate-200">{cust?.address || 'Destination Hub'}</strong>
                        </div>
                        <div className="text-[10px] text-slate-500">
                          Order Value: ${ord?.total_value.toFixed(2) || '0.00'} • Channel: {ord?.channel || 'WEB'}
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-2">
                        {task.status === PackingStatus.PENDING && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleStartPacking(task);
                            }}
                            disabled={actionLoading === task.id}
                            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded transition flex items-center gap-1"
                          >
                            <span>📦</span>
                            <span>Load to Bench</span>
                          </button>
                        )}

                        {task.status === PackingStatus.PACKING && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCompletePacking(task);
                            }}
                            disabled={actionLoading === task.id}
                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded transition flex items-center gap-1"
                          >
                            <span>🔒</span>
                            <span>Seal & Forward</span>
                          </button>
                        )}

                        {task.status === PackingStatus.PACKED && (
                          <span className="text-emerald-400 text-xs font-semibold">
                            ✓ Forwarded to QC
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* RIGHT 5 COLS: PACKING BENCH & DUNNAGE CONSOLE */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-[#0c1222] border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-indigo-400 animate-ping" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                  Active Packing Bench Inspector
                </h3>
              </div>
              <span className="text-[10px] text-slate-500">
                {selectedTask ? `Carton Task: ${selectedTask.id.slice(0, 8)}` : 'Bench empty'}
              </span>
            </div>

            {selectedTask ? (
              <div className="space-y-4">
                {/* Order Details Header */}
                <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-3 text-xs space-y-2">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Carton Reference:</span>
                    <span className="font-bold text-white">
                      {getOrderForTask(selectedTask.order_id)?.order_number}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Customer:</span>
                    <span className="text-slate-200">
                      {getCustomer(getOrderForTask(selectedTask.order_id)?.customer_id)?.name}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Calculated Tare Weight:</span>
                    <span className="font-mono text-cyan-300 font-bold">2.65 kg (Within ±2% Tolerance)</span>
                  </div>
                </div>

                {/* Box Type Selection */}
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-bold">
                    Optimal Packaging Recommendation:
                  </span>
                  <div className="grid grid-cols-2 gap-2 mt-1.5 text-xs">
                    {['Carton B2 (12x10x6)', 'Heavy Duty Box C1', 'Mailer Padded M3', 'Eco Tube E1'].map((box) => (
                      <button
                        key={box}
                        onClick={() => setSelectedBoxSize(box)}
                        className={`p-2 rounded border text-left text-xs transition ${
                          selectedBoxSize === box
                            ? 'bg-indigo-950/60 border-indigo-500/80 text-indigo-200 font-bold'
                            : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                        }`}
                      >
                        {box}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Item Verification Checklist */}
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-bold">
                    Carton Contents Verification:
                  </span>
                  <div className="mt-2 space-y-2">
                    {DEMO_PRODUCTS.slice(0, 2).map((prod) => {
                      const isChecked = verifiedItems[prod.id];
                      return (
                        <div
                          key={prod.id}
                          onClick={() => setVerifiedItems({ ...verifiedItems, [prod.id]: !isChecked })}
                          className={`p-3 rounded-lg border flex items-center justify-between text-xs cursor-pointer transition ${
                            isChecked
                              ? 'bg-emerald-950/30 border-emerald-500/40 text-white'
                              : 'bg-slate-950/90 border-slate-800 text-slate-300 hover:border-slate-700'
                          }`}
                        >
                          <div>
                            <div className="font-bold text-white flex items-center gap-1.5">
                              <span>{isChecked ? '☑' : '☐'}</span>
                              <span>{prod.name}</span>
                            </div>
                            <div className="text-[10px] text-slate-500">{prod.sku} • Inspected & intact</div>
                          </div>
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                              isChecked
                                ? 'bg-emerald-500/20 text-emerald-300'
                                : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            {isChecked ? 'Verified' : 'Click to Verify'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Action Footer */}
                <div className="pt-3 border-t border-slate-800 flex gap-2">
                  {selectedTask.status === PackingStatus.PENDING && (
                    <button
                      onClick={() => handleStartPacking(selectedTask)}
                      disabled={actionLoading === selectedTask.id}
                      className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-lg transition"
                    >
                      Initialize Packing Bench
                    </button>
                  )}
                  {selectedTask.status === PackingStatus.PACKING && (
                    <button
                      onClick={() => handleCompletePacking(selectedTask)}
                      disabled={actionLoading === selectedTask.id}
                      className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-lg transition"
                    >
                      Apply Seal & Forward to Quality Control Station
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="py-12 text-center text-slate-500 text-xs">
                Select an order from the packing queue to start boxing, weighing, and sealing.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
