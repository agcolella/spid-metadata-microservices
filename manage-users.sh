#!/bin/bash

API="http://localhost:8080/api"
TOKEN_FILE="/tmp/.spid_admin_token"
PY_DIR="/home/pi/spid-metadata-microservices/.user-mgmt"
mkdir -p "$PY_DIR"

# ── Colori ────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; NC='\033[0m'; BOLD='\033[1m'

ok()   { echo -e "${GREEN}✓ $1${NC}"; }
err()  { echo -e "${RED}✗ $1${NC}"; }
info() { echo -e "${CYAN}→ $1${NC}"; }
warn() { echo -e "${YELLOW}⚠ $1${NC}"; }

# ── Script Python ─────────────────────────────────────────
setup_python_scripts() {

cat > "$PY_DIR/list_users.py" << 'PY'
import sys, json
raw = sys.stdin.read().strip()
if not raw:
    print("Nessuna risposta dall'API"); sys.exit(0)
try:
    data = json.loads(raw)
except Exception as e:
    print(f"Errore JSON: {e}\nPayload: {raw}"); sys.exit(0)
users = data.get('users', data) if isinstance(data, dict) else data
fmt = "{:<36}  {:<15}  {:<28}  {:<10}  {:<8}  {}"
print(fmt.format("ID", "USERNAME", "EMAIL", "RUOLO", "ATTIVO", "ULTIMO LOGIN"))
print("─" * 120)
for u in users:
    attivo = "✓" if u.get('active', True) else "✗"
    print(fmt.format(u.get('id',''), u.get('username',''), u.get('email',''),
                     u.get('role',''), attivo, u.get('last_login','-')))
PY

cat > "$PY_DIR/parse_error.py" << 'PY'
import sys, json
raw = sys.stdin.read().strip()
if not raw:
    print("Nessuna risposta dall'API"); sys.exit(0)
try:
    d = json.loads(raw)
    err = d.get('error','')
    if err:
        print(f"ERRORE:{err}")
    else:
        print(f"OK:{json.dumps(d)}")
except:
    print(f"ERRORE:{raw}")
PY

}

setup_python_scripts

