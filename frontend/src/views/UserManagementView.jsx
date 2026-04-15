import React from 'react';
import { ModalOverlay } from '../components/ModalOverlay';
import { API_BASE } from '../constants';

const TOKEN_KEY = 'spid_token';
const API_USERS_BASE = `${API_BASE}/api/users`;

class UserManagementBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  render() {
    if (this.state.hasError) return (
      <div style={{ padding: 24, color: '#991b1b', background: '#fef2f2', borderRadius: 8, margin: 24 }}>
        <strong>Errore in Gestione Utenti:</strong><br />
        <code style={{ fontSize: '0.85rem' }}>{this.state.error?.message}</code>
      </div>
    );
    return this.props.children;
  }
}

const refreshAccessToken = async () => {
  const rt = localStorage.getItem('spid_refresh_token');
  if (!rt) throw new Error('Nessun refresh token');
  const res = await fetch(`${API_BASE}/api/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: rt }),
  });
  if (!res.ok) throw new Error('Refresh fallito');
  const data = await res.json();
  localStorage.setItem(TOKEN_KEY, data.accessToken);
  return data.accessToken;
};

const authFetch = async (url, options = {}) => {
  let token = localStorage.getItem(TOKEN_KEY);
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    if (Date.now() > payload.exp * 1000 - 10000) token = await refreshAccessToken();
  } catch (e) {}
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + token,
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Errore ' + res.status);
  }
  return res.json();
};

function UserManagementInner() {
  const [users,    setUsers]   = React.useState([]);
  const [loading,  setLoading] = React.useState(true);
  const [modal,    setModal]   = React.useState(null);
  const [selected, setSelected] = React.useState(null);
  const [form,     setForm]    = React.useState({ username: '', email: '', password: '', role: 'viewer', active: 1 });
  const [newPwd,   setNewPwd]  = React.useState('');
  const [err,      setErr]     = React.useState('');
  const [ok,       setOk]      = React.useState('');

  const load = async () => {
    setLoading(true);
    try {
      const data = await authFetch(API_USERS_BASE);
      setUsers(Array.isArray(data) ? data : data.users || []);
    } catch (e) { setErr('Errore caricamento utenti: ' + e.message); }
    finally { setLoading(false); }
  };
  React.useEffect(() => { load(); }, []);

  const flash = (msg, isErr = false) => {
    if (isErr) { setErr(msg); setOk(''); } else { setOk(msg); setErr(''); }
    setTimeout(() => { setErr(''); setOk(''); }, 3000);
  };

  const handleCreate = async () => {
    if (!form.username || !form.email || !form.password) { flash('Compila tutti i campi obbligatori', true); return; }
    try {
      await authFetch(API_USERS_BASE, { method: 'POST', body: JSON.stringify(form) });
      flash('Utente creato — dovrà cambiare la password al primo accesso');
      setModal(null); load();
    } catch (e) { flash(e.message, true); }
  };

  const handleEdit = async () => {
    try {
      const payload = { username: form.username, email: form.email, role: form.role, active: Number(form.active) };
      await authFetch(API_USERS_BASE + '/' + selected.id, { method: 'PUT', body: JSON.stringify(payload) });
      flash('Utente aggiornato'); setModal(null); load();
    } catch (e) { flash(e.message, true); }
  };

  const handleReset = async () => {
    if (!newPwd || newPwd.length < 8) { flash('Password minimo 8 caratteri', true); return; }
    try {
      await authFetch(API_USERS_BASE + '/' + selected.id + '/reset-password',
        { method: 'POST', body: JSON.stringify({ newPassword: newPwd }) });
      flash("Password reimpostata — l'utente dovrà cambiarla al prossimo accesso");
      setModal(null);
    } catch (e) { flash(e.message, true); }
  };

  const handleDelete = async (u) => {
    if (!window.confirm('Eliminare utente ' + u.username + '?')) return;
    try {
      await authFetch(API_USERS_BASE + '/' + u.id, { method: 'DELETE' });
      flash('Utente eliminato'); load();
    } catch (e) { flash(e.message, true); }
  };

  const roleBadge = (r) => {
    const map = {
      admin:    { bg: '#dbeafe', c: '#1e40af' },
      operator: { bg: '#dcfce7', c: '#166534' },
      reviewer: { bg: '#fef9c3', c: '#92400e' },
      viewer:   { bg: '#f1f5f9', c: '#475569' },
    };
    const s = map[r] || map.viewer;
    return <span style={{ background: s.bg, color: s.c, padding: '2px 10px', borderRadius: 12, fontSize: '0.78rem', fontWeight: 600 }}>{r}</span>;
  };

  const inputStyle = { width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '0.9rem', boxSizing: 'border-box', marginTop: 4 };
  const labelStyle = { display: 'block', fontWeight: 600, fontSize: '0.85rem', color: '#374151', marginTop: 12 };

  return (
    <div style={{ padding: 24, fontFamily: '-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: '1.3rem', color: '#1e293b' }}>👥 Gestione Utenti</h2>
        <button onClick={() => { setForm({ username: '', email: '', password: '', role: 'viewer', active: 1 }); setModal('create'); }}
          style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 18px', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer' }}>
          + Nuovo Utente
        </button>
      </div>

      {err && <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', color: '#991b1b', borderRadius: 6, padding: '10px 14px', marginBottom: 12 }}>{err}</div>}
      {ok  && <div style={{ background: '#f0fdf4', border: '1px solid #86efac', color: '#166534', borderRadius: 6, padding: '10px 14px', marginBottom: 12 }}>{ok}</div>}

      {loading ? (
        <div style={{ color: '#94a3b8', textAlign: 'center', marginTop: 60 }}>Caricamento...</div>
      ) : (
        <div style={{ background: '#fff', borderRadius: 10, boxShadow: '0 1px 4px rgba(0,0,0,.08)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.87rem' }}>
            <thead>
              <tr>
                {['Username', 'Email', 'Ruolo', 'Stato', 'Pwd', 'Ultimo Login', 'Azioni'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', background: '#f1f5f9', textAlign: 'left', borderBottom: '2px solid #e2e8f0', fontWeight: 600, color: '#374151' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Nessun utente trovato</td></tr>
              ) : users.map(u => (
                <tr key={u.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '10px 14px', fontWeight: 600 }}>{u.username}</td>
                  <td style={{ padding: '10px 14px', color: '#64748b' }}>{u.email}</td>
                  <td style={{ padding: '10px 14px' }}>{roleBadge(u.role)}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{ background: u.active ? '#dcfce7' : '#fee2e2', color: u.active ? '#166534' : '#991b1b',
                      padding: '2px 10px', borderRadius: 12, fontSize: '0.78rem', fontWeight: 600 }}>
                      {u.active ? 'Attivo' : 'Disattivo'}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                    {u.must_change_password
                      ? <span title="Deve cambiare password">⚠️</span>
                      : <span title="Password OK">✅</span>}
                  </td>
                  <td style={{ padding: '10px 14px', color: '#94a3b8', fontSize: '0.82rem' }}>
                    {u.last_login ? new Date(u.last_login).toLocaleString('it-IT') : '—'}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => { setSelected(u); setForm({ username: u.username, email: u.email, password: '', role: u.role, active: u.active }); setModal('edit'); }}
                        style={{ background: '#f1f5f9', color: '#374151', border: 'none', borderRadius: 5, padding: '5px 10px', fontSize: '0.8rem', cursor: 'pointer', fontWeight: 600 }}>
                        ✏️ Modifica
                      </button>
                      <button onClick={() => { setSelected(u); setNewPwd(''); setModal('reset'); }}
                        style={{ background: '#fef9c3', color: '#92400e', border: 'none', borderRadius: 5, padding: '5px 10px', fontSize: '0.8rem', cursor: 'pointer', fontWeight: 600 }}>
                        🔑 Reset pwd
                      </button>
                      <button onClick={() => handleDelete(u)}
                        style={{ background: '#fee2e2', color: '#991b1b', border: 'none', borderRadius: 5, padding: '5px 10px', fontSize: '0.8rem', cursor: 'pointer', fontWeight: 600 }}>
                        🗑️ Elimina
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal === 'create' && (
        <ModalOverlay onClose={() => setModal(null)}>
          <h3 style={{ margin: '0 0 4px', color: '#1e293b' }}>Nuovo Utente</h3>
          <p style={{ margin: '0 0 12px', fontSize: '0.82rem', color: '#64748b' }}>L'utente dovrà cambiare la password al primo accesso.</p>
          <label style={labelStyle}>Username *<input style={inputStyle} value={form.username} onChange={e => setForm(p => ({ ...p, username: e.target.value }))} /></label>
          <label style={labelStyle}>Email *<input style={inputStyle} type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} /></label>
          <label style={labelStyle}>Password temporanea *<input style={inputStyle} type="password" value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} /></label>
          <label style={labelStyle}>Ruolo
            <select style={inputStyle} value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))}>
              <option value="viewer">viewer — Visualizzatore</option>
              <option value="reviewer">reviewer — Revisore</option>
              <option value="operator">operator — Operatore</option>
              <option value="admin">admin — Amministratore</option>
            </select>
          </label>
          <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
            <button onClick={() => setModal(null)} style={{ background: '#f1f5f9', border: 'none', borderRadius: 6, padding: '8px 18px', cursor: 'pointer', fontWeight: 600 }}>Annulla</button>
            <button onClick={handleCreate} style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 18px', cursor: 'pointer', fontWeight: 600 }}>Crea</button>
          </div>
        </ModalOverlay>
      )}

      {modal === 'edit' && (
        <ModalOverlay onClose={() => setModal(null)}>
          <h3 style={{ margin: '0 0 4px', color: '#1e293b' }}>Modifica — {selected?.username}</h3>
          <label style={labelStyle}>Email<input style={inputStyle} type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} /></label>
          <label style={labelStyle}>Ruolo
            <select style={inputStyle} value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))}>
              <option value="viewer">viewer — Visualizzatore</option>
              <option value="reviewer">reviewer — Revisore</option>
              <option value="operator">operator — Operatore</option>
              <option value="admin">admin — Amministratore</option>
            </select>
          </label>
          <label style={labelStyle}>Stato
            <select style={inputStyle} value={form.active} onChange={e => setForm(p => ({ ...p, active: Number(e.target.value) }))}>
              <option value={1}>Attivo</option>
              <option value={0}>Disattivo</option>
            </select>
          </label>
          <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
            <button onClick={() => setModal(null)} style={{ background: '#f1f5f9', border: 'none', borderRadius: 6, padding: '8px 18px', cursor: 'pointer', fontWeight: 600 }}>Annulla</button>
            <button onClick={handleEdit} style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 18px', cursor: 'pointer', fontWeight: 600 }}>Salva</button>
          </div>
        </ModalOverlay>
      )}

      {modal === 'reset' && (
        <ModalOverlay onClose={() => setModal(null)}>
          <h3 style={{ margin: '0 0 4px', color: '#1e293b' }}>Reset Password — {selected?.username}</h3>
          <p style={{ margin: '0 0 12px', fontSize: '0.82rem', color: '#64748b' }}>L'utente dovrà cambiare la password al prossimo accesso.</p>
          <label style={labelStyle}>Nuova Password temporanea (min. 8 caratteri)
            <input style={inputStyle} type="password" value={newPwd} onChange={e => setNewPwd(e.target.value)} autoFocus />
          </label>
          <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
            <button onClick={() => setModal(null)} style={{ background: '#f1f5f9', border: 'none', borderRadius: 6, padding: '8px 18px', cursor: 'pointer', fontWeight: 600 }}>Annulla</button>
            <button onClick={handleReset} style={{ background: '#f59e0b', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 18px', cursor: 'pointer', fontWeight: 600 }}>Reimposta</button>
          </div>
        </ModalOverlay>
      )}
    </div>
  );
}

export function UserManagementView() {
  return (
    <UserManagementBoundary>
      <UserManagementInner />
    </UserManagementBoundary>
  );
}
export default UserManagementView;