import { DOMParser } from '@xmldom/xmldom';
import xpath from 'xpath';
import * as constants from './constants.js';

function stripNamespaces(xmlString) {
  return xmlString
    .replace(/<([a-zA-Z0-9_-]+):([a-zA-Z0-9_\-. ]+)/g, '<$2')
    .replace(/<\/([a-zA-Z0-9_-]+):([a-zA-Z0-9_\-.]+)>/g, '</$2>');
}

function isValidHttpUrl(str) {
  try { const u = new URL(str); return u.protocol === 'http:' || u.protocol === 'https:'; }
  catch { return false; }
}

function isValidHttpsUrl(str) {
  try { const u = new URL(str); return u.protocol === 'https:'; }
  catch { return false; }
}

function hasCustomPort(str) {
  try { return new URL(str).port !== ''; }
  catch { return false; }
}

export class SpidMetadataValidator {
  constructor({ production = false } = {}) {
    this.production = production;
    this.errors     = [];
    this.warnings   = [];
    this.doc        = null;
    this.entityID   = null;
    this.organizationName = null;
  }

  load(xmlString) {
    const clean  = stripNamespaces(xmlString);
    const parser = new DOMParser();
    this.doc = parser.parseFromString(clean, 'application/xml');
    const parseErr = this.doc.getElementsByTagName('parsererror');
    if (parseErr.length > 0) {
      throw new Error(`Errore parsing XML: ${parseErr[0].textContent}`);
    }
    return this;
  }

  _assert(condition, message, testId = '', level = 'error') {
    if (!condition) {
      const entry = { testId, message, level };
      if (level === 'error')   this.errors.push(entry);
      if (level === 'warning') this.warnings.push(entry);
    }
    return condition;
  }

  _select(xpathExpr) {
    return xpath.select(xpathExpr, this.doc);
  }

  test_EntityDescriptor() {
    const nodes = this._select('//EntityDescriptor');
    this._assert(nodes.length === 1,
      'Solo un EntityDescriptor DEVE essere presente', '1.3.0');

    const entityID = nodes[0]?.getAttribute('entityID');
    this._assert(!!entityID,
      "L'attributo entityID DEVE essere presente", '1.3.1');
    this._assert(entityID && entityID.trim() !== '',
      "L'attributo entityID DEVE avere un valore", '1.3.2');

    this.entityID = entityID || null;

    if (this.production && entityID) {
      this._assert(isValidHttpsUrl(entityID),
        "L'entityID DEVE essere un URL HTTPS valido", '1.3.3');
      this._assert(!hasCustomPort(entityID),
        'L\'entityID NON DEVE contenere porte TCP personalizzate', '1.3.4');
    }
  }

  test_SPSSODescriptor() {
    const spsso = this._select('//EntityDescriptor/SPSSODescriptor');
    this._assert(spsso.length === 1,
      'Solo un elemento SPSSODescriptor DEVE essere presente', '1.6.0');
  }

  test_SPSSODescriptor_SPID() {
    const spsso = this._select('//EntityDescriptor/SPSSODescriptor');
    if (!spsso.length) {
      this._assert(false, 'Elemento SPSSODescriptor non trovato', '1.6.0');
      return;
    }
    const el = spsso[0];

    for (const [attr, testIds] of [
      ['protocolSupportEnumeration', ['1.6.1', '1.6.2']],
      ['AuthnRequestsSigned',        ['1.6.3', '1.6.4']]
    ]) {
      const present = el.hasAttribute(attr);
      this._assert(present, `L'attributo ${attr} DEVE essere presente`, testIds[0]);
      const val = el.getAttribute(attr);
      this._assert(val && val.trim() !== '', `L'attributo ${attr} DEVE avere un valore`, testIds[1]);
      if (attr === 'AuthnRequestsSigned' && val) {
        this._assert(val.toLowerCase() === 'true',
          `L'attributo ${attr} DEVE essere "true"`, '1.6.5');
      }
    }
  }

