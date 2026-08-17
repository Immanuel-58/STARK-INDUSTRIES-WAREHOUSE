export enum InventoryStatus {
  AVAILABLE = 'AVAILABLE',
  RESERVED = 'RESERVED',
  PICKED = 'PICKED',
  DAMAGED = 'DAMAGED',
  QUARANTINED = 'QUARANTINED'
}

export enum OrderStatus {
  CREATED = 'CREATED',
  PRIORITY_SET = 'PRIORITY_SET',
  INVENTORY_CHECKED = 'INVENTORY_CHECKED',
  ALLOCATED = 'ALLOCATED',
  PICKING = 'PICKING',
  PACKING = 'PACKING',
  QUALITY_CHECK = 'QUALITY_CHECK',
  DISPATCHED = 'DISPATCHED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  EXCEPTION = 'EXCEPTION'
}

export enum PickingStatus {
  PENDING = 'PENDING',
  PICKING = 'PICKING',
  PICKED = 'PICKED',
  EXCEPTION = 'EXCEPTION'
}

export enum PackingStatus {
  PENDING = 'PENDING',
  PACKING = 'PACKING',
  PACKED = 'PACKED',
  EXCEPTION = 'EXCEPTION'
}

export enum QualityCheckStatus {
  PENDING = 'PENDING',
  PASSED = 'PASSED',
  FAILED = 'FAILED'
}

export enum DispatchStatus {
  PENDING = 'PENDING',
  IN_TRANSIT = 'IN_TRANSIT',
  DELIVERED = 'DELIVERED',
  FAILED = 'FAILED'
}

export enum ExceptionType {
  LOW_STOCK = 'LOW_STOCK',
  OUT_OF_STOCK = 'OUT_OF_STOCK',
  DAMAGED_ITEM = 'DAMAGED_ITEM',
  MISSING_ITEM = 'MISSING_ITEM',
  PARTIAL_ALLOCATION = 'PARTIAL_ALLOCATION',
  PICKING_DELAY = 'PICKING_DELAY',
  PACKING_FAILURE = 'PACKING_FAILURE',
  QUALITY_FAILURE = 'QUALITY_FAILURE',
  DISPATCH_DELAY = 'DISPATCH_DELAY',
  SLA_RISK = 'SLA_RISK'
}

export enum ExceptionSeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL'
}

export enum DecisionType {
  ORDER_PRIORITIZATION = 'ORDER_PRIORITIZATION',
  INVENTORY_ALLOCATION = 'INVENTORY_ALLOCATION',
  PARTIAL_ALLOCATION = 'PARTIAL_ALLOCATION',
  REALLOCATION = 'REALLOCATION',
  REORDER_RECOMMENDATION = 'REORDER_RECOMMENDATION',
  PICKING_PRIORITIZATION = 'PICKING_PRIORITIZATION',
  EXCEPTION_SEVERITY = 'EXCEPTION_SEVERITY',
  SLA_RISK_DETECTION = 'SLA_RISK_DETECTION'
}

export enum MovementType {
  INBOUND = 'INBOUND',
  OUTBOUND = 'OUTBOUND',
  TRANSFER = 'TRANSFER',
  ADJUSTMENT = 'ADJUSTMENT',
  DAMAGED = 'DAMAGED',
  QUARANTINE = 'QUARANTINE',
  RESERVATION = 'RESERVATION',
  RELEASE = 'RELEASE'
}

export enum OrderChannel {
  WEB = 'WEB',
  MOBILE = 'MOBILE',
  WHOLESALE = 'WHOLESALE',
  MARKETPLACE = 'MARKETPLACE',
  INTERNAL = 'INTERNAL'
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  warehouse_id?: string;
  created_at: string;
  updated_at: string;
}

export interface Warehouse {
  id: string;
  name: string;
  code: string;
  address: string;
  capacity: number;
  is_active: boolean;
}

export interface WarehouseLocation {
  id: string;
  warehouse_id: string;
  zone: string;
  aisle: string;
  rack: string;
  shelf: string;
  bin: string;
  location_code: string;
  is_active: boolean;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  description?: string;
  category: string;
  unit_price: number;
  weight?: number;
  dimensions?: string;
  reorder_point: number;
  reorder_quantity: number;
  is_active: boolean;
}

export interface Inventory {
  id: string;
  product_id: string;
  warehouse_id: string;
  location_id: string;
  quantity: number;
  available_quantity: number;
  reserved_quantity: number;
  damaged_quantity: number;
  quarantined_quantity: number;
  status: InventoryStatus;
  batch_number?: string;
  expiry_date?: string;
}

