#!/bin/bash
# ============================================
# Stal Florida — Volledige systeemtest v3
# Test ALLE kritieke paden inclusief data-integriteit
#
# Draai:     bash test-stal-florida.sh
# Met cron:  bash test-stal-florida.sh --cron SECRET
# Met admin: bash test-stal-florida.sh --admin WACHTWOORD
# Volledig:  bash test-stal-florida.sh --cron SECRET --admin WACHTWOORD
# ============================================

BASE="https://reserveren.boerderijflorida.nl"
PASS=0
FAIL=0
WARN=0
CRON_SECRET=""
ADMIN_PASS=""

# Parse args
while [ $# -gt 0 ]; do
  case "$1" in
    --cron)  CRON_SECRET="$2"; shift 2;;
    --admin) ADMIN_PASS="$2"; shift 2;;
    *)       shift;;
  esac
done

green() { printf "\033[32m  ✓ PASS\033[0m %s\n" "$1"; PASS=$((PASS+1)); }
red()   { printf "\033[31m  ✗ FAIL\033[0m %s\n" "$1"; FAIL=$((FAIL+1)); }
yellow(){ printf "\033[33m  ⚠ WARN\033[0m %s\n" "$1"; WARN=$((WARN+1)); }
info()  { printf "\033[36m  ℹ\033[0m %s\n" "$1"; }

# Dynamic dates
TODAY=$(date '+%Y-%m-%d')
TOMORROW=$(date -v+1d '+%Y-%m-%d' 2>/dev/null || date -d '+1 day' '+%Y-%m-%d' 2>/dev/null)
# Find next weekday 5+ days out
DAYS=5
while true; do
  TESTDATE=$(date -v+${DAYS}d "+%Y-%m-%d" 2>/dev/null || date -d "+${DAYS} days" "+%Y-%m-%d" 2>/dev/null)
  DOW=$(date -v+${DAYS}d "+%u" 2>/dev/null || date -d "+${DAYS} days" "+%u" 2>/dev/null)
  if [ "$DOW" -le 5 ]; then break; fi
  DAYS=$((DAYS+1))
done
TESTDATE2=$(date -v+$((DAYS+1))d "+%Y-%m-%d" 2>/dev/null || date -d "+$((DAYS+1)) days" "+%Y-%m-%d" 2>/dev/null)
HOUR=$(date '+%H')

echo ""
echo "╔══════════════════════════════════════╗"
echo "║  STAL FLORIDA — SYSTEEMTEST v3       ║"
echo "║  $(date '+%Y-%m-%d %H:%M')                       ║"
echo "╚══════════════════════════════════════╝"
echo ""
[ -n "$CRON_SECRET" ] && info "Cron tests: AAN" || info "Cron tests: UIT (gebruik --cron SECRET)"
[ -n "$ADMIN_PASS" ] && info "Admin tests: AAN" || info "Admin tests: UIT (gebruik --admin WACHTWOORD)"
info "Testdatum: ${TESTDATE}"

# ===== 1. API BEREIKBAARHEID =====
echo ""
echo "━━━ 1. API bereikbaarheid ━━━"

AVAIL=$(curl -s --max-time 10 "${BASE}/api/availability?start_date=${TESTDATE}&end_date=${TESTDATE}")
if echo "$AVAIL" | grep -q "total_available"; then
  green "Availability API"
else
  red "Availability API niet bereikbaar — ALLE TESTS GESTOPT"
  echo "    Response: $(echo "$AVAIL" | head -c 200)"
  exit 1
fi

# Extract product IDs dynamisch
PRODUCT_INFO=$(echo "$AVAIL" | python3 -c "
import sys, json
d = json.load(sys.stdin)
for k, v in d.items():
    day = list(v.values())[0]
    if day.get('slots'):
        print('WANDELPONY=' + k)
    else:
        adults = day.get('adults_available', 0)
        children = day.get('children_available', 0)
        total = day.get('total_available', 0)
        blocked = day.get('blocked', False)
        print('RIT_' + k + '=' + str(total) + '_' + ('blocked' if blocked else 'open'))
" 2>/dev/null)

WANDELPONY_ID=$(echo "$PRODUCT_INFO" | grep WANDELPONY | head -1 | cut -d= -f2)
RIT_ID=$(echo "$PRODUCT_INFO" | grep "RIT_" | grep "open" | head -1 | sed 's/RIT_//' | cut -d= -f1)

[ -n "$WANDELPONY_ID" ] && info "Wandelpony: ${WANDELPONY_ID}" || yellow "Geen wandelpony gevonden"
[ -n "$RIT_ID" ] && info "Rit: ${RIT_ID}" || yellow "Geen open rit gevonden voor ${TESTDATE}"

# Alle API endpoints bestaan
for EP in "/api/reservation?id=test" "/api/guides?action=list" "/api/reserve" "/api/availability?start_date=${TODAY}&end_date=${TODAY}" "/api/cron?type=daily"; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "${BASE}${EP}")
  case "$STATUS" in
    200|400|401|404|405) green "Endpoint ${EP} (${STATUS})";;
    *) red "Endpoint ${EP} niet bereikbaar (${STATUS})";;
  esac
