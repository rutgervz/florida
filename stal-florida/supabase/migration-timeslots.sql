-- ============================================
-- Migration: Add time slots + max age support
-- Run this in Supabase SQL Editor
-- ============================================

-- Add time_slots array to products (NULL means single slot using start_time)
ALTER TABLE products ADD COLUMN IF NOT EXISTS time_slots TIME[] DEFAULT NULL;

-- Add max_age to products (NULL means no max age limit)
ALTER TABLE products ADD COLUMN IF NOT EXISTS max_age INTEGER DEFAULT NULL;

-- Add time_slot to reservations (NULL for products without time slots)
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS time_slot TIME DEFAULT NULL;

-- Update index to include time_slot
DROP INDEX IF EXISTS idx_reservations_product_date;
CREATE INDEX idx_reservations_product_date_slot ON reservations(product_id, date, time_slot);

-- Insert Wandelpony's product
INSERT INTO products (name, description, icon, price, start_time, arrive_time, duration_minutes, required_gaits, min_age, max_age, max_weight_adult, max_weight_child, slots_adult, slots_child, slots_total, available_days, time_slots, warning, sort_order, gradient, accent) VALUES
(
  'Wandelpony',
  'Een uur wandelen met de pony. Inclusief cap. Voor kinderen tot en met 10 jaar.',
  '🐴',
  20.00,
  '09:30',
  '09:15',
  60,
  '{stap}',
  0,
  10,
  50,
  50,
  0,
  6,
  6,
  '{1,2,3,4,5,6}',
  '{09:30,10:30,13:30,14:30}',
  NULL,
  3,
  'pony',
  'B8860B'
);
