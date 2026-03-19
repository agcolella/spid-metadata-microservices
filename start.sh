#!/bin/bash

ROOT="/home/pi/spid-metadata-microservices"
ENV_FILE="$ROOT/.env"
LOG_DIR="/tmp/spid-logs"

mkdir -p $LOG_DIR

echo "🛑 Fermo eventuali processi precedenti..."
fuser -k 8080/tcp 4001/tcp 4002/tcp 4003/tcp 4004/tcp 4005/tcp 4006/tcp 2>/dev/null
sleep 1

echo "🚀 Avvio microservizi..."

start_service() {
  local name=$1
  local path=$2
  local env_path=$3
  echo "   ▶ $name"
  (cd "$path" && node --env-file="$env_path" server.mjs > "$LOG_DIR/$name.log" 2>&1) &
}

start_service "backoffice" "$ROOT/services/backoffice-service" "$ENV_FILE"
start_service "file"       "$ROOT/services/file-service"       "$ENV_FILE"
start_service "validation" "$ROOT/services/validation-service" "$ENV_FILE"
start_service "github"     "$ROOT/services/github-service"     "$ENV_FILE"
start_service "pr"         "$ROOT/services/pr-service"         "$ENV_FILE"
start_service "batch"      "$ROOT/services/batch-service"      "$ENV_FILE"

echo "   ▶ gateway"
(cd "$ROOT/gateway" && node --env-file="$ROOT/.env" server.mjs > "$LOG_DIR/gateway.log" 2>&1) &

echo ""
echo "⏳ Attendo avvio servizi..."
sleep 3

echo ""
echo "📊 Health check:"
curl -s http://localhost:8080/health | python3 -m json.tool

echo ""
echo "📁 Log disponibili in: $LOG_DIR"
echo "   tail -f $LOG_DIR/gateway.log"
echo "   tail -f $LOG_DIR/backoffice.log"