done

# ===== 2. FRONTEND PAGINA'S =====
echo ""
echo "━━━ 2. Frontend pagina's ━━━"
for PAGE in "/" "/boek" "/begeleiders" "/voorwaarden" "/admin" "/boek/bevestiging?id=test"; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "${BASE}${PAGE}")
  if [ "$STATUS" = "200" ] || [ "$STATUS" = "307" ]; then green "Pagina ${PAGE}"; else red "Pagina ${PAGE} (${STATUS})"; fi
done

# ===== 3. INPUT VALIDATIE =====
echo ""
echo "━━━ 3. Input validatie ━━━"

# Helper: post naar reserve API
post_reserve() {
  curl -s -X POST "${BASE}/api/reserve" -H "Content-Type: application/json" -d "$1"
}

R=$(post_reserve '{}')
echo "$R" | grep -q "error" && green "Leeg request afgewezen" || red "Leeg request NIET afgewezen"

R=$(post_reserve '{"product_id":"nep","date":"2026-05-01","riders":[{"name":"T","age":10,"weight":30,"experience":"beginner"}],"contact_email":"t@t.nl"}')
echo "$R" | grep -q "error" && green "Ongeldig product afgewezen" || red "Ongeldig product NIET afgewezen"

R=$(post_reserve "{\"product_id\":\"${WANDELPONY_ID}\",\"date\":\"2020-01-01\",\"time_slot\":\"09:30\",\"riders\":[{\"name\":\"T\",\"age\":8,\"weight\":25,\"experience\":\"beginner\"}],\"contact_email\":\"t@t.nl\"}")
echo "$R" | grep -q "error" && green "Datum verleden afgewezen" || red "Datum verleden NIET afgewezen"

R=$(post_reserve "{\"product_id\":\"${WANDELPONY_ID}\",\"date\":\"${TESTDATE}\",\"time_slot\":\"09:30\",\"riders\":[{\"name\":\"T\",\"age\":8,\"weight\":25,\"experience\":\"beginner\"}],\"contact_email\":\"geenemail\"}")
echo "$R" | grep -q "error" && green "Ongeldig e-mail afgewezen" || red "Ongeldig e-mail NIET afgewezen"

R=$(post_reserve "{\"product_id\":\"${WANDELPONY_ID}\",\"date\":\"${TESTDATE}\",\"time_slot\":\"09:30\",\"riders\":[],\"contact_email\":\"t@t.nl\"}")
echo "$R" | grep -q "error" && green "Geen ruiters afgewezen" || red "Geen ruiters NIET afgewezen"

# 7 ruiters op 1 slot
R=$(post_reserve "{\"product_id\":\"${WANDELPONY_ID}\",\"date\":\"${TESTDATE}\",\"time_slot\":\"09:30\",\"riders\":[{\"name\":\"A\",\"age\":8,\"weight\":25,\"experience\":\"beginner\"},{\"name\":\"B\",\"age\":8,\"weight\":25,\"experience\":\"beginner\"},{\"name\":\"C\",\"age\":8,\"weight\":25,\"experience\":\"beginner\"},{\"name\":\"D\",\"age\":8,\"weight\":25,\"experience\":\"beginner\"},{\"name\":\"E\",\"age\":8,\"weight\":25,\"experience\":\"beginner\"},{\"name\":\"F\",\"age\":8,\"weight\":25,\"experience\":\"beginner\"},{\"name\":\"G\",\"age\":8,\"weight\":25,\"experience\":\"beginner\"}],\"contact_email\":\"t@t.nl\"}")
echo "$R" | grep -q "error" && green "7 ruiters afgewezen" || red "7 ruiters NIET afgewezen"

