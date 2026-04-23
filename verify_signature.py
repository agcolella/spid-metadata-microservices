# verify_signature.py
from urllib.parse import urlparse, parse_qs, unquote_plus
import base64
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.x509 import load_pem_x509_certificate

# URL completo del redirect
url = "https://demo.spid.gov.it/samlsso?SAMLRequest=nVRdj9MwEPwrlt%2FzyV24Wk1PIRUiUoHSFh54QW6y7VlK7ODdtLl%2Fj%2FJ1FAmqo6%2Be9ezO7Njzx7Yq2QksKqNjHrg%2Bf1zMUVZlLZKGnvQGfjaAxNqq1Ch6IOaN1cJIVCi0rAAF5WKbfFyJ0PVFbQ2Z3JScZcuY%2F5hF%2Fv0%2BjEDm93kUBCBnh4Czb1PD0PU5yxAbyDSS1BTz0A8jx79zwjc7%2F0HcvRXBgzubRd85W4%2FU75QulD5en2M%2FFKH4sNutnfXn7Y6zJSApLalv%2FURUo%2FC8AirjYq0K92hOriKvE4loOHtvbA69CzEn2wBnCSLY7npqNDYV2C3Yk8rh62b1m7DjcnAAXKMt6AKsm5uqRzyZI2cJkVX7hmAgUvo4MmW6gDbmPh%2B2IHpv7IX911XLacB%2B%2BkrS9fLuRBXOoS8VoEnRM2efZAVfGlmqgwL7Wl188bq6uXeha4pa1zFbrk2p8udbovb%2FWslKjQo0cZaUpTmnFiTBuGdvmmtMPxR9ClKjCdqb3kJqqlpahV3woJU5Tfu9JE5LibiBww3bfjH%2FfD7%2FEeZtrYpVMJr%2Bt2aLAfuH1hf08jNY%2FAI%3D&RelayState=%7B%22idp%22%3A%22https%3A%2F%2Fdemo.spid.gov.it%22%2C%22returnTo%22%3A%22https%3A%2F%2Fspid-metadata-microservices.vercel.app%2F%22%7D&SigAlg=http%3A%2F%2Fwww.w3.org%2F2001%2F04%2Fxmldsig-more%23rsa-sha256&Signature=GlmieHgjgpH3gsk6w1B2%2BsWVojRb2fix2zyLvbSj4cowdEUJOVtN8hXOjS0lsFp2rmIEJbTRGIC7LWAZNb0GPZzk21l%2FXldjh5TEsSRCJkbKmROUFglE%2BeGlmxcF4Kc10Cz9LfVlFRl4Ao0tVj3m5mSPKZbdo%2Bdeklhb12g%2FokvDbOwycPg60gtFCXxyYYOCheBYT9msC5Ux5bkaqTMw3LfTmnQa9cypslZEV%2FJtzQ%2FwzYXdrh4M8z7t3f51RbcUVbpTRUDE%2BKRjeLXPV%2Fb4hFlDonEt7BeKq5ajDQWzz0h1UdOHJCu%2B8EKCdnkAGkesQM9jq59EKxiFiecDE%2FqKDg%3D%3D"

# Leggi il certificato SP
with open("services/spid-service/certs/sp-cert.pem", "rb") as f:
    cert = load_pem_x509_certificate(f.read())
    pub_key = cert.public_key()

# Estrai i parametri dall'URL (mantenendo l'encoding originale)
raw_query = urlparse(url).query

# Ricostruisci la stringa firmata esattamente come fa SAML HTTP-Redirect
# La stringa firmata è: SAMLRequest=...&RelayState=...&SigAlg=...
# usando i valori RAW (URL-encoded) originali, NON decoded
parts = {}
for part in raw_query.split('&'):
    k, v = part.split('=', 1)
    parts[k] = v

signed_string = f"SAMLRequest={parts['SAMLRequest']}&RelayState={parts['RelayState']}&SigAlg={parts['SigAlg']}"
print(f"Stringa firmata:\n{signed_string[:100]}...\n")

# Decodifica la firma
signature = base64.b64decode(unquote_plus(parts['Signature']))

# Verifica
try:
    pub_key.verify(
        signature,
        signed_string.encode('utf-8'),
        padding.PKCS1v15(),
        hashes.SHA256()
    )
    print("✅ Firma VALIDA — il certificato SP corrisponde alla firma")
except Exception as e:
    print(f"❌ Firma NON valida: {e}")