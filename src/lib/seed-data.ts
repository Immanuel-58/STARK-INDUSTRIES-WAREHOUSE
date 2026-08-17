import {
  Warehouse,
  WarehouseLocation,
  Product,
  Inventory,
  Customer,
  InventoryStatus,
  OrderChannel,
} from '@/lib/types';

// ============================================================
// WAREHOUSES
// ============================================================
export const DEMO_WAREHOUSES: Warehouse[] = [
  {
    id: 'wh-001',
    name: 'Central Distribution Hub',
    code: 'CDH-01',
    address: '100 Logistics Ave, Chicago, IL 60601',
    capacity: 50000,
    is_active: true,
  },
  {
    id: 'wh-002',
    name: 'East Coast Fulfillment',
    code: 'ECF-01',
    address: '200 Harbor Rd, Newark, NJ 07102',
    capacity: 30000,
    is_active: true,
  },
];

// ============================================================
// WAREHOUSE LOCATIONS
// ============================================================
export const DEMO_LOCATIONS: WarehouseLocation[] = [
  { id: 'loc-001', warehouse_id: 'wh-001', zone: 'A', aisle: '1', rack: 'R1', shelf: 'S1', bin: 'B1', location_code: 'A-1-R1-S1-B1', is_active: true },
  { id: 'loc-002', warehouse_id: 'wh-001', zone: 'A', aisle: '1', rack: 'R1', shelf: 'S2', bin: 'B1', location_code: 'A-1-R1-S2-B1', is_active: true },
  { id: 'loc-003', warehouse_id: 'wh-001', zone: 'A', aisle: '2', rack: 'R1', shelf: 'S1', bin: 'B1', location_code: 'A-2-R1-S1-B1', is_active: true },
  { id: 'loc-004', warehouse_id: 'wh-001', zone: 'B', aisle: '1', rack: 'R1', shelf: 'S1', bin: 'B1', location_code: 'B-1-R1-S1-B1', is_active: true },
  { id: 'loc-005', warehouse_id: 'wh-001', zone: 'B', aisle: '2', rack: 'R1', shelf: 'S1', bin: 'B1', location_code: 'B-2-R1-S1-B1', is_active: true },
  { id: 'loc-006', warehouse_id: 'wh-002', zone: 'A', aisle: '1', rack: 'R1', shelf: 'S1', bin: 'B1', location_code: 'EC-A-1-R1-S1', is_active: true },
  { id: 'loc-007', warehouse_id: 'wh-002', zone: 'A', aisle: '2', rack: 'R1', shelf: 'S1', bin: 'B1', location_code: 'EC-A-2-R1-S1', is_active: true },
];

// ============================================================
// PRODUCTS
// ============================================================
export const DEMO_PRODUCTS: Product[] = [
  { id: 'prod-001', sku: 'ELEC-LAPTOP-001', name: 'ProBook Laptop 15"', description: 'Business laptop with 16GB RAM', category: 'Electronics', unit_price: 1299.99, weight: 2.1, reorder_point: 20, reorder_quantity: 50, is_active: true },
  { id: 'prod-002', sku: 'ELEC-PHONE-001', name: 'SmartPhone X12', description: 'Flagship smartphone', category: 'Electronics', unit_price: 899.99, weight: 0.2, reorder_point: 30, reorder_quantity: 100, is_active: true },
  { id: 'prod-003', sku: 'ELEC-TABLET-001', name: 'TabPro 10"', description: '10-inch tablet', category: 'Electronics', unit_price: 499.99, weight: 0.5, reorder_point: 15, reorder_quantity: 40, is_active: true },
  { id: 'prod-004', sku: 'ELEC-HEADPH-001', name: 'NoiseCancel Pro', description: 'Wireless noise-canceling headphones', category: 'Audio', unit_price: 349.99, weight: 0.3, reorder_point: 25, reorder_quantity: 60, is_active: true },
  { id: 'prod-005', sku: 'ELEC-WATCH-001', name: 'SmartWatch S5', description: 'Fitness smartwatch', category: 'Wearables', unit_price: 249.99, weight: 0.1, reorder_point: 20, reorder_quantity: 50, is_active: true },
  { id: 'prod-006', sku: 'ELEC-CHARGER-001', name: 'Universal Charger 65W', description: 'USB-C fast charger', category: 'Accessories', unit_price: 49.99, weight: 0.15, reorder_point: 50, reorder_quantity: 200, is_active: true },
  { id: 'prod-007', sku: 'ELEC-CABLE-001', name: 'USB-C Cable 2m', description: 'Braided USB-C cable', category: 'Accessories', unit_price: 14.99, weight: 0.05, reorder_point: 100, reorder_quantity: 500, is_active: true },
  { id: 'prod-008', sku: 'ELEC-MONITOR-001', name: 'UltraWide Monitor 34"', description: '34-inch curved ultrawide', category: 'Displays', unit_price: 799.99, weight: 8.5, reorder_point: 10, reorder_quantity: 25, is_active: true },
];

