import { useEffect } from 'react';

const SPID_SERVICE_URL = process.env.REACT_APP_SPID_SERVICE_URL
  || 'https://spid-service.onrender.com';

// Lista IdP di produzione (entityID ufficiali AgID)
const IDP_LIST = [
  { id: 'arubaid',          name: 'Aruba ID',          entityId: 'https://loginspid.aruba.it' },
  { id: 'infocertid',       name: 'Infocert ID',        entityId: 'https://identity.infocert.it' },
  { id: 'intesigroupspid',  name: 'Intesi Group ID',    entityId: 'https://spid.intesigroup.com' },
  { id: 'lepidaid',         name: 'Lepida ID',          entityId: 'https://id.lepida.it/idp/shibboleth' },
  { id: 'namirialid',       name: 'Namirial ID',        entityId: 'https://idp.namirialtsp.com/idp' },
  { id: 'posteid',          name: 'Poste ID',           entityId: 'https://posteid.poste.it' },
  { id: 'sielteid',         name: 'Sielte ID',          entityId: 'https://identity.sieltecloud.it' },
  { id: 'spiditalia',       name: 'SPIDItalia',         entityId: 'https://spid.register.it' },
  { id: 'teamsystemid',     name: 'TeamSystem ID',      entityId: 'https://spid.teamsystem.com/idp' },
  { id: 'timid',            name: 'TIM ID',             entityId: 'https://login.id.tim.it/affwebservices/public/saml2sso' },
  { id: 'etnaid',           name: 'Etna ID',            entityId: 'https://id.eht.eu' },
  { id: 'infocamereid',     name: 'InfoCamere ID',      entityId: 'https://loginspid.infocamere.it' },
];

// Voci di test — mostrate solo se REACT_APP_SHOW_TEST_IDPS=true
const TEST_IDP_LIST = [
  {
    id:       'validator-demo',
    name:     'SPID Demo Validator',
    entityId: 'https://demo.spid.gov.it/validator',
    isTest:   true,
  },
  {
    id:       'validator-agid',
    name:     'AgID Validator ufficiale',
    entityId: 'https://validator.spid.gov.it',
    isTest:   true,
  },
];

const SHOW_TEST_IDPS = process.env.REACT_APP_SHOW_TEST_IDPS === 'true';

// Mescola in ordine random (requisito AgID)
function shuffle(arr) {
  return [...arr].sort(() => Math.random() - 0.5);
}

export default function SpidButton({ size = 'l' }) {
  const buttonId = `spid-idp-button-${size}-get`;

  useEffect(() => {
    // Carica jQuery + script AgID se non già presenti
    function loadScript(src, id, onLoad) {
      if (document.getElementById(id)) { onLoad?.(); return; }
      const s = document.createElement('script');
      s.src = src; s.id = id; s.defer = true;
      s.onload = onLoad;
      document.body.appendChild(s);
    }

    loadScript('/spid/js/jquery.min.js', 'jquery-spid', () => {
      loadScript('/spid/js/spid-idps.js', 'spid-idps', () => {
        loadScript('/spid/js/spid-sp-access-button.min.js', 'spid-btn-js', () => {
          if (window.$ && window.$.fn.spidSPAccessButton) {
            window.$(`#${buttonId}`).closest('.spid-idp-button').spidSPAccessButton();
          }
        });
      });
    });

    // Carica CSS
    if (!document.getElementById('spid-css')) {
      const link = document.createElement('link');
      link.id = 'spid-css';
      link.rel = 'stylesheet';
      link.href = '/spid/css/spid-sp-access-button.min.css';
      document.head.appendChild(link);
    }
  }, [buttonId]);

  const idps = shuffle(IDP_LIST);

  return (
    <>
      {/* Bottone ufficiale AgID — versione GET */}
      <a
        href="/login"
        onClick={e => e.preventDefault()}
        className={`italia-it-button italia-it-button-size-${size} button-spid`}
        spid-idp-button={`#${buttonId}`}
        aria-haspopup="true"
        aria-expanded="false"
      >
        <span className="italia-it-button-icon">
          <img
            src="/spid/img/spid-ico-circle-bb.svg"
            onError={e => { e.target.src = '/spid/img/spid-ico-circle-bb.png'; e.target.onerror = null; }}
            alt=""
          />
        </span>
        <span className="italia-it-button-text">Entra con SPID</span>
      </a>

      <div id={buttonId} className="spid-idp-button spid-idp-button-tip spid-idp-button-relative">
        <ul className="spid-idp-button-menu" aria-labelledby="spid-idp">
          {idps.map(idp => (
            <li key={idp.id}>
              <a
                className="dropdown-item"
                href={`${SPID_SERVICE_URL}/spid/login?idp=${encodeURIComponent(idp.entityId)}`}
              >
                <span className="spid-sr-only">{idp.name}</span>
                <img
                  src={`/spid/img/spid-idp-${idp.id}.svg`}
                  onError={e => {
                    // Prova PNG solo una volta, poi smetti
                    if (!e.target.dataset.fallback) {
                      e.target.dataset.fallback = '1';
                      e.target.src = `/spid/img/spid-idp-${idp.id}.png`;
                    } else {
                      e.target.onerror = null;
                      e.target.style.display = 'none';
                    }
                  }}
                  alt={idp.name}
                  style={{ height: '32px', width: 'auto', maxWidth: '120px', objectFit: 'contain' }}  // ← lascia fare al CSS AgID
                />
              </a>
            </li>
          ))}
          {SHOW_TEST_IDPS && (
            <>
              {/* Separatore visivo */}
              <li style={{ borderTop: '1px solid #e5e7eb', margin: '4px 0', padding: 0 }}>
                <span style={{
                  display: 'block',
                  padding: '4px 16px',
                  fontSize: '0.7rem',
                  color: '#9ca3af',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}>
                  Ambienti di test
                </span>
              </li>
              {TEST_IDP_LIST.map(idp => (
                <li key={idp.id}>
                  <a
                    className="dropdown-item"
                    href={`${SPID_SERVICE_URL}/spid/login?idp=${encodeURIComponent(idp.entityId)}`}
                    style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                  >
                    {/* Icona generica per i validator */}
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      width: 32, height: 32, borderRadius: '50%',
                      background: '#f3f4f6', fontSize: '0.75rem', color: '#6b7280',
                      flexShrink: 0,
                    }}>
                      🧪
                    </span>
                    <span style={{ fontSize: '0.85rem', color: '#374151' }}>{idp.name}</span>
                  </a>
                </li>
              ))}
            </>
          )}
          <li className="spid-idp-support-link">
            <a className="dropdown-item" href="https://www.spid.gov.it" target="_blank" rel="noopener noreferrer">
              Maggiori informazioni
            </a>
          </li>
          <li className="spid-idp-support-link">
            <a className="dropdown-item" href="https://www.spid.gov.it/richiedi-spid" target="_blank" rel="noopener noreferrer">
              Non hai SPID?
            </a>
          </li>
          <li className="spid-idp-support-link">
            <a className="dropdown-item" href="https://www.spid.gov.it/serve-aiuto" target="_blank" rel="noopener noreferrer">
              Serve aiuto?
            </a>
          </li>
        </ul>
      </div>
    </>
  );
}