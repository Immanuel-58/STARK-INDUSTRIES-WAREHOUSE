'use client';

import React, { useState, useEffect } from 'react';
import { PickingTask, PickingStatus, OrderStatus, Product, Order, Customer } from '@/lib/types';
import { DEMO_PRODUCTS, DEMO_CUSTOMERS } from '@/lib/seed-data';
import { jarvisAudio } from '@/components/hud/JarvisAudio';

interface PickingStationProps {
  onRefreshParent: () => void;
  showToast: (text: string, type?: 'success' | 'info' | 'warning' | 'error') => void;
}

export default function PickingStation({ onRefreshParent, showToast }: PickingStationProps) {
  const [tasks, setTasks] = useState<PickingTask[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedTask, setSelectedTask] = useState<PickingTask | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [pickedItems, setPickedItems] = useState<Record<string, number>>({});

  const fetchPickingData = async () => {
    try {
      setLoading(true);
      const [tasksRes, ordersRes] = await Promise.all([
        fetch('/api/picking'),
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
      console.error('Failed to load picking tasks', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPickingData();
  }, []);

  const getOrderForTask = (orderId: string) => orders.find((o) => o.id === orderId);
  const getCustomer = (id?: string) => DEMO_CUSTOMERS.find((c) => c.id === id);

  const handleStartPick = async (task: PickingTask) => {
    try {
      setActionLoading(task.id);
      const res = await fetch('/api/picking', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task_id: task.id,
          status: PickingStatus.PICKING,
        }),
      });
      const data = await res.json();
      if (data.success) {
        jarvisAudio.playBlip(700, 0.08);
        showToast(`Picker dispatched for Order ${getOrderForTask(task.order_id)?.order_number || task.order_id}`, 'info');
        await fetchPickingData();
        onRefreshParent();
      } else {
        showToast(data.error || 'Failed to start picking', 'error');
      }
    } catch (err) {
      showToast('Network error starting pick task', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleCompletePick = async (task: PickingTask) => {
    try {
      setActionLoading(task.id);
      // 1. Mark task picked
      const res = await fetch('/api/picking', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task_id: task.id,
          status: PickingStatus.PICKED,
        }),
      });
      const data = await res.json();
      if (data.success) {
        // 2. Create Packing Task
        await fetch('/api/packing', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            order_id: task.order_id,
            picking_task_id: task.id,
          }),
        });

        jarvisAudio.playConfirm();
        showToast(`Pick completed for Order ${getOrderForTask(task.order_id)?.order_number}! Transferred to Packing Station.`, 'success');
        setSelectedTask(null);
        setPickedItems({});
        await fetchPickingData();
        onRefreshParent();
      } else {
        showToast(data.error || 'Failed to complete pick', 'error');
      }
    } catch (err) {
      showToast('Network error completing pick', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleCreatePickForAllocated = async (orderId: string) => {
    try {
      setActionLoading(orderId);
      const res = await fetch('/api/picking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_id: orderId,
          location_sequence: ['loc-001', 'loc-002', 'loc-005'],
        }),
      });
      const data = await res.json();
      if (data.success) {
        showToast('Picking task initialized from allocated stock', 'success');
        await fetchPickingData();
        onRefreshParent();
      } else {
        showToast(data.error || 'Failed to create pick task', 'error');
      }
    } catch (err) {
      showToast('Network error', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const allocatedOrdersPendingPick = orders.filter(
    (o) => o.status === OrderStatus.ALLOCATED && !tasks.some((t) => t.order_id === o.id)
  );

  const pendingTasks = tasks.filter((t) => t.status === PickingStatus.PENDING);
  const activeTasks = tasks.filter((t) => t.status === PickingStatus.PICKING);
  const completedTasks = tasks.filter((t) => t.status === PickingStatus.PICKED);

  return (
    <div className="space-y-6 font-mono">
      {/* STATION HEADER & LIVE STATS */}
      <div className="bg-[#0c1222] border border-slate-800 rounded-xl p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center font-bold text-black text-xl shadow-lg shadow-amber-500/20">
              🚜
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold uppercase text-white tracking-wide">
                  Picking Workstation #1 (Zone A/B)
                </h2>
                <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-amber-500/10 border border-amber-500/30 text-amber-400">
                  SCANNER CONNECTED
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Optimized wave picking, bin-sequence navigation, and item verification console.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="bg-slate-900/90 border border-slate-800 rounded-lg px-3 py-1.5 text-right">
              <div className="text-[10px] text-slate-500 uppercase">Pending Queue</div>
              <div className="text-sm font-bold text-amber-400">{pendingTasks.length} tasks</div>
            </div>
            <div className="bg-slate-900/90 border border-slate-800 rounded-lg px-3 py-1.5 text-right">
              <div className="text-[10px] text-slate-500 uppercase">In Progress</div>
              <div className="text-sm font-bold text-cyan-400">{activeTasks.length} tasks</div>
            </div>
            <div className="bg-slate-900/90 border border-slate-800 rounded-lg px-3 py-1.5 text-right">
              <div className="text-[10px] text-slate-500 uppercase">Picked Today</div>
              <div className="text-sm font-bold text-emerald-400">{completedTasks.length} orders</div>
            </div>
            <button
              onClick={fetchPickingData}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-700 transition"
              title="Refresh Tasks"
            >
              🔄
            </button>
          </div>
        </div>
      </div>

      {/* ALLOCATED ORDERS AWAITING PICK INITIALIZATION */}
      {allocatedOrdersPendingPick.length > 0 && (
        <div className="bg-gradient-to-r from-blue-950/40 via-slate-900 to-slate-900 border border-blue-500/30 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-sm">⚡</span>
              <h3 className="text-xs font-bold uppercase text-blue-300">
                Allocated Orders Ready for Picking ({allocatedOrdersPendingPick.length})
              </h3>
            </div>
            <span className="text-[11px] text-slate-400">Stock reserved — ready to generate wave route</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {allocatedOrdersPendingPick.map((ord) => {
              const cust = getCustomer(ord.customer_id);
              return (
                <div
                  key={ord.id}
                  className="bg-slate-900/90 border border-slate-800 p-3 rounded-lg flex items-center justify-between text-xs"
                >
                  <div>
                    <div className="font-bold text-white flex items-center gap-1.5">
                      <span>{ord.order_number}</span>
                      <span className="text-[10px] text-amber-300 font-normal">
                        Score: {Math.round(ord.priority_score)}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-400">
                      {cust?.name} • ${ord.total_value.toFixed(2)}
                    </div>
                  </div>
                  <button
                    onClick={() => handleCreatePickForAllocated(ord.id)}
                    disabled={actionLoading === ord.id}
                    className="px-2.5 py-1 bg-cyan-600 hover:bg-cyan-500 text-black text-[11px] font-bold rounded transition"
                  >
                    {actionLoading === ord.id ? '...' : '+ Generate Pick'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* MAIN PICKING CONSOLE: TASK QUEUE & ACTIVE RUNNER */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* LEFT 7 COLS: TASKS QUEUE */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-[#0c1222] border border-slate-800 rounded-xl overflow-hidden shadow-sm">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
              <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                Picking Tasks Execution Queue
              </h3>
              <span className="text-xs text-slate-400">
                Sorted by SLA Urgency & Priority Score
              </span>
            </div>

            <div className="divide-y divide-slate-800/80">
              {tasks.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-xs">
                  No picking tasks in queue. Allocate orders from the Control Tower to generate picking waves.
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
                          ? 'bg-amber-950/20 border-l-4 border-amber-500 text-white'
                          : 'hover:bg-slate-900/50 text-slate-300'
                      }`}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white">{ord?.order_number || task.order_id.slice(0, 8)}</span>
                          <span
                            className={`px-1.5 py-0.2 rounded text-[10px] font-bold uppercase ${
                              task.status === PickingStatus.PICKING
                                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 animate-pulse'
                                : task.status === PickingStatus.PICKED
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            {task.status}
                          </span>
                          {ord?.priority_score && ord.priority_score >= 80 && (
                            <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                              URGENT
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          Customer: <strong className="text-slate-200">{cust?.name || 'Customer'}</strong> ({cust?.tier.toUpperCase()})
                        </div>
                        <div className="text-[10px] text-slate-500 flex items-center gap-2">
                          <span>Locations: {(task.location_sequence || []).join(' → ') || 'Zone A-1-R1'}</span>
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-2">
                        {task.status === PickingStatus.PENDING && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleStartPick(task);
                            }}
                            disabled={actionLoading === task.id}
                            className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs rounded transition flex items-center gap-1"
                          >
                            <span>🚜</span>
                            <span>Start Pick</span>
                          </button>
                        )}

                        {task.status === PickingStatus.PICKING && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCompletePick(task);
                            }}
                            disabled={actionLoading === task.id}
                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded transition flex items-center gap-1"
                          >
                            <span>✓</span>
                            <span>Complete Pick</span>
                          </button>
                        )}

                        {task.status === PickingStatus.PICKED && (
                          <span className="text-emerald-400 text-xs font-semibold">
                            ✓ Transferred to Pack
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

        {/* RIGHT 5 COLS: ACTIVE PICK SCANNER CONSOLE */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-[#0c1222] border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                  Active Pick Runner Console
                </h3>
              </div>
              <span className="text-[10px] text-slate-500">
                {selectedTask ? `Task ID: ${selectedTask.id.slice(0, 8)}` : 'No task selected'}
              </span>
            </div>

            {selectedTask ? (
              <div className="space-y-4">
                {/* Order Details Header */}
                <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-3 text-xs space-y-2">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Order Reference:</span>
                    <span className="font-bold text-white">
                      {getOrderForTask(selectedTask.order_id)?.order_number}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Priority Score:</span>
                    <span className="font-bold text-amber-300">
                      {Math.round(getOrderForTask(selectedTask.order_id)?.priority_score || 0)} / 100
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">SLA Window:</span>
                    <span className="text-slate-300">
                      {new Date(getOrderForTask(selectedTask.order_id)?.sla_deadline || '').toLocaleString()}
                    </span>
                  </div>
                </div>

                {/* Warehouse Location Path Sequence */}
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-bold">
                    Optimized Pick Route:
                  </span>
                  <div className="mt-1.5 flex items-center gap-2 overflow-x-auto pb-1 text-xs">
                    {(selectedTask.location_sequence || ['loc-001', 'loc-002']).map((loc, idx) => (
                      <div
                        key={idx}
                        className="bg-slate-950 px-2.5 py-1.5 rounded border border-slate-800 text-slate-300 flex items-center gap-1.5 whitespace-nowrap"
                      >
                        <span className="text-amber-400 font-bold">#{idx + 1}</span>
                        <span>{loc}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Items to Pick */}
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-bold">
                    SKU Items Verification:
                  </span>
                  <div className="mt-2 space-y-2">
                    {DEMO_PRODUCTS.slice(0, 3).map((prod, idx) => {
                      const isPicked = pickedItems[prod.id];
                      return (
                        <div
                          key={prod.id}
                          className="bg-slate-950/90 border border-slate-800/80 p-3 rounded-lg flex items-center justify-between text-xs"
                        >
                          <div>
                            <div className="font-bold text-white">{prod.name}</div>
                            <div className="text-[10px] text-slate-500">{prod.sku} • Bin A-1-R1</div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-slate-300 text-xs">
                              Qty: <strong>{idx === 0 ? 2 : 1}</strong>
                            </span>
                            <button
                              onClick={() => setPickedItems({ ...pickedItems, [prod.id]: (pickedItems[prod.id] || 0) + 1 })}
                              className={`px-2 py-1 rounded text-[10px] font-bold transition ${
                                isPicked
                                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'
                              }`}
                            >
                              {isPicked ? '✓ Scanned' : 'Scan Unit'}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Quick Action Footer */}
                <div className="pt-3 border-t border-slate-800 flex gap-2">
                  {selectedTask.status === PickingStatus.PENDING && (
                    <button
                      onClick={() => handleStartPick(selectedTask)}
                      disabled={actionLoading === selectedTask.id}
                      className="w-full py-2 bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs rounded-lg transition"
                    >
                      Dispatch Picker to Aisle
                    </button>
                  )}
                  {selectedTask.status === PickingStatus.PICKING && (
                    <button
                      onClick={() => handleCompletePick(selectedTask)}
                      disabled={actionLoading === selectedTask.id}
                      className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-lg transition"
                    >
                      Confirm All Items Picked & Forward to Pack
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="py-12 text-center text-slate-500 text-xs">
                Select any task from the queue to open the active bin scanner & routing console.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
