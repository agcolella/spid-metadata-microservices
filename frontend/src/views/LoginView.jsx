import React, { useState } from 'react';
import axios from '../services/api';
import { API } from '../constants';
import { notify } from '../services/notificationService';

const API_BASE = process.env.REACT_APP_GATEWAY_URL || 'http://localhost:8080';
const SPID_IDP = 'https://demo.spid.gov.it';

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

  const handleSpidLogin = () => {
    window.location.href = `${API_BASE}/spid/login?idp=${encodeURIComponent(SPID_IDP)}`;
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', background: '#f8fafc' }}>
      <div style={{ background: '#fff', borderRadius: 12, padding: 40, width: 360,
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
              border: 'none', borderRadius: 6, fontWeight: 600, fontSize: '1rem', cursor: 'pointer' }}>
            {loading ? 'Accesso...' : 'Accedi'}
          </button>
        </form>

        {/* Separatore */}
        <div style={{ display: 'flex', alignItems: 'center', margin: '24px 0' }}>
          <div style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
          <span style={{ margin: '0 12px', color: '#9ca3af', fontSize: '0.85rem' }}>oppure</span>
          <div style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
        </div>

        {/* Bottone SPID */}
        <button onClick={handleSpidLogin}
          style={{ width: '100%', padding: '12px', background: '#06c', color: '#fff',
            border: 'none', borderRadius: 6, fontWeight: 600, fontSize: '1rem',
            cursor: 'pointer', display: 'flex', alignItems: 'center',
            justifyContent: 'center', gap: 8 }}>
          <img src="https://www.spid.gov.it/assets/img/spid-ico-circle-bb.svg"
            alt="" width={24} height={24}
            onError={e => { e.target.style.display = 'none'; }} />
          Entra con SPID
        </button>

        {/* Errore callback SPID */}
        {new URLSearchParams(window.location.search).get('error') === 'spid_callback' && (
          <p style={{ color: '#dc2626', textAlign: 'center',
            marginTop: 16, fontSize: '0.875rem' }}>
            Accesso SPID non riuscito. Riprova.
          </p>
        )}
      </div>
    </div>
  );
}
