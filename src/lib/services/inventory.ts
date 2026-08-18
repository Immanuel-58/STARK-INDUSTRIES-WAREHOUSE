import { Inventory, InventoryMovement, MovementType, InventoryStatus, Product } from '@/lib/types';

// In-memory store
let inventoryStore: Inventory[] = [];
let movementStore: InventoryMovement[] = [];

export function initializeInventory(data: Inventory[]): void {
  inventoryStore = data.map(item => ({ ...item }));
  movementStore = [];
}

export function getInventory(filters?: { product_id?: string, warehouse_id?: string, status?: InventoryStatus }): Inventory[] {
  let result = inventoryStore;
  if (filters) {
    if (filters.product_id) result = result.filter(i => i.product_id === filters.product_id);
    if (filters.warehouse_id) result = result.filter(i => i.warehouse_id === filters.warehouse_id);
    if (filters.status) result = result.filter(i => i.status === filters.status);
  }
  return result;
}

export function getInventoryByProduct(product_id: string): Inventory[] {
  return getInventory({ product_id });
}

export function getAvailableStock(product_id: string, warehouse_id?: string): number {
  return getInventory({ product_id, warehouse_id }).reduce((sum, item) => sum + item.available_quantity, 0);
}

export function reserveStock(inventory_id: string, quantity: number, reference_id: string): { success: boolean, error?: string, movement?: InventoryMovement } {
  if (quantity <= 0) return { success: false, error: 'Quantity must be greater than 0' };

  const inventory = inventoryStore.find(i => i.id === inventory_id);
  if (!inventory) return { success: false, error: 'Inventory not found' };

  if (inventory.available_quantity < quantity) {
    return { success: false, error: 'Insufficient available quantity' };
  }

  // Check double reservation
  const existingMovement = movementStore.find(m => m.inventory_id === inventory_id && m.reference_id === reference_id && m.movement_type === MovementType.RESERVATION);
  if (existingMovement) {
    return { success: false, error: 'Already reserved for this reference' };
  }

  inventory.reserved_quantity += quantity;
  inventory.available_quantity = inventory.quantity - inventory.reserved_quantity - inventory.damaged_quantity - inventory.quarantined_quantity;

  const movement: InventoryMovement = {
    id: crypto.randomUUID(),
    inventory_id,
    product_id: inventory.product_id,
    warehouse_id: inventory.warehouse_id,
    movement_type: MovementType.RESERVATION,
    quantity,
    from_status: InventoryStatus.AVAILABLE,
    to_status: InventoryStatus.RESERVED,
    reference_id,
    reference_type: 'order',
    created_at: new Date().toISOString()
  };
  movementStore.push(movement);

  return { success: true, movement };
}

export function releaseReservation(inventory_id: string, quantity: number, reference_id: string): { success: boolean, error?: string } {
  if (quantity <= 0) return { success: false, error: 'Quantity must be greater than 0' };

  const inventory = inventoryStore.find(i => i.id === inventory_id);
  if (!inventory) return { success: false, error: 'Inventory not found' };

  if (inventory.reserved_quantity < quantity) {
    return { success: false, error: 'Cannot release more than reserved' };
  }

  inventory.reserved_quantity -= quantity;
  inventory.available_quantity = inventory.quantity - inventory.reserved_quantity - inventory.damaged_quantity - inventory.quarantined_quantity;

  const movement: InventoryMovement = {
    id: crypto.randomUUID(),
    inventory_id,
    product_id: inventory.product_id,
    warehouse_id: inventory.warehouse_id,
    movement_type: MovementType.RELEASE,
    quantity,
    from_status: InventoryStatus.RESERVED,
    to_status: InventoryStatus.AVAILABLE,
    reference_id,
    reference_type: 'order',
    created_at: new Date().toISOString()
  };
  movementStore.push(movement);

  return { success: true };
}

export function markDamaged(inventory_id: string, quantity: number, reason: string): { success: boolean, error?: string } {
  if (quantity <= 0) return { success: false, error: 'Quantity must be greater than 0' };

  const inventory = inventoryStore.find(i => i.id === inventory_id);
  if (!inventory) return { success: false, error: 'Inventory not found' };

  if (inventory.available_quantity < quantity) {
    return { success: false, error: 'Insufficient available quantity to mark damaged' };
  }

  inventory.damaged_quantity += quantity;
  inventory.available_quantity = inventory.quantity - inventory.reserved_quantity - inventory.damaged_quantity - inventory.quarantined_quantity;

  const movement: InventoryMovement = {
    id: crypto.randomUUID(),
    inventory_id,
    product_id: inventory.product_id,
    warehouse_id: inventory.warehouse_id,
    movement_type: MovementType.DAMAGED,
    quantity,
    from_status: InventoryStatus.AVAILABLE,
    to_status: InventoryStatus.DAMAGED,
    notes: reason,
    created_at: new Date().toISOString()
  };
  movementStore.push(movement);

  return { success: true };
}