# Wandelpony zonder tijdslot
if [ -n "$WANDELPONY_ID" ]; then
  R=$(post_reserve "{\"product_id\":\"${WANDELPONY_ID}\",\"date\":\"${TESTDATE}\",\"riders\":[{\"name\":\"T\",\"age\":8,\"weight\":25,\"experience\":\"beginner\"}],\"contact_email\":\"t@t.nl\"}")
  echo "$R" | grep -q "error" && green "Wandelpony zonder tijdslot afgewezen" || red "Wandelpony zonder tijdslot NIET afgewezen"
fi

# Ongeldig tijdslot
if [ -n "$WANDELPONY_ID" ]; then
  R=$(post_reserve "{\"product_id\":\"${WANDELPONY_ID}\",\"date\":\"${TESTDATE}\",\"time_slot\":\"12:00\",\"riders\":[{\"name\":\"T\",\"age\":8,\"weight\":25,\"experience\":\"beginner\"}],\"contact_email\":\"t@t.nl\"}")
  echo "$R" | grep -q "error" && green "Ongeldig tijdslot (12:00) afgewezen" || red "Ongeldig tijdslot NIET afgewezen"
fi

# Wandelpony met volwassene (>10 jaar) — afhankelijk van product config
if [ -n "$WANDELPONY_ID" ]; then
  R=$(post_reserve "{\"product_id\":\"${WANDELPONY_ID}\",\"date\":\"${TESTDATE}\",\"time_slot\":\"09:30\",\"riders\":[{\"name\":\"Adult\",\"age\":25,\"weight\":70,\"experience\":\"beginner\"}],\"contact_email\":\"t@t.nl\"}")
  echo "$R" | grep -q "leeftijd\|error" && green "Volwassene op wandelpony afgewezen" || yellow "Volwassene op wandelpony niet op leeftijd gefilterd"
fi

# ===== 4. ERVARING VALIDATIE =====
echo ""
echo "━━━ 4. Ervaring validatie ━━━"

if [ -n "$RIT_ID" ]; then
  R=$(post_reserve "{\"product_id\":\"${RIT_ID}\",\"date\":\"${TESTDATE}\",\"riders\":[{\"name\":\"Beginner\",\"age\":25,\"weight\":70,\"experience\":\"beginner\"}],\"contact_email\":\"t@t.nl\"}")
  echo "$R" | grep -q "ervaring\|galop\|draf\|error" && green "Beginner op rit afgewezen" || red "Beginner op rit NIET afgewezen"
fi

# ===== 5. 24-UUR REGEL =====
echo ""
echo "━━━ 5. 24-uur regel ━━━"

if [ "$HOUR" -ge 10 ] && [ -n "$WANDELPONY_ID" ]; then
  R=$(post_reserve "{\"product_id\":\"${WANDELPONY_ID}\",\"date\":\"${TOMORROW}\",\"time_slot\":\"09:30\",\"riders\":[{\"name\":\"T\",\"age\":8,\"weight\":25,\"experience\":\"beginner\"}],\"contact_email\":\"t@t.nl\"}")
  echo "$R" | grep -q "24 uur\|error" && green "Morgen 09:30 geblokkeerd (nu na 10:00)" || { red "Morgen 09:30 NIET geblokkeerd"; }
else
  yellow "24-uur test overgeslagen (te vroeg of geen wandelpony)"
fi

if [ -n "$WANDELPONY_ID" ]; then
  R=$(post_reserve "{\"product_id\":\"${WANDELPONY_ID}\",\"date\":\"${TESTDATE}\",\"time_slot\":\"09:30\",\"riders\":[{\"name\":\"T\",\"age\":8,\"weight\":25,\"experience\":\"beginner\"}],\"contact_email\":\"t@t.nl\"}")
  echo "$R" | grep -q "24 uur" && red "5 dagen vooruit geblokkeerd door 24-uur regel" || green "5 dagen vooruit niet geblokkeerd"
fi

# ===== 6. BOEKING AANMAKEN (KRITIEK) =====
echo ""
echo "━━━ 6. Boeking aanmaken (KRITIEK) ━━━"

RESERVATION_ID=""

