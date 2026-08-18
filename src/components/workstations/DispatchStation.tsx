'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Dispatch, DispatchStatus, Order, OrderStatus, Product, Customer } from '@/lib/types';
import { DEMO_PRODUCTS, DEMO_CUSTOMERS } from '@/lib/seed-data';
import { jarvisAudio } from '@/components/hud/JarvisAudio';

interface DispatchStationProps {
  onRefreshParent: () => void;
  showToast: (text: string, type?: 'success' | 'info' | 'warning' | 'error') => void;
  isPresentationMode?: boolean;
}

export default function DispatchStation({ onRefreshParent, showToast, isPresentationMode = false }: DispatchStationProps) {
  const [dispatches, setDispatches] = useState<Dispatch[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedDispatch, setSelectedDispatch] = useState<Dispatch | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [carrierFilter, setCarrierFilter] = useState<string>('all');

  const fetchDispatchData = async () => {
    try {
      setLoading(true);
      const [dispRes, ordersRes] = await Promise.all([
        fetch('/api/dispatch'),
        fetch('/api/orders'),
      ]);
      const [dispData, ordersData] = await Promise.all([dispRes.json(), ordersRes.json()]);

      if (dispData.success) {
        setDispatches(dispData.data || []);
      }
      if (ordersData.success) {
        setOrders(ordersData.data || []);
      }
    } catch (err) {
      console.error('Failed to load dispatches', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDispatchData();
  }, []);

  const getOrderForDispatch = (orderId: string) => orders.find((o) => o.id === orderId);
  const getCustomer = (id?: string) => DEMO_CUSTOMERS.find((c) => c.id === id);

  const handleUpdateStatus = async (dispatch: Dispatch, nextStatus: DispatchStatus) => {
    try {
      setActionLoading(dispatch.id);
      const res = await fetch('/api/dispatch', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dispatch_id: dispatch.id,
          status: nextStatus,
          order_id: dispatch.order_id,
          tracking_number: dispatch.tracking_number,
        }),
      });
      const data = await res.json();
      if (data.success) {
        const orderNum = getOrderForDispatch(dispatch.order_id)?.order_number || dispatch.order_id;
        if (nextStatus === DispatchStatus.IN_TRANSIT) {
          jarvisAudio.playBlip(800, 0.08);
          showToast(`Carrier pickup confirmed for Order ${orderNum}! Manifest active with ${dispatch.carrier}.`, 'info');
        } else if (nextStatus === DispatchStatus.DELIVERED) {
          jarvisAudio.playConfirm();
          showToast(`Proof of delivery recorded for Order ${orderNum}! Order marked COMPLETED.`, 'success');
        }
        await fetchDispatchData();
        onRefreshParent();
      } else {
        showToast(data.error || 'Failed to update dispatch status', 'error');
      }
    } catch (err) {
      showToast('Network error updating dispatch', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const pendingDispatches = useMemo(() => dispatches.filter((d) => d.status === DispatchStatus.PENDING), [dispatches]);
  const inTransitDispatches = useMemo(() => dispatches.filter((d) => d.status === DispatchStatus.IN_TRANSIT), [dispatches]);
  const deliveredDispatches = useMemo(() => dispatches.filter((d) => d.status === DispatchStatus.DELIVERED), [dispatches]);

  const filteredDispatches = useMemo(() => {
    return dispatches.filter((d) => {
      if (carrierFilter !== 'all' && !d.carrier.toLowerCase().includes(carrierFilter.toLowerCase())) {
        return false;
      }
      return true;
    });
  }, [dispatches, carrierFilter]);

  return (
    <div className="space-y-6 font-mono">
      {/* STATION HEADER & LIVE METRICS */}
      <div className="bg-[#0c1222] border border-slate-800 rounded-xl p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center font-bold text-black text-xl shadow-lg shadow-blue-500/20">
              🚚
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold uppercase text-white tracking-wide">
                  {isPresentationMode ? 'LAUNCH SEQUENCE & Outbound Dock (Bay 4-7)' : 'Outbound Dispatch & Shipping Dock (Bay 4-7)'}
                </h2>
                <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-blue-500/10 border border-blue-500/30 text-blue-400">
                  {isPresentationMode ? 'LAUNCH PROTOCOL SYNCED' : 'CARRIER API SYNCED'}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                {isPresentationMode
                  ? 'Stark carrier telemetry, quantum tracking IDs, automated launch manifests, and delivery surveillance.'
                  : 'Carrier manifest generation, barcode shipping labels, freight dispatch, and proof of delivery tracking.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="bg-slate-900/90 border border-slate-800 rounded-lg px-3 py-1.5 text-right">
              <div className="text-[10px] text-slate-500 uppercase">On Dock (Staged)</div>
              <div className="text-sm font-bold text-amber-400">{pendingDispatches.length} parcels</div>
            </div>
            <div className="bg-slate-900/90 border border-slate-800 rounded-lg px-3 py-1.5 text-right">
              <div className="text-[10px] text-slate-500 uppercase">In Transit</div>
              <div className="text-sm font-bold text-blue-400">{inTransitDispatches.length} en route</div>
            </div>
            <div className="bg-slate-900/90 border border-slate-800 rounded-lg px-3 py-1.5 text-right">
              <div className="text-[10px] text-slate-500 uppercase">Delivered</div>
              <div className="text-sm font-bold text-emerald-400">{deliveredDispatches.length} fulfilled</div>
            </div>
            <button
              onClick={fetchDispatchData}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-700 transition"
              title="Refresh Dock"
              aria-label="Refresh Dispatch Dock"
            >
              🔄
            </button>
          </div>
        </div>
      </div>

      {/* MAIN DISPATCH CONSOLE */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* LEFT 7 COLS: DISPATCH QUEUE */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-[#0c1222] border border-slate-800 rounded-xl overflow-hidden shadow-sm">
            <div className="p-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-slate-900/60">
              <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                Outbound Carrier Manifests ({filteredDispatches.length})
              </h3>

              {/* Carrier Filter */}
              <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-[11px]">
                {['all', 'fedex', 'ups', 'dhl'].map((car) => (
                  <button
                    key={car}
                    onClick={() => setCarrierFilter(car)}
                    className={`px-2 py-0.5 rounded uppercase font-semibold transition ${
                      carrierFilter === car
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {car}
                  </button>
                ))}
              </div>
            </div>

            <div className="divide-y divide-slate-800/80">
              {filteredDispatches.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-xs">
                  No orders currently at dispatch dock. Complete QC inspections to generate shipping manifests.
                </div>
              ) : (
                filteredDispatches.map((disp) => {
                  const ord = getOrderForDispatch(disp.order_id);
                  const cust = getCustomer(ord?.customer_id);
                  const isSelected = selectedDispatch?.id === disp.id;

                  return (
                    <div
                      key={disp.id}
                      onClick={() => setSelectedDispatch(disp)}
                      className={`p-4 cursor-pointer transition flex flex-wrap items-center justify-between gap-3 ${
                        isSelected
                          ? 'bg-blue-950/20 border-l-4 border-blue-500 text-white'
                          : 'hover:bg-slate-900/50 text-slate-300'
                      }`}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white">{ord?.order_number || disp.order_id.slice(0, 8)}</span>
                          <span
                            className={`px-1.5 py-0.2 rounded text-[10px] font-bold uppercase ${
                              disp.status === DispatchStatus.DELIVERED
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                : disp.status === DispatchStatus.IN_TRANSIT
                                ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30 animate-pulse'
                                : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            }`}
                          >
                            {disp.status.replace('_', ' ')}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-cyan-300 font-mono">
                            {disp.carrier}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400">
                          Recipient: <strong className="text-slate-200">{cust?.name || 'Customer'}</strong> • {cust?.address || 'US'}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          Tracking: <span className="text-slate-300">{disp.tracking_number || 'PENDING'}</span>
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-2">
                        {disp.status === DispatchStatus.PENDING && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleUpdateStatus(disp, DispatchStatus.IN_TRANSIT);
                            }}
                            disabled={actionLoading === disp.id}
                            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded transition flex items-center gap-1"
                          >
                            <span>🚚</span>
                            <span>Dispatch Carrier</span>
                          </button>
                        )}

                        {disp.status === DispatchStatus.IN_TRANSIT && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleUpdateStatus(disp, DispatchStatus.DELIVERED);
                            }}
                            disabled={actionLoading === disp.id}
                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded transition flex items-center gap-1"
                          >
                            <span>📦</span>
                            <span>Confirm POD Delivery</span>
                          </button>
                        )}

                        {disp.status === DispatchStatus.DELIVERED && (
                          <span className="text-emerald-400 text-xs font-semibold">
                            ✓ Fulfilled (POD Logged)
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

        {/* RIGHT 5 COLS: SHIPPING LABEL & BILL OF LADING */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-[#0c1222] border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-400 animate-ping" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                  Digital Shipping Manifest & Label
                </h3>
              </div>
              <span className="text-[10px] text-slate-500">
                {selectedDispatch ? `Dock Slip #${selectedDispatch.id.slice(0, 6)}` : 'No parcel selected'}
              </span>
            </div>

            {selectedDispatch ? (
              <div className="space-y-4">
                {/* Shipping Label Mockup */}
                <div className="bg-white text-black p-4 rounded-lg shadow-lg font-mono text-xs space-y-3 border border-slate-300">
                  <div className="flex items-start justify-between border-b-2 border-black pb-2">
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-600">
                        ORIGIN WAREHOUSE
                      </div>
                      <div className="font-bold text-xs">CDH-01 DISTRIBUTION CENTER</div>
                      <div className="text-[10px] text-slate-700">100 Logistics Ave, Chicago IL</div>
                    </div>
                    <div className="text-right">
                      <div className="text-base font-black uppercase text-blue-700">
                        {selectedDispatch.carrier.split(' ')[0]}
                      </div>
                      <div className="text-[10px] font-bold">PRIORITY AIR</div>
                    </div>
                  </div>

                  <div className="py-2 border-b-2 border-black">
                    <div className="text-[10px] font-bold uppercase text-slate-600">SHIP TO:</div>
                    <div className="font-bold text-sm">
                      {getCustomer(getOrderForDispatch(selectedDispatch.order_id)?.customer_id)?.name}
                    </div>
                    <div className="text-xs">
                      {getCustomer(getOrderForDispatch(selectedDispatch.order_id)?.customer_id)?.address}
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[11px] font-bold">
                    <span>REF: {getOrderForDispatch(selectedDispatch.order_id)?.order_number}</span>
                    <span>WT: 2.65 KG</span>
                  </div>

                  {/* Barcode Mock */}
                  <div className="pt-2 text-center space-y-1">
                    <div className="h-10 bg-black flex items-center justify-around px-2">
                      <div className="h-full w-1 bg-white" />
                      <div className="h-full w-2 bg-white" />
                      <div className="h-full w-0.5 bg-white" />
                      <div className="h-full w-3 bg-white" />
                      <div className="h-full w-1.5 bg-white" />
                      <div className="h-full w-0.5 bg-white" />
                      <div className="h-full w-2.5 bg-white" />
                      <div className="h-full w-1 bg-white" />
                    </div>
                    <div className="text-[10px] font-bold tracking-widest">
                      {selectedDispatch.tracking_number || 'TRK-DEFAULT-998822'}
                    </div>
                  </div>
                </div>

                {/* Dispatch Actions */}
                <div className="pt-2 flex flex-col gap-2">
                  {selectedDispatch.status === DispatchStatus.PENDING && (
                    <button
                      onClick={() => handleUpdateStatus(selectedDispatch, DispatchStatus.IN_TRANSIT)}
                      disabled={actionLoading === selectedDispatch.id}
                      className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-lg transition shadow-md shadow-blue-900/30"
                    >
                      🚚 Handover Parcel to {selectedDispatch.carrier}
                    </button>
                  )}

                  {selectedDispatch.status === DispatchStatus.IN_TRANSIT && (
                    <button
                      onClick={() => handleUpdateStatus(selectedDispatch, DispatchStatus.DELIVERED)}
                      disabled={actionLoading === selectedDispatch.id}
                      className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-lg transition"
                    >
                      📦 Log Final Customer Delivery (POD Fulfilled)
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="py-12 text-center text-slate-500 text-xs">
                Select any manifest from the dock queue to preview the live shipping label and carrier telemetry.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
