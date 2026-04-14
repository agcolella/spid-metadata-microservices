import React, { useState } from 'react';
import axios from '../services/api';
import { API } from '../constants';
import { notify } from '../services/notificationService';

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
      </div>
    </div>
  );
}