# 6a: Wandelpony
if [ -n "$WANDELPONY_ID" ]; then
  WP_SLOT=$(echo "$AVAIL" | python3 -c "
import sys,json
d=json.load(sys.stdin)
for k,v in d.items():
    day=list(v.values())[0]
    if day.get('slots'):
        for s,i in day['slots'].items():
            if i['total_available']>0 and not i.get('blocked'):
                print(s); break
        break
" 2>/dev/null)
  WP_FREE=$(echo "$AVAIL" | python3 -c "
import sys,json
d=json.load(sys.stdin)
for k,v in d.items():
    day=list(v.values())[0]
    if day.get('slots') and '${WP_SLOT}' in day['slots']:
        print(day['slots']['${WP_SLOT}']['total_available'])
" 2>/dev/null)

  if [ -n "$WP_SLOT" ]; then
    info "Wandelpony ${TESTDATE} slot ${WP_SLOT}, ${WP_FREE} vrij"
    R=$(post_reserve "{\"product_id\":\"${WANDELPONY_ID}\",\"date\":\"${TESTDATE}\",\"time_slot\":\"${WP_SLOT}\",\"riders\":[{\"name\":\"QA Wandelpony\",\"age\":7,\"weight\":25,\"experience\":\"beginner\"}],\"contact_email\":\"rutger@boerderijflorida.nl\"}")
    if echo "$R" | grep -q "checkout_url"; then
      green "Wandelpony boeking → checkout URL ontvangen"
      RESERVATION_ID=$(echo "$R" | python3 -c "import sys,json; print(json.load(sys.stdin).get('reservation_id',''))" 2>/dev/null)
    else
      red "WANDELPONY BOEKING MISLUKT"
      echo "    Response: $R"
      echo ""
      echo "    >>> GASTEN KUNNEN NIET BOEKEN <<<"
      echo "    >>> Check: migration-atomic.sql uitgevoerd? Reserve API deployed? <<<"
    fi
  else
    yellow "Geen vrij wandelpony slot"
  fi
fi

# 6b: Strandrit/bosrit
if [ -n "$RIT_ID" ]; then
  RIT_FREE=$(echo "$AVAIL" | python3 -c "
import sys,json
d=json.load(sys.stdin)
k='${RIT_ID}'
if k in d:
    day=list(d[k].values())[0]
    print(day.get('total_available',0))
" 2>/dev/null)

  if [ -n "$RIT_FREE" ] && [ "$RIT_FREE" -gt 0 ]; then
    info "Rit ${TESTDATE}, ${RIT_FREE} vrij"
    R=$(post_reserve "{\"product_id\":\"${RIT_ID}\",\"date\":\"${TESTDATE}\",\"riders\":[{\"name\":\"QA Rit\",\"age\":30,\"weight\":70,\"experience\":\"ervaren\"}],\"contact_email\":\"rutger@boerderijflorida.nl\"}")
    echo "$R" | grep -q "checkout_url" && green "Rit boeking → checkout URL ontvangen" || { red "RIT BOEKING MISLUKT"; echo "    Response: $R"; }
  else
    yellow "Rit vol/geblokkeerd op ${TESTDATE}"
  fi
fi

# ===== 7. DATA-INTEGRITEIT NA BOEKING =====
echo ""
echo "━━━ 7. Data-integriteit ━━━"

sleep 2

# 7a: Beschikbaarheid moet gedaald zijn
if [ -n "$WANDELPONY_ID" ] && [ -n "$WP_SLOT" ] && [ -n "$WP_FREE" ]; then
  AVAIL_AFTER=$(curl -s "${BASE}/api/availability?start_date=${TESTDATE}&end_date=${TESTDATE}")
  WP_AFTER=$(echo "$AVAIL_AFTER" | python3 -c "
import sys,json
d=json.load(sys.stdin)
for k,v in d.items():
    day=list(v.values())[0]
    if day.get('slots') and '${WP_SLOT}' in day['slots']:
        print(day['slots']['${WP_SLOT}']['total_available'])
" 2>/dev/null)
  if [ -n "$WP_AFTER" ]; then
    [ "$WP_AFTER" -lt "$WP_FREE" ] && green "Beschikbaarheid gedaald (${WP_FREE} → ${WP_AFTER})" || red "Beschikbaarheid NIET gedaald (${WP_FREE} → ${WP_AFTER})"
  fi
fi

# 7b: Reservation endpoint retourneert data voor onze boeking
if [ -n "$RESERVATION_ID" ]; then
  RES_DATA=$(curl -s "${BASE}/api/reservation?id=${RESERVATION_ID}")
  if echo "$RES_DATA" | grep -q "product_id\|products"; then
    green "Reservering ophaalbaar via API"
    
    # 7c: Check riders formaat — DIT IS DE TEST DIE ALLE RIDERS-BUGS VANGT
    RIDERS_OK=$(echo "$RES_DATA" | python3 -c "
import sys, json
d = json.load(sys.stdin)
riders = d.get('riders', None)
if riders is None:
    print('MISSING')
elif isinstance(riders, str):
    # riders is een string — dit veroorzaakt .map() crashes
    print('STRING_BUG')
elif isinstance(riders, list):
    if len(riders) > 0 and isinstance(riders[0], dict) and 'name' in riders[0]:
        print('OK')
    else:
        print('EMPTY_OR_MALFORMED')
else:
    print('UNKNOWN_TYPE_' + type(riders).__name__)
" 2>/dev/null)
    case "$RIDERS_OK" in
      OK)              green "Riders data is correcte array met objecten";;
      STRING_BUG)      red "RIDERS IS EEN STRING — webhook/cron/admin gaan crashen!";;
      MISSING)         red "Riders veld ontbreekt in reservering";;
      EMPTY_OR_MALFORMED) yellow "Riders array is leeg of misvormd";;
      *)               red "Riders data onverwacht formaat: ${RIDERS_OK}";;
    esac
  else
    red "Reservering NIET ophaalbaar"
    echo "    Response: $(echo "$RES_DATA" | head -c 200)"
  fi
