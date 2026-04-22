import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const samlPath = resolve(__dirname, '../node_modules/passport-saml/lib/node-saml/saml.js');

let src = readFileSync(samlPath, 'utf8');

// Pattern ESATTO dalla riga 193 — solo AuthnRequest ha @ProtocolBinding prima dell'Issuer
const before = `"saml:Issuer": {
                    "@xmlns:saml": "urn:oasis:names:tc:SAML:2.0:assertion",
                    "#text": this.options.issuer,
                },
            },
        };
        if (isPassive)`;

const after = `"saml:Issuer": {
                    "@xmlns:saml": "urn:oasis:names:tc:SAML:2.0:assertion",
                    "@Format": "urn:oasis:names:tc:SAML:2.0:nameid-format:entity",
                    "@NameQualifier": this.options.issuer,
                    "#text": this.options.issuer,
                },
            },
        };
        if (isPassive)`;

if (src.includes('@NameQualifier')) {
  console.log('ℹ️  node-saml già patchato, skip');
} else if (src.includes(before)) {
  src = src.replace(before, after);
  writeFileSync(samlPath, src, 'utf8');
  console.log('✅ node-saml patchato: Issuer Format + NameQualifier aggiunti alla AuthnRequest');
} else {
  console.error('❌ Pattern non trovato — controlla la versione di passport-saml');
  process.exit(1);
}
