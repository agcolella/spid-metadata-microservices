import { readFileSync, writeFileSync } from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const samlPath = require.resolve('passport-saml/lib/node-saml/saml.js');
let src = readFileSync(samlPath, 'utf8');
if (!src.includes('@NameQualifier')) {
  src = src.replace(
    `"saml:Issuer": {\n                    "@xmlns:saml": "urn:oasis:names:tc:SAML:2.0:assertion",\n                    "#text": this.options.issuer,\n                },\n            },\n        };\n        if (isPassive)`,
    `"saml:Issuer": {\n                    "@xmlns:saml": "urn:oasis:names:tc:SAML:2.0:assertion",\n                    "@Format": "urn:oasis:names:tc:SAML:2.0:nameid-format:entity",\n                    "@NameQualifier": this.options.issuer,\n                    "#text": this.options.issuer,\n                },\n            },\n        };\n        if (isPassive)`
  );
  writeFileSync(samlPath, src);
  console.log("✅ node-saml patchato");
} else {
  console.log("ℹ️  node-saml già patchato");
}