-- ============================================
-- Migration: Guides (begeleiders) system
-- Run in Supabase SQL Editor
-- ============================================

CREATE TABLE IF NOT EXISTS guides (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS guide_assignments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  guide_id UUID NOT NULL REFERENCES guides(id) ON DELETE CASCADE,
  reservation_id UUID NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(guide_id, reservation_id)
);

CREATE INDEX IF NOT EXISTS idx_guide_assignments_reservation ON guide_assignments(reservation_id);
CREATE INDEX IF NOT EXISTS idx_guide_assignments_guide ON guide_assignments(guide_id);
CREATE INDEX IF NOT EXISTS idx_guides_active ON guides(active) WHERE active = true;

ALTER TABLE guides ENABLE ROW LEVEL SECURITY;
ALTER TABLE guide_assignments ENABLE ROW LEVEL SECURITY;

-- Guides: public can read active guides (for the /begeleiders page)
CREATE POLICY "Public can view active guides" ON guides FOR SELECT USING (active = true);

-- Guide assignments: public can read and insert/delete (for self-service signup)
CREATE POLICY "Public can view assignments" ON guide_assignments FOR SELECT USING (true);
CREATE POLICY "Public can create assignments" ON guide_assignments FOR INSERT WITH CHECK (true);
CREATE POLICY "Public can delete own assignments" ON guide_assignments FOR DELETE USING (true);
