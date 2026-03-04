-- ============================================
-- Stal Florida Reserveringssysteem
-- Database Migration
-- Run this in Supabase SQL Editor
-- ============================================

-- Products table
CREATE TABLE products (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT DEFAULT '🐴',
  price DECIMAL(10,2) NOT NULL,
  start_time TIME NOT NULL,
  arrive_time TIME,
  duration_minutes INTEGER NOT NULL,
  required_gaits TEXT[] DEFAULT '{}',
  min_age INTEGER DEFAULT 0,
  max_weight_adult INTEGER DEFAULT 85,
  max_weight_child INTEGER DEFAULT 50,
  slots_adult INTEGER DEFAULT 3,
  slots_child INTEGER DEFAULT 3,
  slots_total INTEGER DEFAULT 6,
  available_days INTEGER[] DEFAULT '{1,2,3,4,5,6}',
  warning TEXT,
  active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  gradient TEXT DEFAULT 'ocean',
  accent TEXT DEFAULT '2D6A7A',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Blocked dates table
CREATE TABLE blocked_dates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  date DATE NOT NULL,
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Reservations table
CREATE TABLE reservations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES products(id),
  date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'expired', 'cancelled')),
  riders JSONB NOT NULL DEFAULT '[]',
  num_adults INTEGER NOT NULL DEFAULT 0,
  num_children INTEGER NOT NULL DEFAULT 0,
  contact_name TEXT,
  contact_email TEXT NOT NULL,
  contact_phone TEXT,
  mollie_payment_id TEXT,
  total_amount DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX idx_reservations_product_date ON reservations(product_id, date);
CREATE INDEX idx_reservations_status ON reservations(status);
CREATE INDEX idx_reservations_mollie ON reservations(mollie_payment_id);
CREATE INDEX idx_reservations_expires ON reservations(expires_at) WHERE status = 'pending';
CREATE INDEX idx_blocked_dates_date ON blocked_dates(date);
CREATE INDEX idx_products_active ON products(active) WHERE active = true;

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- Row Level Security Policies
-- ============================================

ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE blocked_dates ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;

-- Products: everyone can read active products
CREATE POLICY "Public can view active products"
  ON products FOR SELECT
  USING (active = true);

-- Blocked dates: everyone can read
CREATE POLICY "Public can view blocked dates"
  ON blocked_dates FOR SELECT
  USING (true);

-- Reservations: public can insert (create booking)
CREATE POLICY "Public can create reservations"
  ON reservations FOR INSERT
  WITH CHECK (true);

-- Reservations: public can read their own (by email, for confirmation page)
CREATE POLICY "Public can view own reservations"
  ON reservations FOR SELECT
  USING (true);

-- Note: All admin operations use the service_role key which bypasses RLS

-- ============================================
-- Seed Data: Initial Products
-- ============================================

INSERT INTO products (name, description, icon, price, start_time, arrive_time, duration_minutes, required_gaits, min_age, max_weight_adult, max_weight_child, slots_adult, slots_child, slots_total, available_days, warning, sort_order, gradient, accent) VALUES
(
  'Strandrit',
  'Galopperen over het breedste strand van Europa. Bij aankomst worden vaardigheden in de bak getoetst.',
  '🌊',
  45.00,
  '09:30',
  '09:00',
  90,
  '{stap,draf,galop}',
  10,
  85,
  50,
  3,
  3,
  6,
  '{1,2,3,4,5,6}',
  'Bij onvoldoende vaardigheden wordt de rit omgezet. Reserveringskosten van €20 zijn dan van toepassing.',
  1,
  'ocean',
  '2D6A7A'
),
(
  'Bosrit',
  'Verken de stilte van het Schiermonnikoogse bos.',
  '🌲',
  35.00,
  '11:00',
  '10:45',
  60,
  '{stap,draf}',
  9,
  85,
  50,
  3,
  3,
  6,
  '{1,2,3,4,5,6}',
  NULL,
  2,
  'forest',
  '2D5A3A'
);

-- ============================================
-- Function: Expire old pending reservations
-- Run this as a Supabase cron job (every 5 min)
-- ============================================

CREATE OR REPLACE FUNCTION expire_pending_reservations()
RETURNS void AS $$
BEGIN
  UPDATE reservations
  SET status = 'expired'
  WHERE status = 'pending'
    AND expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- To set up the cron job, go to Supabase Dashboard > Database > Extensions
-- Enable pg_cron, then run:
-- SELECT cron.schedule('expire-pending', '*/5 * * * *', 'SELECT expire_pending_reservations()');