  test_NameIDFormat_Transient() {
    const nodes = this._select('//EntityDescriptor/SPSSODescriptor/NameIDFormat');
    if (nodes.length > 0) {
      this._assert(
        nodes[0].textContent === constants.NAMEID_FORMAT_TRANSIENT,
        `NameIDFormat DEVE essere ${constants.NAMEID_FORMAT_TRANSIENT}`,
        '1.NameIDFormat'
      );
    }
  }

  test_Signature() {
    const sign = this._select('//EntityDescriptor/Signature');
    this._assert(sign.length > 0,
      "L'elemento Signature DEVE essere presente", '1.7.0');

    if (!sign.length) {
      ['1.7.1','1.7.2','1.7.3','1.7.4','1.7.5'].forEach(id =>
        this._assert(false, `Controllo Signature ${id} non eseguibile (Signature assente)`, id)
      );
      return;
    }

    const sigMethod = this._select('//EntityDescriptor/Signature/SignedInfo/SignatureMethod');
    this._assert(sigMethod.length > 0,
      "L'elemento SignatureMethod DEVE essere presente", '1.7.1');

    if (sigMethod.length > 0) {
      const algPresent = sigMethod[0].hasAttribute('Algorithm');
      this._assert(algPresent,
        "L'attributo Algorithm in SignatureMethod DEVE essere presente", '1.7.2');

      const alg = sigMethod[0].getAttribute('Algorithm');
      this._assert(constants.ALLOWED_XMLDSIG_ALGS.includes(alg),
        `L'algoritmo di firma DEVE essere uno di: [${constants.ALLOWED_XMLDSIG_ALGS.join(', ')}]`,
        '1.7.3');
    }

    const digestMethod = this._select('//EntityDescriptor/Signature/SignedInfo/Reference/DigestMethod');
    this._assert(digestMethod.length === 1,
      "L'elemento DigestMethod DEVE essere presente", '1.7.4');

    if (digestMethod.length > 0) {
      this._assert(digestMethod[0].hasAttribute('Algorithm'),
        "L'attributo Algorithm in DigestMethod DEVE essere presente", '1.7.5');

      const alg = digestMethod[0].getAttribute('Algorithm');
      this._assert(constants.ALLOWED_DGST_ALGS.includes(alg),
        `L'algoritmo di digest DEVE essere uno di: [${constants.ALLOWED_DGST_ALGS.join(', ')}]`,
        '1.7.6');
    }
  }

  test_KeyDescriptor() {
    const kdsSigning = this._select(
      '//EntityDescriptor/SPSSODescriptor/KeyDescriptor[@use="signing"]'
    );
    this._assert(kdsSigning.length >= 1,
      'Almeno un KeyDescriptor con use="signing" DEVE essere presente', '1.4.0');

    kdsSigning.forEach(kd => {
      const certs = xpath.select(
        './KeyInfo/X509Data/X509Certificate', kd
      ).filter(n => n.textContent && n.textContent.trim().length > 0);
      this._assert(certs.length >= 1,
        'Almeno un certificato X.509 di firma DEVE essere presente', '1.4.1');
    });

    const kdsEnc = this._select(
      '//EntityDescriptor/SPSSODescriptor/KeyDescriptor[@use="encryption"]'
    );
    kdsEnc.forEach(kd => {
      const certs = xpath.select(
        './KeyInfo/X509Data/X509Certificate', kd
      ).filter(n => n.textContent && n.textContent.trim().length > 0);
      this._assert(certs.length >= 1,
        'Almeno un certificato X.509 di cifratura DEVE essere presente', '1.4.2');
    });
  }

