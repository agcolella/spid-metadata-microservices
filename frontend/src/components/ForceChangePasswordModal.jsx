import React, { useState } from 'react';
import axios, { getAuthHeaders } from '../services/api';
import { API } from '../constants';
import { notify } from '../services/notificationService';

const overlayStyle = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,.65)',
  zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center',
};
const boxStyle = {
  background: '#fff', borderRadius: 12, padding: 36, width: 420,
  maxWidth: '95vw', boxShadow: '0 8px 40px rgba(0,0,0,.25)',
};
const inputStyle = {
  width: '100%', padding: '10px 12px', border: '1px solid #d1d5db',
  borderRadius: 6, fontSize: '0.95rem', boxSizing: 'border-box', marginTop: 4,
};
const labelStyle = {
  display: 'block', fontWeight: 600, fontSize: '0.88rem', color: '#374151', marginTop: 14,
};

export function ForceChangePasswordModal({ onSuccess }) {
  const [oldPwd,  setOldPwd]  = useState('');
  const [newPwd,  setNewPwd]  = useState('');
  const [confirm, setConfirm] = useState('');
  const [error,   setError]   = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (newPwd !== confirm)  return setError('Le password non coincidono');
    if (newPwd.length < 8)   return setError('La nuova password deve essere di almeno 8 caratteri');
    if (newPwd === oldPwd)   return setError('La nuova password deve essere diversa da quella attuale');

    setLoading(true);
    try {
      await axios.put(API.changePassword, { oldPassword: oldPwd, newPassword: newPwd }, getAuthHeaders());
      notify.success('Password aggiornata con successo!');
      onSuccess();
    } catch (err) {
      setError(err.response?.data?.error || 'Errore durante il cambio password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={overlayStyle}>
      <div style={boxStyle}>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: '2.2rem' }}>🔐</div>
          <h2 style={{ margin: '8px 0 4px', fontSize: '1.2rem', color: '#1e293b' }}>
            Cambio password obbligatorio
          </h2>
          <p style={{ color: '#64748b', fontSize: '0.88rem', margin: 0 }}>
            Per motivi di sicurezza devi impostare una nuova password prima di continuare.
          </p>
        </div>

        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', color: '#991b1b',
            borderRadius: 6, padding: '10px 14px', marginBottom: 12, fontSize: '0.88rem' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <label style={labelStyle}>
            Password attuale
            <input type="password" style={inputStyle} value={oldPwd}
              onChange={e => setOldPwd(e.target.value)} autoFocus required />
          </label>
          <label style={labelStyle}>
            Nuova password (min. 8 caratteri)
            <input type="password" style={inputStyle} value={newPwd}
              onChange={e => setNewPwd(e.target.value)} minLength={8} required />
          </label>
          <label style={labelStyle}>
            Conferma nuova password
            <input type="password" style={inputStyle} value={confirm}
              onChange={e => setConfirm(e.target.value)} minLength={8} required />
          </label>
          <button type="submit" disabled={loading} style={{
            width: '100%', marginTop: 24, padding: '12px',
            background: loading ? '#93c5fd' : '#3b82f6', color: '#fff',
            border: 'none', borderRadius: 6, fontWeight: 700,
            fontSize: '1rem', cursor: loading ? 'not-allowed' : 'pointer',
          }}>
            {loading ? 'Salvataggio...' : 'Imposta nuova password'}
          </button>
        </form>
      </div>
    </div>
  );
}
