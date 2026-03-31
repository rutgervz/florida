-- ============================================
-- Migration: Settings table for voorwaarden
-- Run in Supabase SQL Editor
-- ============================================

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read settings"
  ON settings FOR SELECT USING (true);

-- Insert default voorwaarden
INSERT INTO settings (key, value) VALUES ('voorwaarden', 
'Algemene Voorwaarden Stal Florida

1. Reserveringen
Reserveringen zijn definitief na betaling en kunnen niet worden geannuleerd of gewijzigd.

2. Aanwezigheid
Ruiters dienen op de aangegeven aankomsttijd aanwezig te zijn. Bij te laat komen kan de rit niet worden ingehaald.

3. Veiligheid
Alle ruiters zijn verplicht een helm te dragen. Helmen worden door de stal verstrekt. Aanwijzingen van de begeleider dienen altijd te worden opgevolgd.

4. Gewicht en leeftijd
De maximale gewichts- en leeftijdsgrenzen per rit zijn strikt. Bij twijfel wordt ter plekke gewogen.

5. Vaardigheden
Voor de strandrit worden vaardigheden vooraf getoetst in de rijbak. Bij onvoldoende vaardigheden wordt de rit omgezet naar een bosrit. Reserveringskosten van EUR 20 zijn dan van toepassing.

6. Weer
Bij extreme weersomstandigheden (storm, onweer) kan een rit worden geannuleerd door de stal. In dat geval wordt het volledige bedrag teruggestort.

7. Aansprakelijkheid
Paardrijden is een risicosport. Stal Florida is niet aansprakelijk voor schade of letsel tenzij er sprake is van grove nalatigheid.

8. Contact
Stal Florida - Reddingsweg 38, Schiermonnikoog - Tel: 06 41 91 87 02
') ON CONFLICT (key) DO NOTHING;