# ── Login ─────────────────────────────────────────────────
login() {
  echo -e "\n${BOLD}🔐 Login admin${NC}"
  read -p "Username: " ADMIN_USER
  read -s -p "Password: " ADMIN_PASS; echo

  RESPONSE=$(curl -s -X POST "$API/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"$ADMIN_USER\",\"password\":\"$ADMIN_PASS\"}")

  TOKEN=$(echo "$RESPONSE" | python3 -c "
import sys,json
try:
    d=json.loads(sys.stdin.read())
    print(d.get('accessToken',''))
except: print('')
")

  if [ -z "$TOKEN" ]; then
    err "Login fallito"
    exit 1
  fi
  echo "$TOKEN" > "$TOKEN_FILE"
  ok "Login effettuato"
}

get_token() {
  [ ! -f "$TOKEN_FILE" ] && login
  cat "$TOKEN_FILE"
}

api() {
  local method=$1 path=$2 data=$3
  local TOKEN=$(get_token)
  if [ -n "$data" ]; then
    curl -s -X "$method" "$API$path" \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" \
      -d "$data"
  else
    curl -s -X "$method" "$API$path" \
      -H "Authorization: Bearer $TOKEN"
  fi
}

# ── Lista utenti ──────────────────────────────────────────
list_users() {
  echo -e "\n${BOLD}👥 Utenti registrati${NC}\n"
  api GET "/users" | python3 "$PY_DIR/list_users.py"
  echo ""
}

# ── Nuovo utente ──────────────────────────────────────────
create_user() {
  echo -e "\n${BOLD}➕ Nuovo utente${NC}"
  read -p "Username: " username
  read -p "Email:    " email
  read -s -p "Password: " password; echo
  echo -e "Ruoli disponibili: ${CYAN}admin / operator / reviewer / viewer${NC}"
  read -p "Ruolo [viewer]: " role
  role=${role:-viewer}

  RESULT=$(api POST "/users" \
    "{\"username\":\"$username\",\"email\":\"$email\",\"password\":\"$password\",\"role\":\"$role\"}")
  OUT=$(echo "$RESULT" | python3 "$PY_DIR/parse_error.py")

  if [[ "$OUT" == ERRORE:* ]]; then
    err "Errore: ${OUT#ERRORE:}"
  else
    ID=$(echo "$RESULT" | python3 -c "import sys,json; print(json.loads(sys.stdin.read()).get('id',''))")
    ok "Utente '$username' creato → ID: $ID"
  fi
}

# ── Modifica ruolo ────────────────────────────────────────
change_role() {
  echo -e "\n${BOLD}✏️  Modifica ruolo${NC}"
  list_users
  read -p "ID utente: " user_id
  echo -e "Ruoli disponibili: ${CYAN}admin / operator / reviewer / viewer${NC}"
  read -p "Nuovo ruolo: " new_role

  RESULT=$(api PUT "/users/$user_id" "{\"role\":\"$new_role\"}")
  OUT=$(echo "$RESULT" | python3 "$PY_DIR/parse_error.py")

  if [[ "$OUT" == ERRORE:* ]]; then
    err "Errore: ${OUT#ERRORE:}"
  else
    ok "Ruolo aggiornato a '$new_role'"
  fi
}

# ── Reset password ────────────────────────────────────────
reset_password() {
  echo -e "\n${BOLD}🔑 Reset password${NC}"
  list_users
  read -p "ID utente: " user_id
  read -s -p "Nuova password: " new_pass; echo
  read -s -p "Conferma password: " confirm_pass; echo

  if [ "$new_pass" != "$confirm_pass" ]; then
    err "Le password non coincidono"
    return
  fi

  RESULT=$(api POST "/users/$user_id/reset-password" "{\"newPassword\":\"$new_pass\"}")
  OUT=$(echo "$RESULT" | python3 "$PY_DIR/parse_error.py")

  if [[ "$OUT" == ERRORE:* ]]; then
    err "Errore: ${OUT#ERRORE:}"
  else
    ok "Password resettata con successo"
  fi
}

# ── Attiva/Disattiva utente ───────────────────────────────
toggle_user() {
  echo -e "\n${BOLD}🔄 Attiva/Disattiva utente${NC}"
  list_users
  read -p "ID utente: " user_id
  echo -e "  ${CYAN}1${NC}) Attiva"
  echo -e "  ${CYAN}2${NC}) Disattiva"
  read -p "Scelta: " stato

  case $stato in
    1) active="true"  ;;
    2) active="false" ;;
    *) warn "Scelta non valida"; return ;;
  esac

  RESULT=$(api PUT "/users/$user_id" "{\"active\":$active}")
  OUT=$(echo "$RESULT" | python3 "$PY_DIR/parse_error.py")

  if [[ "$OUT" == ERRORE:* ]]; then
    err "Errore: ${OUT#ERRORE:}"
  else
    ok "Utente aggiornato"
  fi
}

# ── Elimina utente ────────────────────────────────────────
delete_user() {
  echo -e "\n${BOLD}🗑  Elimina utente${NC}"
  list_users
  read -p "ID utente: " user_id
  warn "Questa operazione è irreversibile!"
  read -p "Digita 'yes' per confermare: " confirm
  [ "$confirm" != "yes" ] && { info "Annullato"; return; }

  RESULT=$(api DELETE "/users/$user_id")
  OUT=$(echo "$RESULT" | python3 "$PY_DIR/parse_error.py")

  if [[ "$OUT" == ERRORE:* ]]; then
    err "Errore: ${OUT#ERRORE:}"
  else
    ok "Utente eliminato"
  fi
}

# ── Menu principale ───────────────────────────────────────
menu() {
  while true; do
    echo -e "\n${BOLD}╔══════════════════════════════════╗${NC}"
    echo -e "${BOLD}║      SPID User Manager           ║${NC}"
    echo -e "${BOLD}╚══════════════════════════════════╝${NC}"
    echo -e "  ${CYAN}1${NC}) Lista utenti"
    echo -e "  ${CYAN}2${NC}) Nuovo utente"
    echo -e "  ${CYAN}3${NC}) Modifica ruolo"
    echo -e "  ${CYAN}4${NC}) Reset password"
    echo -e "  ${CYAN}5${NC}) Attiva/Disattiva utente"
    echo -e "  ${CYAN}6${NC}) Elimina utente"
    echo -e "  ${CYAN}0${NC}) Esci"
    echo ""
    read -p "Scelta: " choice

    case $choice in
      1) list_users ;;
      2) create_user ;;
      3) change_role ;;
      4) reset_password ;;
      5) toggle_user ;;
      6) delete_user ;;
      0) rm -f "$TOKEN_FILE"; echo -e "\n${GREEN}Arrivederci!${NC}"; exit 0 ;;
      *) warn "Scelta non valida" ;;
    esac
  done
}

# ── Avvio ─────────────────────────────────────────────────
login
menu
