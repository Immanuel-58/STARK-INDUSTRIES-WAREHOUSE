import { z } from 'zod';
import { 
  OrderChannel, 
  OrderStatus, 
  PickingStatus, 
  PackingStatus, 
  QualityCheckStatus, 
  DispatchStatus, 
  ExceptionType, 
  ExceptionSeverity, 
  InventoryStatus 
} from '../types';

export const createOrderSchema = z.object({
  customer_id: z.string().uuid(),
  warehouse_id: z.string().uuid(),
  channel: z.nativeEnum(OrderChannel),
  items: z.array(z.object({
    product_id: z.string().uuid(),
    quantity: z.number().int().positive(),
    unit_price: z.number().positive()
  })).min(1),
  notes: z.string().optional(),
  sla_deadline: z.string().datetime().optional()
});

export const updateOrderStatusSchema = z.object({
  order_id: z.string().uuid(),
  status: z.nativeEnum(OrderStatus)
});

export const createProductSchema = z.object({
  sku: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  category: z.string().min(1),
  unit_price: z.number().nonnegative(),
  weight: z.number().nonnegative().optional(),
  dimensions: z.string().optional(),
  reorder_point: z.number().int().nonnegative().default(0),
  reorder_quantity: z.number().int().nonnegative().default(0),
  is_active: z.boolean().default(true)
});

export const updateInventorySchema = z.object({
  inventory_id: z.string().uuid(),
  quantity: z.number().int().nonnegative().optional(),
  status: z.nativeEnum(InventoryStatus).optional(),
  batch_number: z.string().optional(),
  expiry_date: z.string().optional() // ISO date
});

export const createExceptionSchema = z.object({
  type: z.nativeEnum(ExceptionType),
  severity: z.nativeEnum(ExceptionSeverity),
  order_id: z.string().uuid().optional(),
  product_id: z.string().uuid().optional(),
  inventory_id: z.string().uuid().optional(),
  title: z.string().min(1),
  description: z.string().min(1)
});

export const allocationRequestSchema = z.object({
  order_id: z.string().uuid(),
  items: z.array(z.object({
    product_id: z.string().uuid(),
    quantity: z.number().int().positive()
  })).min(1)
});

export const pickingTaskUpdateSchema = z.object({
  task_id: z.string().uuid(),
  status: z.nativeEnum(PickingStatus),
  assigned_to: z.string().uuid().optional(),
  notes: z.string().optional()
});

export const packingTaskUpdateSchema = z.object({
  task_id: z.string().uuid(),
  status: z.nativeEnum(PackingStatus),
  assigned_to: z.string().uuid().optional(),
  notes: z.string().optional()
});

export const qualityCheckSchema = z.object({
  order_id: z.string().uuid(),
  packing_task_id: z.string().uuid(),
  status: z.nativeEnum(QualityCheckStatus),
  check_items: z.record(z.string(), z.any()),
  notes: z.string().optional()
});

export const dispatchSchema = z.object({
  order_id: z.string().uuid(),
  tracking_number: z.string().min(1),
  carrier: z.string().min(1),
  notes: z.string().optional()
});

export const simulationRequestSchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  event_type: z.string().min(1),
  params: z.record(z.string(), z.any())
});