export interface Customer {
  id: string;
  name: string;
  email: string;
  tier: 'standard' | 'premium' | 'vip';
  channel: OrderChannel;
  address: string;
  sla_hours: number;
}

export interface Order {
  id: string;
  order_number: string;
  customer_id: string;
  warehouse_id: string;
  status: OrderStatus;
  channel: OrderChannel;
  priority_score: number;
  total_value: number;
  sla_deadline: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  quantity: number;
  allocated_quantity: number;
  picked_quantity: number;
  unit_price: number;
}

export interface InventoryReservation {
  id: string;
  order_id: string;
  order_item_id: string;
  inventory_id: string;
  quantity: number;
  status: 'active' | 'released' | 'fulfilled' | 'cancelled';
  reserved_at: string;
  released_at?: string;
}

export interface PickingTask {
  id: string;
  order_id: string;
  warehouse_id: string;
  assigned_to?: string;
  status: PickingStatus;
  priority: number;
  location_sequence: string[];
  started_at?: string;
  completed_at?: string;
  notes?: string;
}

export interface PackingTask {
  id: string;
  order_id: string;
  picking_task_id: string;
  assigned_to?: string;
  status: PackingStatus;
  started_at?: string;
  completed_at?: string;
  notes?: string;
}

export interface QualityCheck {
  id: string;
  order_id: string;
  packing_task_id: string;
  inspector_id?: string;
  status: QualityCheckStatus;
  check_items: Record<string, any>;
  notes?: string;
  checked_at?: string;
}

export interface Dispatch {
  id: string;
  order_id: string;
  tracking_number: string;
  carrier: string;
  status: DispatchStatus;
  dispatched_at?: string;
  delivered_at?: string;
  notes?: string;
}

export interface Exception {
  id: string;
  type: ExceptionType;
  severity: ExceptionSeverity;
  order_id?: string;
  product_id?: string;
  inventory_id?: string;
  title: string;
  description: string;
  resolution?: string;
  resolved_by?: string;
  resolved_at?: string;
  created_at: string;
}

export interface InventoryMovement {
  id: string;
  inventory_id: string;
  product_id: string;
  warehouse_id: string;
  movement_type: MovementType;
  quantity: number;
  from_status: InventoryStatus;
  to_status: InventoryStatus;
  reference_id?: string;
  reference_type?: string;
  notes?: string;
  created_at: string;
}

export interface DecisionEvent {
  id: string;
  decision_type: DecisionType;
  inputs: Record<string, any>;
  priority_score?: number;
  decision: string;
  reason: string;
  affected_orders: string[];
  affected_items: Record<string, any>;
  recommended_action?: string;
  created_by?: string;
  created_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  reference_id?: string;
  reference_type?: string;
  created_at: string;
}

export interface PriorityWeights {
  sla_urgency: number;
  order_value: number;
  order_age: number;
  business_importance: number;
  channel_priority: number;
}

export interface PriorityInputs {
  sla_deadline: Date | string;
  order_value: number;
  created_at: Date | string;
  customer_tier: string;
  channel: OrderChannel;
  margin?: number;
}

export interface AllocationResult {
  order_id: string;
  product_id: string;
  requested: number;
  allocated: number;
  is_partial: boolean;
  shortage: number;
  source_inventory: { inventory_id: string; quantity: number }[];
  decision_event_id?: string;
}

export interface SimulationScenario {
  id: string;
  name: string;
  description: string;
  event_type: string;
  params: Record<string, unknown>;
  created_at: string;
}

export interface SimulationResult {
  scenario_id: string;
  before_state: Record<string, any>;
  after_state: Record<string, any>;
  decisions: DecisionEvent[];
  exceptions: Exception[];
  recommendations: string[];
}

export interface AnalyticsSummary {
  total_orders: number;
  urgent_orders: number;
  pending_orders: number;
  allocation_rate: number;
  partial_allocations: number;
  picking_backlog: number;
  packing_backlog: number;
  dispatch_backlog: number;
  low_stock_products: number;
  out_of_stock_products: number;
  damaged_inventory: number;
  fulfillment_rate: number;
  sla_risk_orders: number;
  inventory_utilization: number;
  bottlenecks: string[];
  stage_distribution?: { stage: string; count: number }[];
  tier_distribution?: { tier: string; count: number; value: number }[];
  channel_distribution?: { channel: string; count: number }[];
  sku_stock_distribution?: { sku: string; name: string; available: number; reserved: number; damaged: number; reorder_point: number }[];
  shift_throughput?: { hour: string; received: number; allocated: number; picked: number; packed: number; dispatched: number }[];
}
