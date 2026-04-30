// frontend/src/views/SpidCallbackView.jsx
//
// Riceve il redirect dallo spid-service dopo l'ACS SAML.
// Il fragment (#) evita che i token appaiano nei log del server
// o negli header Referer.

import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { notify } from '../services/notificationService';

export default function SpidCallbackView({ onLogin }) {
  const navigate = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));

    const accessToken        = params.get('accessToken');
    const refreshToken       = params.get('refreshToken') || null;
    const mustChangePassword = params.get('mustChangePassword') === '1' ||
                               params.get('mustChangePassword') === 'true';

    // Rimuove i token dalla barra dell'URL prima di qualsiasi navigazione
    window.history.replaceState(null, '', window.location.pathname);

    if (accessToken) {
      onLogin(accessToken, refreshToken, mustChangePassword);
      if (!mustChangePassword) notify.success('Accesso SPID effettuato!');
      navigate('/', { replace: true });
    } else {
      notify.error('Accesso SPID non completato.');
      navigate('/?error=spid_callback', { replace: true });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{
      minHeight: '100vh', display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      background: '#f8fafc'
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '2.5rem', marginBottom: 16 }}>⏳</div>
        <p style={{ color: '#6b7280', fontSize: '1rem' }}>
          Accesso SPID in corso, attendere…
        </p>
      </div>
    </div>
  );
}