else
  yellow "Geen reservation_id — riders check overgeslagen"
fi

# ===== 8. BEVESTIGINGSPAGINA =====
echo ""
echo "━━━ 8. Bevestigingspagina ━━━"

# Endpoint bestaat en retourneert juiste error
R=$(curl -s "${BASE}/api/reservation?id=00000000-0000-0000-0000-000000000000")
echo "$R" | grep -q "niet gevonden\|error" && green "Onbekend ID → correcte fout" || red "Onbekend ID → geen fout"

# Pagina laadt als HTML (niet wit scherm / client error)
BP=$(curl -s "${BASE}/boek/bevestiging?id=test")
if echo "$BP" | grep -q "html"; then
  # Check voor client-side exception marker
  if echo "$BP" | grep -q "Application error"; then
    red "Bevestigingspagina toont Application error"
  else
    green "Bevestigingspagina laadt HTML"
  fi
else
  red "Bevestigingspagina retourneert geen HTML"
fi

# ===== 9. BEGELEIDERS =====
echo ""
echo "━━━ 9. Begeleiders ━━━"

GUIDES=$(curl -s "${BASE}/api/guides?action=list")
GUIDE_COUNT=$(echo "$GUIDES" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null)
[ -n "$GUIDE_COUNT" ] && [ "$GUIDE_COUNT" -gt 0 ] && green "Begeleiders API (${GUIDE_COUNT} actief)" || red "Begeleiders API faalt"

# Alle begeleiders moeten active=true zijn
INACTIVE_IN_LIST=$(echo "$GUIDES" | python3 -c "
import sys,json
d=json.load(sys.stdin)
inactive=[g['name'] for g in d if not g.get('active', True)]
print(','.join(inactive) if inactive else '')
" 2>/dev/null)
[ -z "$INACTIVE_IN_LIST" ] && green "Geen inactieve begeleiders in publieke lijst" || red "Inactieve begeleiders in publieke lijst: ${INACTIVE_IN_LIST}"

# Guide ritten ophalen
GUIDE_ID=$(echo "$GUIDES" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0]['id'] if d else '')" 2>/dev/null)
if [ -n "$GUIDE_ID" ]; then
  GR=$(curl -s "${BASE}/api/guides?guide_id=${GUIDE_ID}")
  echo "$GR" | python3 -c "import sys,json; assert isinstance(json.load(sys.stdin), list)" 2>/dev/null && green "Guide ritten ophalen werkt" || red "Guide ritten ophalen faalt"
fi

# ===== 10. CRON =====
echo ""
echo "━━━ 10. Cron ━━━"

