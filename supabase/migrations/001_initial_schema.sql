CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enums
CREATE TYPE inventory_status AS ENUM ('AVAILABLE', 'RESERVED', 'PICKED', 'DAMAGED', 'QUARANTINED');
CREATE TYPE order_status AS ENUM ('CREATED', 'PRIORITY_SET', 'INVENTORY_CHECKED', 'ALLOCATED', 'PICKING', 'PACKING', 'QUALITY_CHECK', 'DISPATCHED', 'COMPLETED', 'CANCELLED', 'EXCEPTION');
CREATE TYPE picking_status AS ENUM ('PENDING', 'PICKING', 'PICKED', 'EXCEPTION');
CREATE TYPE packing_status AS ENUM ('PENDING', 'PACKING', 'PACKED', 'EXCEPTION');
CREATE TYPE quality_check_status AS ENUM ('PENDING', 'PASSED', 'FAILED');
CREATE TYPE dispatch_status AS ENUM ('PENDING', 'IN_TRANSIT', 'DELIVERED', 'FAILED');
CREATE TYPE exception_type AS ENUM ('LOW_STOCK', 'OUT_OF_STOCK', 'DAMAGED_ITEM', 'MISSING_ITEM', 'PARTIAL_ALLOCATION', 'PICKING_DELAY', 'PACKING_FAILURE', 'QUALITY_FAILURE', 'DISPATCH_DELAY', 'SLA_RISK');
CREATE TYPE exception_severity AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
CREATE TYPE decision_type AS ENUM ('ORDER_PRIORITIZATION', 'INVENTORY_ALLOCATION', 'PARTIAL_ALLOCATION', 'REALLOCATION', 'REORDER_RECOMMENDATION', 'PICKING_PRIORITIZATION', 'EXCEPTION_SEVERITY', 'SLA_RISK_DETECTION');
CREATE TYPE movement_type AS ENUM ('INBOUND', 'OUTBOUND', 'TRANSFER', 'ADJUSTMENT', 'DAMAGED', 'QUARANTINE', 'RESERVATION', 'RELEASE');
CREATE TYPE order_channel AS ENUM ('WEB', 'MOBILE', 'WHOLESALE', 'MARKETPLACE', 'INTERNAL');

-- Update Trigger Function
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Tables
CREATE TABLE "user" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL,
  warehouse_id UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE TRIGGER trg_user_updated_at BEFORE UPDATE ON "user" FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE warehouse (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  code VARCHAR(50) UNIQUE NOT NULL,
  address TEXT NOT NULL,
  capacity INT NOT NULL,
  is_active BOOLEAN DEFAULT TRUE
);

CREATE TABLE warehouse_location (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  warehouse_id UUID NOT NULL REFERENCES warehouse(id) ON DELETE CASCADE,
  zone VARCHAR(50) NOT NULL,
  aisle VARCHAR(50) NOT NULL,
  rack VARCHAR(50) NOT NULL,
  shelf VARCHAR(50) NOT NULL,
  bin VARCHAR(50) NOT NULL,
  location_code VARCHAR(100) UNIQUE NOT NULL,
  is_active BOOLEAN DEFAULT TRUE
);

CREATE TABLE product (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sku VARCHAR(100) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(100) NOT NULL,
  unit_price DECIMAL(12, 2) NOT NULL,
  weight DECIMAL(10, 2),
  dimensions VARCHAR(100),
  reorder_point INT NOT NULL DEFAULT 0,
  reorder_quantity INT NOT NULL DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE
);

