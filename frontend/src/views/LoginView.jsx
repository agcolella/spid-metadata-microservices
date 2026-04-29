import React, { useState } from 'react';
import axios from '../services/api';
import { API } from '../constants';
import { notify } from '../services/notificationService';
import SpidButton from '../components/SpidButton';

const SPID_ERROR_MESSAGES = {
  // Anomalie utente (Tabella messaggi SPID v1.3)
  spid_error_19: 'Anomalia 19 — Il provider ha negato accesso per credenziali errate ripetutamente.',
  spid_error_20: 'Anomalia 20 — L'utente è privo di credenziali compatibili con il livello richiesto.',
  spid_error_21: 'Anomalia 21 — Timeout della sessione di autenticazione.',
  spid_error_22: 'Anomalia 22 — L'utente ha negato il consenso all'invio degli attributi.',
  spid_error_23: 'Anomalia 23 — Le credenziali SPID sono temporaneamente bloccate.',
  spid_error_25: 'Anomalia 25 — L'autenticazione è stata annullata dall'utente.',
  // Errori tecnici
  spid_authn_failed: 'Autenticazione SPID fallita. Riprova.',
  spid_no_authn_context: 'Livello di autenticazione non soddisfatto. Riprova con credenziali di livello 2.',
  no_user:             'Autenticazione SPID non completata. Nessun profilo ricevuto.',
  spid_callback:       'Accesso SPID non riuscito. Riprova.',
  spid:                'Errore durante l'accesso con SPID. Riprova.',
};

function getSpidErrorMessage(code, reason) {
  if (!code) return null;
  if (SPID_ERROR_MESSAGES[code]) return SPID_ERROR_MESSAGES[code];
  // reason è il messaggio tecnico passato da ?reason=
  if (reason) return `Errore SPID: ${decodeURIComponent(reason)}`;
  return `Errore SPID (${code}). Riprova.`;
}

export function LoginView({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await axios.post(API.login, { username, password });
      onLogin(
        res.data.accessToken,
        res.data.refreshToken,
        res.data.mustChangePassword === true
      );
      if (!res.data.mustChangePassword) notify.success('Accesso effettuato!');
    } catch { notify.error('Credenziali non valide'); }
    finally  { setLoading(false); }
  };

  const params    = new URLSearchParams(window.location.search);
  const spidError = params.get('error');
  const spidReason = params.get('reason');
  const errorMsg  = getSpidErrorMessage(spidError, spidReason);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', background: '#f8fafc' }}>
      <div style={{ background: '#fff', borderRadius: 12, padding: 40, width: 380,
        boxShadow: '0 4px 24px rgba(0,0,0,.12)' }}>
        <h2 style={{ textAlign: 'center', marginBottom: 24 }}>🔐 SPID Metadata App</h2>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 6, fontWeight: 600 }}>Username</label>
            <input value={username} onChange={e => setUsername(e.target.value)} autoFocus required
              style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db',
                borderRadius: 6, fontSize: '1rem', boxSizing: 'border-box' }} />
          </div>
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', marginBottom: 6, fontWeight: 600 }}>Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
              style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db',
                borderRadius: 6, fontSize: '1rem', boxSizing: 'border-box' }} />
          </div>
          <button type="submit" disabled={loading}
            style={{ width: '100%', padding: '12px', background: '#3b82f6', color: '#fff',
              border: 'none', borderRadius: 6, fontWeight: 600, fontSize: '1rem',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1 }}>
            {loading ? 'Accesso...' : 'Accedi'}
          </button>
        </form>

        {/* Separatore */}
        <div style={{ display: 'flex', alignItems: 'center', margin: '24px 0' }}>
          <div style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
          <span style={{ margin: '0 12px', color: '#9ca3af', fontSize: '0.85rem' }}>oppure</span>
          <div style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
        </div>

        {/* Bottone ufficiale AgID con dropdown IdP */}
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <SpidButton size="l" />
        </div>

        {/* Errore SPID con messaggio descrittivo */}
        {errorMsg && (
          <div role="alert" style={{
            marginTop: 20,
            padding: '12px 16px',
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: 8,
            display: 'flex',
            alignItems: 'flex-start',
            gap: 10,
          }}>
            <span style={{ fontSize: '1.1rem', flexShrink: 0 }}>⚠️</span>
            <p style={{ color: '#b91c1c', margin: 0, fontSize: '0.875rem', lineHeight: 1.5 }}>
              {errorMsg}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