  test_SingleLogoutService() {
    const slos = this._select(
      '//EntityDescriptor/SPSSODescriptor/SingleLogoutService'
    );
    this._assert(slos.length >= 1,
      'Almeno un elemento SingleLogoutService DEVE essere presente', '1.8.0');

    slos.forEach(slo => {
      for (const attr of ['Binding','Location']) {
        const present = slo.hasAttribute(attr);
        this._assert(present,
          `L'attributo ${attr} in SingleLogoutService DEVE essere presente`, '1.8.1');

        const val = slo.getAttribute(attr);
        this._assert(val && val.trim() !== '',
          `L'attributo ${attr} in SingleLogoutService DEVE avere un valore`, '1.8.2');

        if (attr === 'Binding' && val) {
          this._assert(constants.ALLOWED_SINGLELOGOUT_BINDINGS.includes(val),
            `Il Binding in SingleLogoutService DEVE essere uno di: [${constants.ALLOWED_SINGLELOGOUT_BINDINGS.join(', ')}]`,
            '1.8.3');
        }

        if (attr === 'Location' && val) {
          if (this.production) {
            this._assert(isValidHttpsUrl(val),
              'Il Location in SingleLogoutService DEVE essere un URL HTTPS valido', '1.8.6');
            this._assert(!hasCustomPort(val),
              'Il Location in SingleLogoutService NON DEVE contenere porte personalizzate', '1.8.7');
          } else {
            this._assert(isValidHttpUrl(val),
              'Il Location in SingleLogoutService DEVE essere un URL HTTP valido', '1.8.4');
          }
        }
      }
    });
  }

  test_AssertionConsumerService() {
    const acss = this._select(
      '//EntityDescriptor/SPSSODescriptor/AssertionConsumerService'
    );
    this._assert(acss.length >= 1,
      'Almeno un AssertionConsumerService DEVE essere presente', '1.1.0');

    acss.forEach(acs => {
      for (const attr of ['index','Binding','Location']) {
        const present = acs.hasAttribute(attr);
        this._assert(present, `L'attributo ${attr} DEVE essere presente`, '1.1.1');

        const val = acs.getAttribute(attr) || '0';
        if (attr === 'index') {
          this._assert(parseInt(val) >= 0,
            `L'attributo index DEVE essere >= 0`, '1.1.2');
        } else if (attr === 'Binding') {
          this._assert(constants.ALLOWED_BINDINGS.includes(val),
            `Il Binding DEVE essere uno di: [${constants.ALLOWED_BINDINGS.join(', ')}]`, '1.1.4');
        } else if (attr === 'Location' && this.production) {
          this._assert(isValidHttpsUrl(val),
            'Il Location in ACS DEVE essere un URL HTTPS valido', '1.1.6');
          this._assert(!hasCustomPort(val),
            'Il Location in ACS NON DEVE contenere porte personalizzate', '1.1.6b');
        }
      }
    });
  }

  test_AssertionConsumerService_SPID() {
    const acsDefault = this._select(
      '//EntityDescriptor/SPSSODescriptor/AssertionConsumerService[@isDefault="true"]'
    );
    this._assert(acsDefault.length === 1,
      'DEVE essere presente un solo AssertionConsumerService con isDefault="true"', '1.1.7');

    const acsIndex0 = this._select(
      '//EntityDescriptor/SPSSODescriptor/AssertionConsumerService[@index="0"][@isDefault="true"]'
    );
    this._assert(acsIndex0.length === 1,
      'DEVE essere presente l\'AssertionConsumerService con index="0" e isDefault="true"', '1.1.8');
  }

  test_AttributeConsumingService() {
    const acss = this._select(
      '//EntityDescriptor/SPSSODescriptor/AttributeConsumingService'
    );
    this._assert(acss.length >= 1,
      'Almeno un AttributeConsumingService DEVE essere presente', '1.2.0');
  }