// ============================================================
// INVENTORY — crafted for demo scenarios
// ============================================================
export const DEMO_INVENTORY: Inventory[] = [
  // Laptops: 50 total, 45 available (normal stock)
  { id: 'inv-001', product_id: 'prod-001', warehouse_id: 'wh-001', location_id: 'loc-001', quantity: 50, available_quantity: 45, reserved_quantity: 5, damaged_quantity: 0, quarantined_quantity: 0, status: InventoryStatus.AVAILABLE },
  // Phones: 7 total, 7 available (SCARCE — triggers competing orders scenario)
  { id: 'inv-002', product_id: 'prod-002', warehouse_id: 'wh-001', location_id: 'loc-002', quantity: 7, available_quantity: 7, reserved_quantity: 0, damaged_quantity: 0, quarantined_quantity: 0, status: InventoryStatus.AVAILABLE },
  // Tablets: 40 total, 35 available (normal)
  { id: 'inv-003', product_id: 'prod-003', warehouse_id: 'wh-001', location_id: 'loc-003', quantity: 40, available_quantity: 35, reserved_quantity: 3, damaged_quantity: 2, quarantined_quantity: 0, status: InventoryStatus.AVAILABLE },
  // Headphones: 8 total, 5 available, 3 DAMAGED (damaged stock scenario)
  { id: 'inv-004', product_id: 'prod-004', warehouse_id: 'wh-001', location_id: 'loc-004', quantity: 8, available_quantity: 5, reserved_quantity: 0, damaged_quantity: 3, quarantined_quantity: 0, status: InventoryStatus.AVAILABLE },
  // SmartWatch: 12 total, 12 available (LOW STOCK — below reorder_point of 20)
  { id: 'inv-005', product_id: 'prod-005', warehouse_id: 'wh-001', location_id: 'loc-005', quantity: 12, available_quantity: 12, reserved_quantity: 0, damaged_quantity: 0, quarantined_quantity: 0, status: InventoryStatus.AVAILABLE },
  // Chargers: 180 total, 180 available (healthy stock)
  { id: 'inv-006', product_id: 'prod-006', warehouse_id: 'wh-001', location_id: 'loc-001', quantity: 180, available_quantity: 180, reserved_quantity: 0, damaged_quantity: 0, quarantined_quantity: 0, status: InventoryStatus.AVAILABLE },
  // Cables: 0 total (OUT OF STOCK)
  { id: 'inv-007', product_id: 'prod-007', warehouse_id: 'wh-001', location_id: 'loc-002', quantity: 0, available_quantity: 0, reserved_quantity: 0, damaged_quantity: 0, quarantined_quantity: 0, status: InventoryStatus.AVAILABLE },
  // Monitors: 25 total, 25 available (normal)
  { id: 'inv-008', product_id: 'prod-008', warehouse_id: 'wh-001', location_id: 'loc-004', quantity: 25, available_quantity: 25, reserved_quantity: 0, damaged_quantity: 0, quarantined_quantity: 0, status: InventoryStatus.AVAILABLE },
  // East Coast: Phones — 3 available (second warehouse, also scarce)
  { id: 'inv-009', product_id: 'prod-002', warehouse_id: 'wh-002', location_id: 'loc-006', quantity: 3, available_quantity: 3, reserved_quantity: 0, damaged_quantity: 0, quarantined_quantity: 0, status: InventoryStatus.AVAILABLE },
];

// ============================================================
// CUSTOMERS
// ============================================================
export const DEMO_CUSTOMERS: Customer[] = [
  { id: 'cust-001', name: 'Apex Technologies', email: 'orders@apextech.com', tier: 'vip', channel: OrderChannel.WHOLESALE, address: '500 Enterprise Blvd, San Jose, CA', sla_hours: 24 },
  { id: 'cust-002', name: 'Metro Retail Group', email: 'procurement@metroretail.com', tier: 'premium', channel: OrderChannel.MARKETPLACE, address: '300 Commerce St, New York, NY', sla_hours: 48 },
  { id: 'cust-003', name: 'Jane Smith', email: 'jane.smith@email.com', tier: 'standard', channel: OrderChannel.WEB, address: '123 Main St, Denver, CO', sla_hours: 72 },
  { id: 'cust-004', name: 'TechStart Inc.', email: 'ops@techstart.io', tier: 'premium', channel: OrderChannel.WEB, address: '800 Innovation Dr, Austin, TX', sla_hours: 48 },
  { id: 'cust-005', name: 'GlobalMart', email: 'supply@globalmart.com', tier: 'vip', channel: OrderChannel.WHOLESALE, address: '1000 Distribution Way, Memphis, TN', sla_hours: 24 },
];