export function markQuarantined(inventory_id: string, quantity: number, reason: string): { success: boolean, error?: string } {
  if (quantity <= 0) return { success: false, error: 'Quantity must be greater than 0' };

  const inventory = inventoryStore.find(i => i.id === inventory_id);
  if (!inventory) return { success: false, error: 'Inventory not found' };

  if (inventory.available_quantity < quantity) {
    return { success: false, error: 'Insufficient available quantity to quarantine' };
  }

  inventory.quarantined_quantity += quantity;
  inventory.available_quantity = inventory.quantity - inventory.reserved_quantity - inventory.damaged_quantity - inventory.quarantined_quantity;

  const movement: InventoryMovement = {
    id: crypto.randomUUID(),
    inventory_id,
    product_id: inventory.product_id,
    warehouse_id: inventory.warehouse_id,
    movement_type: MovementType.QUARANTINE,
    quantity,
    from_status: InventoryStatus.AVAILABLE,
    to_status: InventoryStatus.QUARANTINED,
    notes: reason,
    created_at: new Date().toISOString()
  };
  movementStore.push(movement);

  return { success: true };
}

export function adjustStock(inventory_id: string, quantity: number, reason: string): { success: boolean, error?: string } {
  const inventory = inventoryStore.find(i => i.id === inventory_id);
  if (!inventory) return { success: false, error: 'Inventory not found' };

  const newTotal = inventory.quantity + quantity;
  if (newTotal < inventory.reserved_quantity + inventory.damaged_quantity + inventory.quarantined_quantity) {
     return { success: false, error: 'Resulting total quantity cannot be less than unavailable stock' };
  }

  inventory.quantity = newTotal;
  inventory.available_quantity = inventory.quantity - inventory.reserved_quantity - inventory.damaged_quantity - inventory.quarantined_quantity;

  const movement: InventoryMovement = {
    id: crypto.randomUUID(),
    inventory_id,
    product_id: inventory.product_id,
    warehouse_id: inventory.warehouse_id,
    movement_type: MovementType.ADJUSTMENT,
    quantity: Math.abs(quantity),
    from_status: InventoryStatus.AVAILABLE,
    to_status: InventoryStatus.AVAILABLE,
    notes: reason,
    created_at: new Date().toISOString()
  };
  movementStore.push(movement);

  return { success: true };
}

export function getMovementHistory(inventory_id?: string, product_id?: string): InventoryMovement[] {
  let result = movementStore;
  if (inventory_id) {
    result = result.filter(m => m.inventory_id === inventory_id);
  }
  if (product_id) {
    const invIds = inventoryStore.filter(i => i.product_id === product_id).map(i => i.id);
    result = result.filter(m => invIds.includes(m.inventory_id));
  }
  return result;
}

export function getLowStockProducts(products: Product[]): { product: Product, current_stock: number, reorder_point: number }[] {
  const stockMap = new Map<string, number>();
  for (const item of inventoryStore) {
    stockMap.set(item.product_id, (stockMap.get(item.product_id) || 0) + item.available_quantity);
  }

  const lowStock: { product: Product, current_stock: number, reorder_point: number }[] = [];
  for (const product of products) {
    const stock = stockMap.get(product.id) || 0;
    if (stock <= product.reorder_point && stock > 0) {
      lowStock.push({ product, current_stock: stock, reorder_point: product.reorder_point });
    }
  }
  return lowStock;
}

export function getOutOfStockProducts(products: Product[]): Product[] {
  const stockMap = new Map<string, number>();
  for (const item of inventoryStore) {
    stockMap.set(item.product_id, (stockMap.get(item.product_id) || 0) + item.available_quantity);
  }

  const outOfStock: Product[] = [];
  for (const product of products) {
    const stock = stockMap.get(product.id) || 0;
    if (stock === 0) {
      outOfStock.push(product);
    }
  }
  return outOfStock;
}

export function resetInventory(): void {
  inventoryStore = [];
  movementStore = [];
}