  test_AttributeConsumingService_SPID(allowedAttributes = constants.SPID_ATTRIBUTES) {
    const acss = this._select(
      '//EntityDescriptor/SPSSODescriptor/AttributeConsumingService'
    );

    acss.forEach(acs => {
      this._assert(acs.hasAttribute('index'),
        "L'attributo index in AttributeConsumingService DEVE essere presente", '1.2.1');

      const idx = parseInt(acs.getAttribute('index') || '0');
      this._assert(idx >= 0,
        "L'attributo index in AttributeConsumingService DEVE essere >= 0", '1.2.2');

      const sns = xpath.select('./ServiceName', acs);
      this._assert(sns.length > 0,
        "L'elemento ServiceName DEVE essere presente", '1.2.3');
      sns.forEach(sn => {
        this._assert(sn.textContent && sn.textContent.trim() !== '',
          "L'elemento ServiceName DEVE avere un valore", '1.2.4');
      });

      const ras = xpath.select('./RequestedAttribute', acs);
      this._assert(ras.length >= 1,
        'Almeno un RequestedAttribute DEVE essere presente', '1.2.5');

      const names = [];
      ras.forEach(ra => {
        const name = ra.getAttribute('Name');
        this._assert(ra.hasAttribute('Name'),
          "L'attributo Name in RequestedAttribute DEVE essere presente", '1.2.6');
        this._assert(allowedAttributes.includes(name),
          `L'attributo "${name}" non è valido. Deve essere uno di: [${allowedAttributes.join(', ')}]`,
          '1.2.7');
        if (name) names.push(name);
      });

      this._assert(names.length === new Set(names).size,
        'AttributeConsumingService NON DEVE contenere RequestedAttribute duplicati', '1.2.8');
    });
  }

  test_Organization() {
    const orgs = this._select('//EntityDescriptor/Organization');
    this._assert(orgs.length === 1,
      'DEVE essere presente esattamente un elemento Organization', '1.5.0');

    if (orgs.length !== 1) return;

    const org = orgs[0];
    const enames = ['OrganizationName','OrganizationDisplayName','OrganizationURL'];
    const langCounter = {};

    enames.forEach(ename => {
      const elements = xpath.select(`./${ename}`, org);
      this._assert(elements.length > 0,
        `Almeno un elemento ${ename} DEVE essere presente`, '1.5.1');

      elements.forEach(el => {
        const langAttr =
          el.getAttribute('xml:lang') ||
          el.getAttributeNS('http://www.w3.org/XML/1998/namespace', 'lang');
        this._assert(langAttr && langAttr.trim() !== '',
          `L'attributo lang in ${ename} DEVE essere presente`, '1.5.2');

        const lang = langAttr || '';
        langCounter[lang] = (langCounter[lang] || 0) + 1;

        this._assert(el.textContent && el.textContent.trim() !== '',
          `L'elemento ${ename} DEVE avere un valore`, '1.5.3');

        if (ename === 'OrganizationURL' && this.production) {
          let url = el.textContent.trim();
          if (!url.startsWith('http://') && !url.startsWith('https://')) url = `https://${url}`;
          this._assert(isValidHttpUrl(url),
            `L'elemento ${ename} DEVE essere un URL valido`, '1.5.10');
        }
      });

      if (ename === 'OrganizationName') {
        const itEl = elements.find(el => {
          const lang = el.getAttribute('xml:lang') ||
            el.getAttributeNS('http://www.w3.org/XML/1998/namespace', 'lang');
          return lang === 'it';
        });
        if (itEl) this.organizationName = itEl.textContent.trim();
        else if (elements[0]) this.organizationName = elements[0].textContent.trim();
      }
    });

    for (const [lang, count] of Object.entries(langCounter)) {
      this._assert(count === enames.length,
        'OrganizationName, OrganizationDisplayName e OrganizationURL DEVONO avere lo stesso numero di lang',
        '1.5.5');
    }

    this._assert('it' in langCounter,
      'Gli elementi dell\'Organization DEVONO avere almeno la lingua "it"', '1.5.6');
  }

