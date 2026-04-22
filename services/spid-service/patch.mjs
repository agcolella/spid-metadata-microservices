// services/spid-service/patch.mjs — versione semplice
import { copyFileSync } from 'fs';
import { createRequire } from 'module';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require   = createRequire(import.meta.url);
const dest      = require.resolve('passport-saml/lib/node-saml/saml.js');
const src       = resolve(__dirname, 'lib/node-saml-saml.js');

copyFileSync(src, dest);
console.log('✅ saml.js patchato copiato in node_modules');