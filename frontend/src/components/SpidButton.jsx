import { useEffect } from 'react';

const SPID_SERVICE_URL = process.env.REACT_APP_SPID_SERVICE_URL
  || 'https://spid-service.onrender.com';

// Lista IdP di produzione (entityID ufficiali AgID)
const IDP_LIST = [
  { id: 'arubaid',       name: 'Aruba ID',            entityId: 'https://loginspid.aruba.it' },
  { id: 'infocertid',    name: 'Infocert ID',          entityId: 'https://identity.infocert.it' },
  { id: 'intesiid',      name: 'Intesi Group ID',      entityId: 'https://spid.intesigroup.com' },
  { id: 'lepidaid',      name: 'Lepida ID',            entityId: 'https://id.lepida.it/idp/shibboleth' },
  { id: 'namirialid',    name: 'Namirial ID',          entityId: 'https://idp.namirialtsp.com/idp' },
  { id: 'posteid',       name: 'Poste ID',             entityId: 'https://posteid.poste.it' },
  { id: 'sielteid',      name: 'Sielte ID',            entityId: 'https://identity.sieltecloud.it' },
  { id: 'spiditaliaid',  name: 'SPIDItalia Register',  entityId: 'https://spid.register.it' },
  { id: 'teamsystemid',  name: 'TeamSystem ID',        entityId: 'https://spid.teamsystem.com/idp' },
  { id: 'timid',         name: 'TIM ID',               entityId: 'https://login.id.tim.it/affwebservices/public/saml2sso' },
  { id: 'etnaid',        name: 'Etna ID',              entityId: 'https://id.eht.eu' },
  { id: 'infocamereid',  name: 'InfoCamere ID',        entityId: 'https://loginspid.infocamere.it' },
];

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
        href="#"
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
                  onError={e => { e.target.src = `/spid/img/spid-idp-${idp.id}.png`; e.target.onerror = null; }}
                  alt={idp.name}
                />
              </a>
            </li>
          ))}
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