CREATE TABLE inventory (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES product(id) ON DELETE CASCADE,
  warehouse_id UUID NOT NULL REFERENCES warehouse(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES warehouse_location(id) ON DELETE RESTRICT,
  quantity INT NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  available_quantity INT NOT NULL DEFAULT 0 CHECK (available_quantity >= 0),
  reserved_quantity INT NOT NULL DEFAULT 0 CHECK (reserved_quantity >= 0),
  damaged_quantity INT NOT NULL DEFAULT 0 CHECK (damaged_quantity >= 0),
  quarantined_quantity INT NOT NULL DEFAULT 0 CHECK (quarantined_quantity >= 0),
  status inventory_status NOT NULL DEFAULT 'AVAILABLE',
  batch_number VARCHAR(100),
  expiry_date DATE,
  CONSTRAINT chk_inventory_qty CHECK (available_quantity = quantity - reserved_quantity - damaged_quantity - quarantined_quantity)
);

CREATE TABLE customer (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  tier VARCHAR(50) NOT NULL CHECK (tier IN ('standard', 'premium', 'vip')),
  channel order_channel NOT NULL,
  address TEXT NOT NULL,
  sla_hours INT NOT NULL
);

CREATE TABLE "order" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_number VARCHAR(100) UNIQUE NOT NULL,
  customer_id UUID NOT NULL REFERENCES customer(id) ON DELETE CASCADE,
  warehouse_id UUID NOT NULL REFERENCES warehouse(id) ON DELETE CASCADE,
  status order_status NOT NULL DEFAULT 'CREATED',
  channel order_channel NOT NULL,
  priority_score INT DEFAULT 0,
  total_value DECIMAL(12, 2) NOT NULL DEFAULT 0,
  sla_deadline TIMESTAMP WITH TIME ZONE NOT NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE TRIGGER trg_order_updated_at BEFORE UPDATE ON "order" FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE order_item (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES "order"(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES product(id) ON DELETE RESTRICT,
  quantity INT NOT NULL CHECK (quantity > 0),
  allocated_quantity INT NOT NULL DEFAULT 0,
  picked_quantity INT NOT NULL DEFAULT 0,
  unit_price DECIMAL(12, 2) NOT NULL
);

CREATE TABLE inventory_reservation (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES "order"(id) ON DELETE CASCADE,
  order_item_id UUID NOT NULL REFERENCES order_item(id) ON DELETE CASCADE,
  inventory_id UUID NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,
  quantity INT NOT NULL CHECK (quantity > 0),
  status VARCHAR(50) NOT NULL CHECK (status IN ('active', 'released', 'fulfilled', 'cancelled')),
  reserved_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  released_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE picking_task (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES "order"(id) ON DELETE CASCADE,
  warehouse_id UUID NOT NULL REFERENCES warehouse(id) ON DELETE CASCADE,
  assigned_to UUID REFERENCES "user"(id) ON DELETE SET NULL,
  status picking_status NOT NULL DEFAULT 'PENDING',
  priority INT DEFAULT 0,
  location_sequence JSONB NOT NULL DEFAULT '[]',
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  notes TEXT
);

CREATE TABLE packing_task (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES "order"(id) ON DELETE CASCADE,
  picking_task_id UUID NOT NULL REFERENCES picking_task(id) ON DELETE CASCADE,
  assigned_to UUID REFERENCES "user"(id) ON DELETE SET NULL,
  status packing_status NOT NULL DEFAULT 'PENDING',
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  notes TEXT
);

CREATE TABLE quality_check (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES "order"(id) ON DELETE CASCADE,
  packing_task_id UUID NOT NULL REFERENCES packing_task(id) ON DELETE CASCADE,
  inspector_id UUID REFERENCES "user"(id) ON DELETE SET NULL,
  status quality_check_status NOT NULL DEFAULT 'PENDING',
  check_items JSONB NOT NULL,
  notes TEXT,
  checked_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE dispatch (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES "order"(id) ON DELETE CASCADE,
  tracking_number VARCHAR(100) UNIQUE NOT NULL,
  carrier VARCHAR(100) NOT NULL,
  status dispatch_status NOT NULL DEFAULT 'PENDING',
  dispatched_at TIMESTAMP WITH TIME ZONE,
  delivered_at TIMESTAMP WITH TIME ZONE,
  notes TEXT
);

CREATE TABLE exception (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type exception_type NOT NULL,
  severity exception_severity NOT NULL,
  order_id UUID REFERENCES "order"(id) ON DELETE CASCADE,
  product_id UUID REFERENCES product(id) ON DELETE CASCADE,
  inventory_id UUID REFERENCES inventory(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  resolution TEXT,
  resolved_by UUID REFERENCES "user"(id) ON DELETE SET NULL,
  resolved_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE inventory_movement (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  inventory_id UUID NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES product(id) ON DELETE CASCADE,
  warehouse_id UUID NOT NULL REFERENCES warehouse(id) ON DELETE CASCADE,
  movement_type movement_type NOT NULL,
  quantity INT NOT NULL,
  from_status inventory_status NOT NULL,
  to_status inventory_status NOT NULL,
  reference_id UUID,
  reference_type VARCHAR(100),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE decision_event (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  decision_type decision_type NOT NULL,
  inputs JSONB NOT NULL,
  priority_score INT,
  decision TEXT NOT NULL,
  reason TEXT NOT NULL,
  affected_orders JSONB NOT NULL DEFAULT '[]',
  affected_items JSONB NOT NULL DEFAULT '{}',
  recommended_action TEXT,
  created_by UUID REFERENCES "user"(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE notification (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  type VARCHAR(100) NOT NULL,
  is_read BOOLEAN DEFAULT FALSE,
  reference_id UUID,
  reference_type VARCHAR(100),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_inventory_product_id ON inventory(product_id);
CREATE INDEX idx_inventory_warehouse_id ON inventory(warehouse_id);
CREATE INDEX idx_order_status ON "order"(status);
CREATE INDEX idx_order_customer_id ON "order"(customer_id);
CREATE INDEX idx_order_warehouse_id ON "order"(warehouse_id);
CREATE INDEX idx_order_item_order_id ON order_item(order_id);
CREATE INDEX idx_picking_task_order_id ON picking_task(order_id);
CREATE INDEX idx_packing_task_order_id ON packing_task(order_id);
CREATE INDEX idx_exception_order_id ON exception(order_id);
CREATE INDEX idx_inventory_movement_inventory_id ON inventory_movement(inventory_id);