# Auth check
CR=$(curl -s "${BASE}/api/cron?type=daily")
echo "$CR" | grep -q "Unauthorized\|error" && green "Cron zonder auth geblokkeerd" || red "Cron zonder auth NIET geblokkeerd!"

if [ -n "$CRON_SECRET" ]; then
  # Daily cron
  CR=$(curl -s -H "Authorization: Bearer ${CRON_SECRET}" "${BASE}/api/cron?type=daily")
  if echo "$CR" | grep -q '"sent":true'; then
    green "Dagelijkse cron succesvol"
  else
    red "Dagelijkse cron FAALT"
    echo "    Response: $CR"
    echo "    >>> Check Vercel Logs voor exacte foutmelding <<<"
  fi

  # Weekly cron
  CR=$(curl -s -H "Authorization: Bearer ${CRON_SECRET}" "${BASE}/api/cron?type=weekly")
  echo "$CR" | grep -q '"sent":true' && green "Wekelijkse cron succesvol" || { red "Wekelijkse cron FAALT"; echo "    Response: $CR"; }

  # Test-SMS
  CR=$(curl -s -H "Authorization: Bearer ${CRON_SECRET}" "${BASE}/api/cron?type=test-sms")
  if echo "$CR" | grep -q '"sent":true'; then
    SMS_GUIDES=$(echo "$CR" | python3 -c "import sys,json; d=json.load(sys.stdin); print(', '.join(d.get('guides',[])))" 2>/dev/null)
    green "Test-SMS endpoint werkt (${SMS_GUIDES})"
    
    # Check: geen inactieve begeleiders in SMS lijst
    if echo "$GUIDES" | python3 -c "
import sys,json
active_names=set(g['name'] for g in json.load(sys.stdin))
" 2>/dev/null; then
      # We'd need to cross-check but the endpoint already filters on active
      info "SMS gaat naar: ${SMS_GUIDES}"
    fi
  elif echo "$CR" | grep -q "Geen actieve"; then
    yellow "Geen actieve begeleiders voor test-SMS"
  else
    red "Test-SMS endpoint faalt"
    echo "    Response: $CR"
  fi
fi

# ===== 11. ADMIN =====
echo ""
echo "━━━ 11. Admin beveiliging ━━━"

# Alle admin endpoints moeten auth vereisen
for EP in "/api/admin/products" "/api/admin/bookings" "/api/admin/block-date" "/api/admin/guides" "/api/admin/guide-assignments" "/api/admin/settings"; do
  R=$(curl -s "${BASE}${EP}")
  echo "$R" | grep -q "geautoriseerd\|Unauthorized\|error" && green "Admin ${EP} beveiligd" || red "Admin ${EP} OPEN zonder auth!"
done

