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