  test_entityid_qs() {
    if (this.entityID) {
      this._assert(!this.entityID.includes('?'),
        "L'entityID NON DEVE contenere la query-string", 'entityid.qs');
    }
  }

  test_entityid_contains(value) {
    if (this.entityID) {
      this._assert(this.entityID.includes(value),
        `L'entityID DEVE contenere il codice attività "${value}"`, 'entityid.contains');
    }
  }

  checkDuplicates(filesData) {
    const seen    = new Map();
    const dupList = [];
    filesData.forEach(({ filename, entityID }) => {
      if (!entityID) return;
      if (seen.has(entityID)) {
        dupList.push({ entityID, files: [seen.get(entityID), filename] });
      } else {
        seen.set(entityID, filename);
      }
    });
    return dupList;
  }

  runProfileSaml2Core() {
    this.test_EntityDescriptor();
    this.test_SPSSODescriptor();
    this.test_NameIDFormat_Transient();
    this.test_Signature();
    this.test_KeyDescriptor();
    this.test_SingleLogoutService();
    this.test_AssertionConsumerService();
    this.test_AttributeConsumingService();
    this.test_Organization();
  }

  runProfileSpidSP() {
    this.runProfileSaml2Core();
    this.test_SPSSODescriptor_SPID();
    this.test_AssertionConsumerService_SPID();
    this.test_AttributeConsumingService_SPID();
  }

  runProfileSpidSPPublic() { this.runProfileSpidSP(); }
  runProfileSpidSPPrivate() { this.runProfileSpidSP(); }

  runProfileAggregatorPublicFull()  { this.runProfileSpidSP(); this.test_entityid_qs(); this.test_entityid_contains('pub-ag-full'); }
  runProfileAggregatorPublicLite()  { this.runProfileSpidSP(); this.test_entityid_qs(); this.test_entityid_contains('pub-ag-lite'); }
  runProfileAggregatorPrivateFull() { this.runProfileSpidSP(); this.test_entityid_qs(); this.test_entityid_contains('pri-ag-full'); }
  runProfileAggregatorPrivateLite() { this.runProfileSpidSP(); this.test_entityid_qs(); this.test_entityid_contains('pri-ag-lite'); }
  runProfileOperatorPublicFull()    { this.runProfileSpidSP(); this.test_entityid_qs(); this.test_entityid_contains('pub-op-full'); }
  runProfileOperatorPublicLite()    { this.runProfileSpidSP(); this.test_entityid_qs(); this.test_entityid_contains('pub-op-lite'); }

  validate(xmlString, profile = 'spid_sp_public') {
    this.errors   = [];
    this.warnings = [];
    try { this.load(xmlString); }
    catch (e) {
      return {
        valid:  false,
        errors: [{ testId: 'parse', message: e.message, level: 'error' }],
        warnings:         [],
        entityID:         null,
        organizationName: null,
        profile
      };
    }

    const profileMap = {
      saml2core:               () => this.runProfileSaml2Core(),
      spid_sp:                 () => this.runProfileSpidSP(),
      spid_sp_public:          () => this.runProfileSpidSPPublic(),
      spid_sp_private:         () => this.runProfileSpidSPPrivate(),
      ag_public_full:          () => this.runProfileAggregatorPublicFull(),
      ag_public_lite:          () => this.runProfileAggregatorPublicLite(),
      ag_private_full:         () => this.runProfileAggregatorPrivateFull(),
      ag_private_lite:         () => this.runProfileAggregatorPrivateLite(),
      op_public_full:          () => this.runProfileOperatorPublicFull(),
      op_public_lite:          () => this.runProfileOperatorPublicLite()
    };

    const runner = profileMap[profile] ?? profileMap['spid_sp_public'];
    runner();

    return {
      valid:            this.errors.length === 0,
      errors:           this.errors,
      warnings:         this.warnings,
      entityID:         this.entityID,
      organizationName: this.organizationName,
      profile
    };
  }
}
