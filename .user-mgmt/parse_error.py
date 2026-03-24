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
