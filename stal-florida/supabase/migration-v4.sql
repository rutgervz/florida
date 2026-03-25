-- ============================================
-- Migration v4: time_slot blocking + offline bookings
-- Run in Supabase SQL Editor
-- ============================================

-- Add time_slot to blocked_dates (NULL = block entire day for that product)
ALTER TABLE blocked_dates ADD COLUMN IF NOT EXISTS time_slot TIME DEFAULT NULL;

-- Allow 'offline' status for manually entered bookings
ALTER TABLE reservations DROP CONSTRAINT IF EXISTS reservations_status_check;
ALTER TABLE reservations ADD CONSTRAINT reservations_status_check 
  CHECK (status IN ('pending', 'confirmed', 'expired', 'cancelled', 'offline'));

-- Update the expire function to not touch offline bookings
CREATE OR REPLACE FUNCTION expire_pending_reservations()
RETURNS void AS $$
BEGIN
  UPDATE reservations
  SET status = 'expired'
  WHERE status = 'pending'
    AND expires_at < NOW();
END;
$$ LANGUAGE plpgsql;
