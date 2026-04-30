// frontend/src/views/SpidCallbackView.jsx
//
// Riceve il redirect dal backoffice dopo /auth/spid-login.
// Il backoffice fa:
//   res.redirect(`${FRONTEND_URL}/auth/callback#accessToken=...&refreshToken=...&mustChangePassword=0`)
//
// Usiamo il fragment (#) invece di query string: i token non
// appaiono nei log del server né nei referrer header.

import { useEffect } from 'react';
import { notify } from '../services/notificationService';

export default function SpidCallbackView({ onLogin }) {
  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));

    const accessToken        = params.get('accessToken');
    const refreshToken       = params.get('refreshToken')  || null;
    const mustChangePassword = params.get('mustChangePassword') === '1' ||
                               params.get('mustChangePassword') === 'true';

    // Pulisce il fragment dall'URL (non lasciare token visibili nella barra)
    window.history.replaceState(null, '', window.location.pathname);

    if (accessToken) {
      onLogin(accessToken, refreshToken, mustChangePassword);
      if (!mustChangePassword) notify.success('Accesso SPID effettuato!');
    } else {
      // Nessun token → errore generico, torna al login con codice
      notify.error('Accesso SPID non completato.');
      window.location.href = '/?error=spid_callback';
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