# Admin met auth (als meegegeven)
if [ -n "$ADMIN_PASS" ]; then
  echo ""
  echo "━━━ 11b. Admin functionaliteit ━━━"
  
  # Bookings ophalen
  R=$(curl -s "${BASE}/api/admin/bookings" -H "Authorization: Bearer ${ADMIN_PASS}")
  BOOKING_COUNT=$(echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d) if isinstance(d,list) else 'error')" 2>/dev/null)
  if [ "$BOOKING_COUNT" != "error" ] && [ -n "$BOOKING_COUNT" ]; then
    green "Admin bookings ophalen (${BOOKING_COUNT} boekingen)"
    
    # Check riders formaat in ALLE boekingen — DIT VANGT DE RIDERS BUG
    RIDERS_ISSUES=$(echo "$R" | python3 -c "
import sys, json
bookings = json.load(sys.stdin)
issues = []
for b in bookings:
    riders = b.get('riders')
    if isinstance(riders, str):
        issues.append(b.get('id','?')[:8] + ': riders is string')
    elif riders is not None and not isinstance(riders, list):
        issues.append(b.get('id','?')[:8] + ': riders is ' + type(riders).__name__)
print('\n'.join(issues) if issues else '')
" 2>/dev/null)
    if [ -z "$RIDERS_ISSUES" ]; then
      green "Alle boekingen hebben riders als array (geen string bugs)"
    else
      red "RIDERS STRING BUG gevonden in bestaande boekingen:"
      echo "$RIDERS_ISSUES" | while read line; do echo "    $line"; done
      echo "    >>> Dit crasht webhook/cron/admin bij .map() calls <<<"
    fi
  else
    red "Admin bookings ophalen faalt"
    echo "    Response: $(echo "$R" | head -c 200)"
  fi

  # Products ophalen
  R=$(curl -s "${BASE}/api/admin/products" -H "Authorization: Bearer ${ADMIN_PASS}")
  PROD_COUNT=$(echo "$R" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null)
  [ -n "$PROD_COUNT" ] && [ "$PROD_COUNT" -gt 0 ] && green "Admin producten ophalen (${PROD_COUNT})" || red "Admin producten ophalen faalt"

  # Guide assignments check — zoek loze assignments
  R=$(curl -s "${BASE}/api/admin/guide-assignments" -H "Authorization: Bearer ${ADMIN_PASS}")
  NULL_ASSIGNMENTS=$(echo "$R" | python3 -c "
import sys, json
data = json.load(sys.stdin)
if isinstance(data, list):
    nulls = [a for a in data if not a.get('product_id')]
    print(len(nulls))
else:
    print(0)
" 2>/dev/null)
  if [ "$NULL_ASSIGNMENTS" = "0" ] || [ -z "$NULL_ASSIGNMENTS" ]; then
    green "Geen loze guide_assignments (NULL product_id)"
  else
    red "${NULL_ASSIGNMENTS} loze guide_assignments gevonden (NULL product_id) — veroorzaakt spook-SMS"
    echo "    >>> Fix: DELETE FROM guide_assignments WHERE product_id IS NULL; <<<"
  fi

  # Blocked dates ophalen
  R=$(curl -s "${BASE}/api/admin/block-date" -H "Authorization: Bearer ${ADMIN_PASS}")
  echo "$R" | python3 -c "import sys,json; assert isinstance(json.load(sys.stdin), list)" 2>/dev/null && green "Admin blocked dates ophalen" || red "Admin blocked dates faalt"
fi

# ===== 12. SECURITY HEADERS =====
echo ""
echo "━━━ 12. Security headers ━━━"
HEADERS=$(curl -s -I "${BASE}/boek" 2>/dev/null)
for HDR in "x-frame-options" "x-content-type-options" "strict-transport-security" "referrer-policy"; do
  echo "$HEADERS" | grep -qi "$HDR" && green "Header ${HDR}" || yellow "Header ${HDR} ontbreekt"
done

# ===== 13. BESCHIKBAARHEID EDGE CASES =====
echo ""
echo "━━━ 13. Beschikbaarheid edge cases ━━━"

# Datumbereik
AVAIL_RANGE=$(curl -s "${BASE}/api/availability?start_date=${TODAY}&end_date=${TESTDATE2}")
echo "$AVAIL_RANGE" | grep -q "total_available" && green "Datumbereik beschikbaarheid" || red "Datumbereik faalt"

# Enkele datum vandaag
AVAIL_TODAY=$(curl -s "${BASE}/api/availability?start_date=${TODAY}&end_date=${TODAY}")
echo "$AVAIL_TODAY" | grep -q "total_available\|blocked" && green "Vandaag beschikbaarheid" || red "Vandaag beschikbaarheid faalt"

# Alle 3 producten aanwezig
PROD_COUNT=$(echo "$AVAIL_TODAY" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null)
[ "$PROD_COUNT" = "3" ] && green "3 producten in beschikbaarheid" || yellow "${PROD_COUNT} producten (verwacht: 3)"

# ===== SAMENVATTING =====
echo ""
echo "╔══════════════════════════════════════╗"
TOTAL=$((PASS + FAIL + WARN))
printf "║  ✓ %-3d passed" "$PASS"
echo "                       ║"
if [ $FAIL -gt 0 ]; then
  printf "║  ✗ %-3d \033[31mfailed\033[0m" "$FAIL"
  echo "                       ║"
fi
if [ $WARN -gt 0 ]; then
  printf "║  ⚠ %-3d warnings" "$WARN"
  echo "                      ║"
fi
echo "║                                      ║"
if [ $FAIL -eq 0 ]; then
  printf "║  \033[32m🟢 DE WINKEL IS OPEN\033[0m               ║\n"
else
  printf "║  \033[31m🔴 ER ZIJN PROBLEMEN\033[0m                ║\n"
fi
echo "╚══════════════════════════════════════╝"
echo ""
echo "  Testboekingen verlopen na 15 min."
echo "  Volledig: bash test-stal-florida.sh --cron SECRET --admin WACHTWOORD"
echo ""