// ============================================================
// DEMO SCENARIO DEFINITIONS
// ============================================================
export interface DemoScenario {
  id: string;
  name: string;
  description: string;
  orders: {
    customer_id: string;
    warehouse_id: string;
    channel: OrderChannel;
    items: { product_id: string; quantity: number; unit_price: number }[];
    sla_hours_from_now?: number;
    notes?: string;
  }[];
}

const now = () => new Date().toISOString();
const hoursFromNow = (h: number) => new Date(Date.now() + h * 60 * 60 * 1000).toISOString();

export const DEMO_SCENARIOS: DemoScenario[] = [
  {
    id: 'scenario-1',
    name: 'Normal Fulfillment',
    description: 'Standard order with sufficient stock — should flow through the entire pipeline without exceptions.',
    orders: [
      {
        customer_id: 'cust-003',
        warehouse_id: 'wh-001',
        channel: OrderChannel.WEB,
        items: [
          { product_id: 'prod-001', quantity: 2, unit_price: 1299.99 },
          { product_id: 'prod-006', quantity: 5, unit_price: 49.99 },
        ],
        sla_hours_from_now: 72,
        notes: 'Standard web order',
      },
    ],
  },
  {
    id: 'scenario-2',
    name: 'Urgent Order — Insufficient Stock',
    description: 'VIP customer needs 10 phones urgently, but only 7 available. System should partial-allocate and create exception.',
    orders: [
      {
        customer_id: 'cust-001',
        warehouse_id: 'wh-001',
        channel: OrderChannel.WHOLESALE,
        items: [{ product_id: 'prod-002', quantity: 10, unit_price: 899.99 }],
        sla_hours_from_now: 12,
        notes: 'URGENT: VIP customer needs phones for product launch',
      },
    ],
  },
  {
    id: 'scenario-3',
    name: 'Competing Orders — Scarce Inventory',
    description: 'Two orders compete for 7 available phones. High-priority VIP order (10 units) vs standard order (5 units). System must prioritize.',
    orders: [
      {
        customer_id: 'cust-001',
        warehouse_id: 'wh-001',
        channel: OrderChannel.WHOLESALE,
        items: [{ product_id: 'prod-002', quantity: 10, unit_price: 899.99 }],
        sla_hours_from_now: 16,
        notes: 'VIP bulk order',
      },
      {
        customer_id: 'cust-003',
        warehouse_id: 'wh-001',
        channel: OrderChannel.WEB,
        items: [{ product_id: 'prod-002', quantity: 5, unit_price: 899.99 }],
        sla_hours_from_now: 72,
        notes: 'Standard web order',
      },
    ],
  },
  {
    id: 'scenario-4',
    name: 'Damaged Stock',
    description: 'Order for headphones where 3 out of 8 units are damaged. System should detect damaged inventory and adjust allocation.',
    orders: [
      {
        customer_id: 'cust-002',
        warehouse_id: 'wh-001',
        channel: OrderChannel.MARKETPLACE,
        items: [{ product_id: 'prod-004', quantity: 6, unit_price: 349.99 }],
        sla_hours_from_now: 48,
        notes: 'Marketplace order — headphones',
      },
    ],
  },
  {
    id: 'scenario-5',
    name: 'Low Stock Reorder',
    description: 'SmartWatch stock is at 12 units (below reorder_point of 20). System should detect and recommend reorder.',
    orders: [
      {
        customer_id: 'cust-004',
        warehouse_id: 'wh-001',
        channel: OrderChannel.WEB,
        items: [{ product_id: 'prod-005', quantity: 5, unit_price: 249.99 }],
        sla_hours_from_now: 48,
        notes: 'Order triggering low-stock detection',
      },
    ],
  },
  {
    id: 'scenario-6',
    name: 'SLA Risk — Picking Bottleneck',
    description: 'Multiple orders with tight SLA deadlines creating a picking backlog. System should detect SLA risk.',
    orders: [
      {
        customer_id: 'cust-005',
        warehouse_id: 'wh-001',
        channel: OrderChannel.WHOLESALE,
        items: [
          { product_id: 'prod-001', quantity: 10, unit_price: 1299.99 },
          { product_id: 'prod-003', quantity: 8, unit_price: 499.99 },
        ],
        sla_hours_from_now: 8,
        notes: 'URGENT: Must ship today',
      },
      {
        customer_id: 'cust-001',
        warehouse_id: 'wh-001',
        channel: OrderChannel.WHOLESALE,
        items: [
          { product_id: 'prod-008', quantity: 5, unit_price: 799.99 },
          { product_id: 'prod-006', quantity: 20, unit_price: 49.99 },
        ],
        sla_hours_from_now: 10,
        notes: 'URGENT: VIP warehouse replenishment',
      },
    ],
  },
];

export function getSeedTimestamp(): string {
  return now();
}

export function getSLADeadline(hoursFromNowValue: number): string {
  return hoursFromNow(hoursFromNowValue);
}
