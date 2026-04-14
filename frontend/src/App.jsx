import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import { notify } from './services/notificationService';
import { PRPreviewModal } from './components/PRPreviewModal';
import { ProgressTracker } from './components/ProgressTracker';
import { ValidationBadge } from './components/ValidationBadge';

const API_BASE  = process.env.REACT_APP_GATEWAY_URL || 'http://localhost:8080';
const TOKEN_KEY = 'spid_token';
const LS_KEY    = 'spid-pr-history';

const getAuthHeaders = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem(TOKEN_KEY)}` }
});

const API = {
  files:          `${API_BASE}/api/files/files`,
  upload:         `${API_BASE}/api/files/upload`,
  fileContent:    (f) => `${API_BASE}/api/files/files/${encodeURIComponent(f)}/content`,
  fileValidate:   (f) => `${API_BASE}/api/files/files/${encodeURIComponent(f)}/validate`,
  deleteFiles:    `${API_BASE}/api/files/delete-xml-files`,
  validateGithub: `${API_BASE}/api/github/validate`,
  previewPR:      `${API_BASE}/api/pr/preview`,
  createPR:       `${API_BASE}/api/pr/create`,
  prStatus:       (n) => `${API_BASE}/api/pr/status/${n}`,
  login:          `${API_BASE}/api/auth/login`,
  changePassword: `${API_BASE}/api/auth/me/password`,
  users:         `${API_BASE}/api/users`,
  userById:      (id) => `${API_BASE}/api/users/${id}`,
  userResetPwd:  (id) => `${API_BASE}/api/users/${id}/reset-password`,
};

axios.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem(TOKEN_KEY);
      window.location.reload();
    }
    return Promise.reject(err);
  }
);

// ─── AUTH ────────────────────────────────────────────────
function useAuth() {
  const [token, setToken]                     = useState(localStorage.getItem(TOKEN_KEY));
  const [mustChangePassword, setMustChange]   = useState(false);

  const login  = (t, rt, mustChange = false) => {
    localStorage.setItem(TOKEN_KEY, t);
    if (rt) localStorage.setItem('spid_refresh_token', rt);
    setToken(t);
    setMustChange(mustChange);
  };
  const logout = () => { localStorage.removeItem(TOKEN_KEY); setToken(null); setMustChange(false); };
  const passwordChanged = () => setMustChange(false);

  return { token, login, logout, mustChangePassword, passwordChanged };
}

function getUserRole() {
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return null;
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.role || null;
  } catch { return null; }
}

// ─── FORCE CHANGE PASSWORD MODAL ─────────────────────────
function ForceChangePasswordModal({ onSuccess }) {
  const [oldPwd,   setOldPwd]   = useState('');
  const [newPwd,   setNewPwd]   = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (newPwd !== confirm)  return setError('Le password non coincidono');
    if (newPwd.length < 8)   return setError('La nuova password deve essere di almeno 8 caratteri');
    if (newPwd === oldPwd)   return setError('La nuova password deve essere diversa da quella attuale');

    setLoading(true);
    try {
      await axios.put(
        API.changePassword,
        { oldPassword: oldPwd, newPassword: newPwd },
        getAuthHeaders()
      );
      notify.success('Password aggiornata con successo!');
      onSuccess();
    } catch (err) {
      setError(err.response?.data?.error || 'Errore durante il cambio password');
    } finally {
      setLoading(false);
    }
  };

  const overlayStyle = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,.65)',
    zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center'
  };
  const boxStyle = {
    background: '#fff', borderRadius: 12, padding: 36, width: 420,
    maxWidth: '95vw', boxShadow: '0 8px 40px rgba(0,0,0,.25)'
  };
  const inputStyle = {
    width: '100%', padding: '10px 12px', border: '1px solid #d1d5db',
    borderRadius: 6, fontSize: '0.95rem', boxSizing: 'border-box', marginTop: 4
  };
  const labelStyle = { display: 'block', fontWeight: 600, fontSize: '0.88rem', color: '#374151', marginTop: 14 };

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
            fontSize: '1rem', cursor: loading ? 'not-allowed' : 'pointer'
          }}>
            {loading ? 'Salvataggio...' : 'Imposta nuova password'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── LOGIN ───────────────────────────────────────────────
function LoginPage({ onLogin }) {
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
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#f8fafc' }}>
      <div style={{ background:'#fff', borderRadius:12, padding:40, width:360, boxShadow:'0 4px 24px rgba(0,0,0,.12)' }}>
        <h2 style={{ textAlign:'center', marginBottom:24 }}>🔐 SPID Metadata App</h2>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom:16 }}>
            <label style={{ display:'block', marginBottom:6, fontWeight:600 }}>Username</label>
            <input value={username} onChange={e => setUsername(e.target.value)} autoFocus required
              style={{ width:'100%', padding:'10px 12px', border:'1px solid #d1d5db', borderRadius:6, fontSize:'1rem', boxSizing:'border-box' }} />
          </div>
          <div style={{ marginBottom:24 }}>
            <label style={{ display:'block', marginBottom:6, fontWeight:600 }}>Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
              style={{ width:'100%', padding:'10px 12px', border:'1px solid #d1d5db', borderRadius:6, fontSize:'1rem', boxSizing:'border-box' }} />
          </div>
          <button type="submit" disabled={loading}
            style={{ width:'100%', padding:'12px', background:'#3b82f6', color:'#fff', border:'none', borderRadius:6, fontWeight:600, fontSize:'1rem', cursor:'pointer' }}>
            {loading ? 'Accesso...' : 'Accedi'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── APP ROOT ────────────────────────────────────────────
function App() {
  const { token, login, logout, mustChangePassword, passwordChanged } = useAuth();

  if (!token) return <LoginPage onLogin={login} />;

  return (
    <>
      {/* Modal bloccante cambio password obbligatorio */}
      {mustChangePassword && (
        <ForceChangePasswordModal onSuccess={passwordChanged} />
      )}

      {/* App principale — visibile ma non interagibile finché mustChangePassword = true */}
      <Router>
        <div style={{ position:'fixed', top:12, right:16, zIndex: mustChangePassword ? 0 : 9999 }}>
          <button onClick={logout}
            style={{ background:'none', border:'1px solid #d1d5db', borderRadius:6, padding:'4px 12px', cursor:'pointer', fontSize:'0.85rem', color:'#6b7280' }}>
            Esci
          </button>
        </div>
        <Routes>
          <Route path="/"        element={<MainPage />} />
          <Route path="/history" element={<PRHistoryPage />} />
        </Routes>
      </Router>
    </>
  );
}

// ─── GESTIONE UTENTI ────────────────────────────────────────────────────
const API_USERS_BASE = (process.env.REACT_APP_GATEWAY_URL || 'http://localhost:8080') + '/api/users';

function ModalOverlay({ children, onClose }) {
  return (
    <div onClick={onClose}
      style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex:2000, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div onClick={e => e.stopPropagation()}
        style={{ background:'#fff', borderRadius:10, padding:28, width:420, maxWidth:'95vw', boxShadow:'0 8px 32px rgba(0,0,0,.18)' }}>
        {children}
      </div>
    </div>
  );
}

class UserManagementBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  render() {
    if (this.state.hasError) return (
      <div style={{ padding:24, color:'#991b1b', background:'#fef2f2', borderRadius:8, margin:24 }}>
        <strong>Errore in Gestione Utenti:</strong><br/>
        <code style={{ fontSize:'0.85rem' }}>{this.state.error?.message}</code>
      </div>
    );
    return this.props.children;
  }
}

function UserManagement() {
  const [users,   setUsers]   = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [modal,   setModal]   = React.useState(null);
  const [selected, setSelected] = React.useState(null);
  const [form,    setForm]    = React.useState({ username:'', email:'', password:'', role:'viewer', active:1 });
  const [newPwd,  setNewPwd]  = React.useState('');
  const [err,     setErr]     = React.useState('');
  const [ok,      setOk]      = React.useState('');

  const refreshAccessToken = async () => {
    const rt = localStorage.getItem('spid_refresh_token');
    if (!rt) throw new Error('Nessun refresh token');
    const res = await fetch(`${API_BASE}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: rt })
    });
    if (!res.ok) throw new Error('Refresh fallito');
    const data = await res.json();
    localStorage.setItem('spid_token', data.accessToken);
    return data.accessToken;
  };

  const authFetch = async (url, options = {}) => {
    let token = localStorage.getItem('spid_token');
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      if (Date.now() > payload.exp * 1000 - 10000) token = await refreshAccessToken();
    } catch(e) {}
    const res = await fetch(url, {
      ...options,
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token, ...(options.headers || {}) }
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || 'Errore ' + res.status);
    }
    return res.json();
  };

  const load = async () => {
    setLoading(true);
    try {
      const data = await authFetch(API_USERS_BASE);
      setUsers(Array.isArray(data) ? data : data.users || []);
    } catch(e) { setErr('Errore caricamento utenti: ' + e.message); }
    finally { setLoading(false); }
  };

  React.useEffect(() => { load(); }, []);

  const flash = (msg, isErr=false) => {
    if (isErr) { setErr(msg); setOk(''); } else { setOk(msg); setErr(''); }
    setTimeout(() => { setErr(''); setOk(''); }, 3000);
  };

  const openCreate = () => { setForm({ username:'', email:'', password:'', role:'viewer', active:1 }); setModal('create'); };
  const openEdit   = (u) => { setSelected(u); setForm({ username:u.username, email:u.email, password:'', role:u.role, active:u.active }); setModal('edit'); };
  const openReset  = (u) => { setSelected(u); setNewPwd(''); setModal('reset'); };

  const handleCreate = async () => {
    if (!form.username || !form.email || !form.password) { flash('Compila tutti i campi obbligatori', true); return; }
    try {
      await authFetch(API_USERS_BASE, { method:'POST', body: JSON.stringify(form) });
      flash('Utente creato — dovrà cambiare la password al primo accesso');
      setModal(null); load();
    } catch(e) { flash(e.message, true); }
  };

  const handleEdit = async () => {
    try {
      const payload = { username: form.username, email: form.email, role: form.role, active: Number(form.active) };
      await authFetch(API_USERS_BASE + '/' + selected.id, { method:'PUT', body: JSON.stringify(payload) });
      flash('Utente aggiornato'); setModal(null); load();
    } catch(e) { flash(e.message, true); }
  };

  const handleReset = async () => {
    if (!newPwd || newPwd.length < 8) { flash('Password minimo 8 caratteri', true); return; }
    try {
      await authFetch(API_USERS_BASE + '/' + selected.id + '/reset-password', { method:'POST', body: JSON.stringify({ newPassword: newPwd }) });
      flash('Password reimpostata — l\'utente dovrà cambiarla al prossimo accesso');
      setModal(null);
    } catch(e) { flash(e.message, true); }
  };

  const handleDelete = async (u) => {
    if (!window.confirm('Eliminare utente ' + u.username + '?')) return;
    try {
      await authFetch(API_USERS_BASE + '/' + u.id, { method:'DELETE' });
      flash('Utente eliminato'); load();
    } catch(e) { flash(e.message, true); }
  };

  const roleBadge = (r) => {
    const map = {
      admin:    { bg:'#dbeafe', c:'#1e40af' },
      operator: { bg:'#dcfce7', c:'#166534' },
      reviewer: { bg:'#fef9c3', c:'#92400e' },
      viewer:   { bg:'#f1f5f9', c:'#475569' }
    };
    const s = map[r] || map.viewer;
    return <span style={{ background:s.bg, color:s.c, padding:'2px 10px', borderRadius:12, fontSize:'0.78rem', fontWeight:600 }}>{r}</span>;
  };

  const inputStyle = { width:'100%', padding:'8px 10px', border:'1px solid #d1d5db', borderRadius:6, fontSize:'0.9rem', boxSizing:'border-box', marginTop:4 };
  const labelStyle = { display:'block', fontWeight:600, fontSize:'0.85rem', color:'#374151', marginTop:12 };

  return (
    <div style={{ padding:24, fontFamily:'-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
        <h2 style={{ margin:0, fontSize:'1.3rem', color:'#1e293b' }}>👥 Gestione Utenti</h2>
        <button onClick={openCreate}
          style={{ background:'#2563eb', color:'#fff', border:'none', borderRadius:6, padding:'8px 18px', fontWeight:600, fontSize:'0.9rem', cursor:'pointer' }}>
          + Nuovo Utente
        </button>
      </div>

      {err && <div style={{ background:'#fef2f2', border:'1px solid #fca5a5', color:'#991b1b', borderRadius:6, padding:'10px 14px', marginBottom:12 }}>{err}</div>}
      {ok  && <div style={{ background:'#f0fdf4', border:'1px solid #86efac', color:'#166534', borderRadius:6, padding:'10px 14px', marginBottom:12 }}>{ok}</div>}

      {loading ? <div style={{ color:'#94a3b8', textAlign:'center', marginTop:60 }}>Caricamento...</div> : (
        <div style={{ background:'#fff', borderRadius:10, boxShadow:'0 1px 4px rgba(0,0,0,.08)', overflow:'hidden' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.87rem' }}>
            <thead>
              <tr>
                {['Username','Email','Ruolo','Stato','Pwd','Ultimo Login','Azioni'].map(h => (
                  <th key={h} style={{ padding:'10px 14px', background:'#f1f5f9', textAlign:'left', borderBottom:'2px solid #e2e8f0', fontWeight:600, color:'#374151' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr><td colSpan={7} style={{ padding:40, textAlign:'center', color:'#94a3b8' }}>Nessun utente trovato</td></tr>
              ) : users.map(u => (
                <tr key={u.id} style={{ borderBottom:'1px solid #f1f5f9' }}>
                  <td style={{ padding:'10px 14px', fontWeight:600 }}>{u.username}</td>
                  <td style={{ padding:'10px 14px', color:'#64748b' }}>{u.email}</td>
                  <td style={{ padding:'10px 14px' }}>{roleBadge(u.role)}</td>
                  <td style={{ padding:'10px 14px' }}>
                    <span style={{ background: u.active ? '#dcfce7' : '#fee2e2', color: u.active ? '#166534' : '#991b1b', padding:'2px 10px', borderRadius:12, fontSize:'0.78rem', fontWeight:600 }}>
                      {u.active ? 'Attivo' : 'Disattivo'}
                    </span>
                  </td>
                  <td style={{ padding:'10px 14px', textAlign:'center' }}>
                    {u.must_change_password
                      ? <span title="Deve cambiare password" style={{ fontSize:'1rem' }}>⚠️</span>
                      : <span title="Password OK" style={{ fontSize:'1rem' }}>✅</span>
                    }
                  </td>
                  <td style={{ padding:'10px 14px', color:'#94a3b8', fontSize:'0.82rem' }}>
                    {u.last_login ? new Date(u.last_login).toLocaleString('it-IT') : '—'}
                  </td>
                  <td style={{ padding:'10px 14px' }}>
                    <div style={{ display:'flex', gap:6 }}>
                      <button onClick={() => openEdit(u)}
                        style={{ background:'#f1f5f9', color:'#374151', border:'none', borderRadius:5, padding:'5px 10px', fontSize:'0.8rem', cursor:'pointer', fontWeight:600 }}>
                        ✏️ Modifica
                      </button>
                      <button onClick={() => openReset(u)}
                        style={{ background:'#fef9c3', color:'#92400e', border:'none', borderRadius:5, padding:'5px 10px', fontSize:'0.8rem', cursor:'pointer', fontWeight:600 }}>
                        🔑 Reset pwd
                      </button>
                      <button onClick={() => handleDelete(u)}
                        style={{ background:'#fee2e2', color:'#991b1b', border:'none', borderRadius:5, padding:'5px 10px', fontSize:'0.8rem', cursor:'pointer', fontWeight:600 }}>
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
          <h3 style={{ margin:'0 0 4px', color:'#1e293b' }}>Nuovo Utente</h3>
          <p style={{ margin:'0 0 12px', fontSize:'0.82rem', color:'#64748b' }}>
            L'utente dovrà cambiare la password al primo accesso.
          </p>
          <label style={labelStyle}>Username *<input style={inputStyle} value={form.username} onChange={e => setForm(p=>({...p,username:e.target.value}))} /></label>
          <label style={labelStyle}>Email *<input style={inputStyle} type="email" value={form.email} onChange={e => setForm(p=>({...p,email:e.target.value}))} /></label>
          <label style={labelStyle}>Password temporanea *<input style={inputStyle} type="password" value={form.password} onChange={e => setForm(p=>({...p,password:e.target.value}))} /></label>
          <label style={labelStyle}>Ruolo
            <select style={inputStyle} value={form.role} onChange={e => setForm(p=>({...p,role:e.target.value}))}>
              <option value="viewer">viewer — Visualizzatore</option>
              <option value="reviewer">reviewer — Revisore</option>
              <option value="operator">operator — Operatore</option>
              <option value="admin">admin — Amministratore</option>
            </select>
          </label>
          <div style={{ display:'flex', gap:10, marginTop:20, justifyContent:'flex-end' }}>
            <button onClick={() => setModal(null)} style={{ background:'#f1f5f9', border:'none', borderRadius:6, padding:'8px 18px', cursor:'pointer', fontWeight:600 }}>Annulla</button>
            <button onClick={handleCreate} style={{ background:'#2563eb', color:'#fff', border:'none', borderRadius:6, padding:'8px 18px', cursor:'pointer', fontWeight:600 }}>Crea</button>
          </div>
        </ModalOverlay>
      )}

      {modal === 'edit' && (
        <ModalOverlay onClose={() => setModal(null)}>
          <h3 style={{ margin:'0 0 4px', color:'#1e293b' }}>Modifica — {selected?.username}</h3>
          <label style={labelStyle}>Email<input style={inputStyle} type="email" value={form.email} onChange={e => setForm(p=>({...p,email:e.target.value}))} /></label>
          <label style={labelStyle}>Ruolo
            <select style={inputStyle} value={form.role} onChange={e => setForm(p=>({...p,role:e.target.value}))}>
              <option value="viewer">viewer — Visualizzatore</option>
              <option value="reviewer">reviewer — Revisore</option>
              <option value="operator">operator — Operatore</option>
              <option value="admin">admin — Amministratore</option>
            </select>
          </label>
          <label style={labelStyle}>Stato
            <select style={inputStyle} value={form.active} onChange={e => setForm(p=>({...p,active:Number(e.target.value)}))}>
              <option value={1}>Attivo</option>
              <option value={0}>Disattivo</option>
            </select>
          </label>
          <div style={{ display:'flex', gap:10, marginTop:20, justifyContent:'flex-end' }}>
            <button onClick={() => setModal(null)} style={{ background:'#f1f5f9', border:'none', borderRadius:6, padding:'8px 18px', cursor:'pointer', fontWeight:600 }}>Annulla</button>
            <button onClick={handleEdit} style={{ background:'#2563eb', color:'#fff', border:'none', borderRadius:6, padding:'8px 18px', cursor:'pointer', fontWeight:600 }}>Salva</button>
          </div>
        </ModalOverlay>
      )}

      {modal === 'reset' && (
        <ModalOverlay onClose={() => setModal(null)}>
          <h3 style={{ margin:'0 0 4px', color:'#1e293b' }}>Reset Password — {selected?.username}</h3>
          <p style={{ margin:'0 0 12px', fontSize:'0.82rem', color:'#64748b' }}>
            L'utente dovrà cambiare la password al prossimo accesso.
          </p>
          <label style={labelStyle}>Nuova Password temporanea (min. 8 caratteri)
            <input style={inputStyle} type="password" value={newPwd} onChange={e => setNewPwd(e.target.value)} autoFocus />
          </label>
          <div style={{ display:'flex', gap:10, marginTop:20, justifyContent:'flex-end' }}>
            <button onClick={() => setModal(null)} style={{ background:'#f1f5f9', border:'none', borderRadius:6, padding:'8px 18px', cursor:'pointer', fontWeight:600 }}>Annulla</button>
            <button onClick={handleReset} style={{ background:'#f59e0b', color:'#fff', border:'none', borderRadius:6, padding:'8px 18px', cursor:'pointer', fontWeight:600 }}>Reimposta</button>
          </div>
        </ModalOverlay>
      )}
    </div>
  );
}

// ─── MAIN PAGE ───────────────────────────────────────────
function MainPage() {
  const [files, setFiles]                         = useState([]);
  const [validating, setValidating] = useState(() => new Set());
  const [certificateLoading, setCertificateLoading] = useState(() => new Set());
  const [selectedFiles, setSelectedFiles]         = useState([]);
  const [search, setSearch]                       = useState('');
  const [sortConfig, setSortConfig]               = useState({ key:'creationDate', direction:'desc' });
  const [uploadProgress, setUploadProgress]       = useState({ loaded:0, total:0, active:false });
  const [uploadErrors, setUploadErrors]           = useState([]);
  const [registryCache, setRegistryCache]         = useState({});
  const [certificateCache, setCertificateCache]   = useState({});
  const [resultsPerPage, setResultsPerPage]       = useState(10);
  const [page, setPage]                           = useState(1);
  const [pullRequests, setPullRequests]           = useState([]);
  const [prPreview, setPrPreview]                 = useState(null);
  const [prInProgress, setPrInProgress]           = useState(false);
  const [prStep, setPrStep]                       = useState(0);
  const [githubValid, setGithubValid]             = useState(null);
  const [expandedRows, setExpandedRows]           = useState([]);
  const [errorFilterMode, setErrorFilterMode]     = useState('all');
  const [xmlModalContent, setXmlModalContent]     = useState(null);
  const [sectionsCollapsed, setSectionsCollapsed] = useState({ upload:false, files:false });
  const [validFilesForPR, setValidFilesForPR] = useState([]);
  const [activePage, setActivePage] = useState('main');
  const userRole = getUserRole();

  const fileInputRef = useRef();
  const dirInputRef  = useRef();
  const prSteps = ['Validazione','Creazione Branch','Upload File','Creazione Commit','Apertura PR'];

  useEffect(() => {
    loadFiles();
    validateGitHub();
    const raw = localStorage.getItem(LS_KEY);
    if (raw) { try { setPullRequests(JSON.parse(raw)); } catch { setPullRequests([]); } }
  }, []);

  const ensureSet = (value) => {
    if (value instanceof Set) return value;
    if (Array.isArray(value)) return new Set(value);
    return new Set();
  };

  const toggleSection = (s) => setSectionsCollapsed(prev => ({ ...prev, [s]: !prev[s] }));

  const loadFiles = async () => {
    try {
      const res = await axios.get(API.files, getAuthHeaders());
      setFiles(res.data);
    } catch { notify.error('Errore nel caricamento dei file'); }
  };

  const loadValidation = async (filename) => {
    const file = files.find(f => f.filename === filename);
    if (file?.validation) return file.validation;
    setValidating(prev => { const next = ensureSet(prev); next.add(filename); return new Set(next); });
    try {
      const res = await axios.get(API.fileValidate(filename), getAuthHeaders());
      setFiles(prev => Array.isArray(prev) ? prev.map(f => f.filename === filename ? { ...f, validation: res.data } : f) : []);
      return res.data;
    } catch {
      const fallback = { errors: [], warnings: [] };
      setFiles(prev => Array.isArray(prev) ? prev.map(f => f.filename === filename ? { ...f, validation: fallback } : f) : []);
      return fallback;
    } finally {
      setValidating(prev => { const next = ensureSet(prev); next.delete(filename); return new Set(next); });
    }
  };

  const loadRegistryData = async (entityID) => {
    if (registryCache[entityID]) return registryCache[entityID];
    try {
      const res  = await axios.get(`https://registry.spid.gov.it/entities-sp/${encodeURIComponent(entityID)}?output=json`);
      const data = { exists:true, createDate:res.data.create_date||null, lastUpdateDate:res.data.lastupdate_date||null, registry_link:res.data.registry_link||`https://registry.spid.gov.it/entities-sp/${encodeURIComponent(entityID)}`, raw:res.data };
      setRegistryCache(prev => ({ ...prev, [entityID]: data }));
      return data;
    } catch (err) {
      const data = err.response?.status === 404 ? { exists:false } : { exists:false, error:true };
      setRegistryCache(prev => ({ ...prev, [entityID]: data }));
      return data;
    }
  };

// App.jsx — sostituisci la funzione loadCertificateData esistente

// La cache usa "filename::entityId" come chiave invece di solo entityId
// per evitare collisioni tra file diversi con lo stesso entityId

const loadCertificateData = async (entityId) => {
  const file = files.find(f => f.entityID === entityId);
  if (!entityId) return;

  // Chiave cache composta: filename::entityId
  const cacheKey = file?.filename
    ? `${file.filename}::${entityId}`
    : entityId;

  if (certificateCache[cacheKey]) return certificateCache[cacheKey];

  setCertificateLoading(prev => {
    const next = ensureSet(prev);
    next.add(entityId);
    return new Set(next);
  });

  try {
    let xmlContent = null;
    if (file?.filename) {
      try {
        const xmlRes = await axios.post(
          `${API_BASE}/api/files/get-xml-contents`,
          { filenames: [file.filename] },
          getAuthHeaders
        );
        xmlContent = Array.isArray(xmlRes.data)
          ? xmlRes.data[0]?.content
          : null;
      } catch {
        // xmlContent rimane null → fallback a registry
      }
    }

    const res = await axios.post(
      `${API_BASE}/api/certificates/verify`,
      xmlContent ? { entityId, xmlContent } : { entityId },
      getAuthHeaders
    );

    // Dopo aver salvato in cache:
    setCertificateCache(prev => ({
      ...(typeof prev === 'object' ? prev : {}),
      [cacheKey]: res.data,
    }));

    // ← NUOVO: se certificato non valido, aggiunge errori in file.validation
    if (!res.data.valid) {
      const certErrors = (res.data.errors || []).map(e => ({
        testId:  'CERT_INVALID',
        message: e,
        source:  'certificate',
      }));
      setFiles(prev => Array.isArray(prev)
        ? prev.map(f => {
            if (f.entityID !== entityId) return f;
            const existing = f.validation || { errors: [], warnings: [] };
            // evita duplicati
            const alreadyAdded = existing.errors.some(e => e.source === 'certificate');
            if (alreadyAdded) return f;
            return {
              ...f,
              validation: {
                ...existing,
                errors: [...existing.errors, ...certErrors],
              },
            };
          })
        : prev
      );
    }
    return res.data;
  } catch (err) {
    const data = {
      valid: false,
      error: err.response?.data?.error || err.message || 'Errore verifica certificato',
    };
    setCertificateCache(prev => ({
      ...(typeof prev === 'object' ? prev : {}),
      [cacheKey]: data,
    }));
    return data;
  } finally {
    setCertificateLoading(prev => {
      const next = ensureSet(prev);
      next.delete(entityId);
      return new Set(next);
    });
  }
};

// ─── ATTENZIONE: aggiorna anche la lettura della cache nelle righe della tabella ───
//
// PRIMA (usa solo entityId come chiave):
//   const certInfo = file.entityID ? certificateCache[file.entityID] : null
//   const certLoading = file.entityID ? safeCertificateLoading.has(file.entityID) : false
//
// DOPO (usa la chiave composta):
//   const certCacheKey = file.filename && file.entityID
//     ? `${file.filename}::${file.entityID}`
//     : file.entityID
//   const certInfo = certCacheKey ? certificateCache[certCacheKey] : null
//   const certLoading = file.entityID ? safeCertificateLoading.has(file.entityID) : false


  const handleViewXml = async (filename) => {
    try {
      const res     = await axios.post(`${API_BASE}/api/files/get-xml-contents`, { filenames:[filename] }, getAuthHeaders());
      const content = Array.isArray(res.data) ? res.data[0]?.content : res.data?.content;
      setXmlModalContent({ filename, content: content || '' });
    } catch { notify.error('Errore nel caricamento del contenuto XML'); }
  };

  const validateGitHub = async () => {
    try {
      const res = await axios.get(API.validateGithub, getAuthHeaders());
      setGithubValid(res.data.valid);
      if (!res.data.valid) notify.warning('GitHub non configurato correttamente');
    } catch { setGithubValid(false); }
  };

  const handleUpload = async (e) => {
    const allFiles  = Array.from(e.target.files);
    if (allFiles.length === 0) return;
    const xmlFiles  = allFiles.filter(f => f.name.toLowerCase().endsWith('.xml'));
    const discarded = allFiles.length - xmlFiles.length;
    if (xmlFiles.length === 0) { notify.warning('Nessun file XML selezionato'); e.target.value=null; return; }
    if (discarded > 0) notify.warning(`${discarded} file non XML ignorati`);
    setUploadProgress({ loaded:0, total:xmlFiles.length, active:true });
    setUploadErrors([]);
    const errors = [];
    for (let i = 0; i < xmlFiles.length; i++) {
      const file = xmlFiles[i];
      const fd   = new FormData();
      fd.append('xmlFile', file);
      try {
        await axios.post(API.upload, fd, { headers: { 'Content-Type':'multipart/form-data', Authorization:`Bearer ${localStorage.getItem(TOKEN_KEY)}` } });
        setUploadProgress(prev => ({ ...prev, loaded: i+1 }));
      } catch (err) { errors.push({ filename: file.name, error: err.response?.data?.error || err.message }); }
    }
    setUploadProgress({ loaded:0, total:0, active:false });
    if (errors.length > 0) { setUploadErrors(errors); notify.error(`${errors.length} file con errori`); }
    else notify.success(`${xmlFiles.length} file caricati con successo!`);
    await loadFiles();
    e.target.value = null;
  };

  const toggleFileSelection = (fn) => {
    const isSelected = selectedFiles.includes(fn);
    setSelectedFiles(prev => isSelected ? prev.filter(f => f !== fn) : [...prev, fn]);
    if (!isSelected) loadValidation(fn);
  };

  const sidebarFiles = files.filter(f => {
    const hasErrors = f.validation?.errors?.length > 0;
    if (errorFilterMode === 'onlyErrors') return hasErrors;
    if (errorFilterMode === 'noErrors')   return !hasErrors;
    return true;
  });

  const selectAll   = () => { const filenames = sidebarFiles.map(f => f.filename); setSelectedFiles(filenames); filenames.forEach(fn => loadValidation(fn)); };
  const deselectAll = () => setSelectedFiles([]);

  const toggleErrorFilter = () => {
    if (errorFilterMode === 'onlyErrors') { setErrorFilterMode('noErrors'); }
    else {
      const withErrors = files.filter(f => f.validation?.errors?.length > 0);
      if (withErrors.length === 0) notify.warning('Nessun file con errori tra i file caricati');
      setErrorFilterMode('onlyErrors');
    }
    setSelectedFiles([]);
  };

  const deleteSelected = async () => {
    if (!window.confirm(`Eliminare ${selectedFiles.length} file?`)) return;
    try {
      await axios.post(API.deleteFiles, { filenames: selectedFiles }, getAuthHeaders());
      notify.success(`${selectedFiles.length} file eliminati`);
      setSelectedFiles([]);
      await loadFiles();
    } catch { notify.error('Errore eliminazione file'); }
  };

  const openPRPreview = async () => {
    if (selectedFiles.length === 0) { notify.warning('Seleziona almeno un file'); return; }
    const validFiles = selectedFiles.filter(fn => { const file = files.find(f => f.filename === fn); return file?.validation && file.validation.errors?.length === 0; });
    if (validFiles.length === 0) { notify.error('Nessun file valido (tutti hanno errori di validazione)'); return; }
    if (validFiles.length < selectedFiles.length) notify.warning(`${selectedFiles.length - validFiles.length} file con errori esclusi dalla PR`);
    try {
      const res = await axios.post(API.previewPR, { files: validFiles }, getAuthHeaders());
      setPrPreview(res.data);
      setValidFilesForPR(validFiles);
    } catch (err) { notify.error('Errore anteprima PR: ' + (err.response?.data?.error || err.message)); }
  };

  const confirmCreatePR = async () => {
    setPrInProgress(true); setPrStep(0);
    try {
      const res = await axios.post(API.createPR, { files: validFilesForPR, organizations: prPreview.organizations, draft: false }, getAuthHeaders());
      if (res.data.success) {
        notify.success('PR creata con successo!');
        const newPR = { id:Date.now(), number:res.data.number, url:res.data.url, branch:res.data.branch, organizations:prPreview.organizations, fileCount:validFilesForPR.length, createdAt:new Date().toISOString(), status:'open' };
        const updated = [newPR, ...pullRequests];
        setPullRequests(updated);
        localStorage.setItem(LS_KEY, JSON.stringify(updated));
        setSelectedFiles([]); setValidFilesForPR([]); setPrPreview(null);
        await loadFiles();
      }
    } catch (err) { notify.error('Errore creazione PR: ' + (err.response?.data?.error || err.message)); }
    finally { setPrInProgress(false); setPrStep(0); }
  };

  const toggleRowExpansion = async filename => {
    if ((Array.isArray(expandedRows) ? expandedRows : []).includes(filename)) {
      setExpandedRows(prev => (Array.isArray(prev) ? prev.filter(f => f !== filename) : []));
      return;
    }
    setExpandedRows(prev => (Array.isArray(prev) ? [...prev, filename] : [filename]));
    const file = files.find(f => f.filename === filename);
    if (file?.entityID && !registryCache[file.entityID]) loadRegistryData(file.entityID);
    if (file?.entityID) loadCertificateData(file.entityID);
    loadValidation(filename);
  };

  const handleSort = (key) => setSortConfig(prev => ({ key, direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc' }));

  const selectedFileObjects = files.filter(f => selectedFiles.includes(f.filename));
  const filteredFiles = selectedFileObjects.filter(f =>
    f.filename.toLowerCase().includes(search.toLowerCase()) ||
    f.entityID?.toLowerCase().includes(search.toLowerCase()) ||
    f.organizationName?.toLowerCase().includes(search.toLowerCase())
  );
  const sortedFiles = [...filteredFiles].sort((a, b) => {
    const dir = sortConfig.direction === 'asc' ? 1 : -1;
    if (sortConfig.key === 'creationDate') return (new Date(a[sortConfig.key]) - new Date(b[sortConfig.key])) * dir;
    return (a[sortConfig.key]||'').localeCompare(b[sortConfig.key]||'') * dir;
  });
  const totalPages     = Math.ceil(sortedFiles.length / resultsPerPage);
  const paginatedFiles = sortedFiles.slice((page-1)*resultsPerPage, page*resultsPerPage);

  const S = {
    page:    { display:'flex', minHeight:'100vh', fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif', background:'#f8fafc' },
    sidebar: { width:290, minHeight:'100vh', background:'#1e293b', color:'#f1f5f9', display:'flex', flexDirection:'column', padding:16, gap:12, overflowY:'auto', flexShrink:0 },
    main:    { flex:1, padding:24, overflowY:'auto', minWidth:0 },
    card:    { background:'#fff', borderRadius:10, padding:16, boxShadow:'0 1px 4px rgba(0,0,0,.08)', marginBottom:16 },
    btn:     (bg='#3b82f6', c='#fff') => ({ background:bg, color:c, border:'none', borderRadius:6, padding:'8px 14px', cursor:'pointer', fontWeight:600, fontSize:'0.82rem' }),
    th:      { padding:'10px 12px', background:'#f1f5f9', textAlign:'left', borderBottom:'2px solid #e2e8f0', cursor:'pointer', userSelect:'none', fontSize:'0.85rem' },
    td:      { padding:'10px 12px', borderBottom:'1px solid #f1f5f9', fontSize:'0.85rem' },
  };

  return (
    <div style={S.page}>
      <div style={S.sidebar}>
        <div style={{ fontSize:'1.1rem', fontWeight:700 }}>📁 SPID Metadata</div>
        <div style={{ display:'flex', flexDirection:'column', gap:4, marginTop:8 }}>
          <button onClick={() => setActivePage('main')} style={{ background: activePage==='main'?'#3b82f6':'transparent', color:'#f1f5f9', border:'none', borderRadius:6, padding:'8px 10px', cursor:'pointer', textAlign:'left', fontSize:'0.85rem', fontWeight: activePage==='main'?700:400 }}>🏠 Dashboard</button>
          {userRole === 'admin' && (
            <button onClick={() => setActivePage('users')} style={{ background: activePage==='users'?'#3b82f6':'transparent', color:'#f1f5f9', border:'none', borderRadius:6, padding:'8px 10px', cursor:'pointer', textAlign:'left', fontSize:'0.85rem', fontWeight: activePage==='users'?700:400 }}>👥 Gestione Utenti</button>
          )}
        </div>
        {githubValid === false && <div style={{ background:'#7f1d1d', borderRadius:6, padding:'8px 10px', fontSize:'0.8rem' }}>⚠️ GitHub non configurato</div>}
        <div style={{ borderBottom:'1px solid #334155', paddingBottom:12 }}>
          <div style={{ fontWeight:600, marginBottom:8, display:'flex', justifyContent:'space-between', cursor:'pointer' }} onClick={() => toggleSection('upload')}>
            <span>📤 Upload{uploadProgress.active && ` (${uploadProgress.loaded}/${uploadProgress.total})`}</span>
            <span>{sectionsCollapsed.upload ? '▶' : '▼'}</span>
          </div>
          {!sectionsCollapsed.upload && (
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              <input type="file" ref={fileInputRef} multiple accept=".xml" style={{ display:'none' }} onChange={handleUpload} />
              <input type="file" ref={dirInputRef}  multiple accept=".xml" style={{ display:'none' }} onChange={handleUpload} webkitdirectory="true" />
              <button style={S.btn()} onClick={() => fileInputRef.current.click()} disabled={uploadProgress.active}>📁 Scegli File</button>
              <button style={S.btn('#475569')} onClick={() => dirInputRef.current.click()} disabled={uploadProgress.active}>📂 Scegli Cartella</button>
              {uploadProgress.active && (<div style={{ background:'#334155', borderRadius:6, height:6 }}><div style={{ background:'#3b82f6', height:6, borderRadius:6, transition:'width .3s', width:`${(uploadProgress.loaded/uploadProgress.total)*100}%` }} /></div>)}
              {uploadErrors.length > 0 && (<div style={{ background:'#7f1d1d', borderRadius:6, padding:8, fontSize:'0.78rem' }}>{uploadErrors.map((e,i) => <div key={i}>❌ {e.filename}: {e.error}</div>)}</div>)}
            </div>
          )}
        </div>
        <div style={{ flex:1, display:'flex', flexDirection:'column', gap:6, minHeight:0 }}>
          <div style={{ fontWeight:600, display:'flex', justifyContent:'space-between', cursor:'pointer' }} onClick={() => toggleSection('files')}>
            <span>📋 File ({files.length}){selectedFiles.length > 0 && ` — ${selectedFiles.length} sel.`}</span>
            <span>{sectionsCollapsed.files ? '▶' : '▼'}</span>
          </div>
          {!sectionsCollapsed.files && (
            <>
              <input placeholder="Cerca..." value={search} onChange={e => setSearch(e.target.value)} style={{ background:'#334155', border:'none', borderRadius:6, padding:'6px 10px', color:'#f1f5f9', fontSize:'0.85rem', width:'100%', boxSizing:'border-box' }} />
              <div style={{ flex:1, overflowY:'auto', maxHeight:340, display:'flex', flexDirection:'column', gap:3 }}>
                {sidebarFiles.filter(f => f.filename.toLowerCase().includes(search.toLowerCase())).map(file => {
                  const isSelected   = selectedFiles.includes(file.filename);
                  const isValidating = ensureSet(validating).has(file.filename);
                  const errCount     = file.validation?.errors?.length > 0;
                  const warnCount    = file.validation?.warnings?.length || 0;
                  const inRegistry   = file.entityID && registryCache[file.entityID]?.exists;
                  return (
                    <div key={file.filename} onClick={() => toggleFileSelection(file.filename)} style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 8px', borderRadius:6, cursor:'pointer', background: isSelected?'#2563eb':'#334155', border: isSelected?'1px solid #3b82f6':inRegistry?'1px solid #7c3aed':'1px solid transparent', boxShadow: inRegistry&&!isSelected?'0 0 0 1px #7c3aed33':'none' }}>
                      <input type="checkbox" checked={isSelected} onChange={e => { e.stopPropagation(); toggleFileSelection(file.filename); }} />
                      <span style={{ flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontSize:'0.8rem' }}>{file.filename}</span>
                      {isValidating ? <span style={{ fontSize:'0.7rem', color:'#94a3b8', flexShrink:0 }}>⟳</span> : file.validation ? (
                        <span style={{ display:'flex', gap:2, flexShrink:0 }}>
                          {errCount===0&&warnCount===0&&<span style={{ fontSize:'0.7rem', background:'#166534', color:'#d1fae5', padding:'1px 5px', borderRadius:8, fontWeight:700 }}>✓</span>}
                          {errCount>0&&<span style={{ fontSize:'0.7rem', background:'#991b1b', color:'#fee2e2', padding:'1px 5px', borderRadius:8, fontWeight:700 }}>✕{errCount}</span>}
                          {warnCount>0&&<span style={{ fontSize:'0.7rem', background:'#92400e', color:'#fef3c7', padding:'1px 5px', borderRadius:8, fontWeight:700 }}>⚠{warnCount}</span>}
                        </span>
                      ) : null}
                    </div>
                  );
                })}
                {sidebarFiles.length === 0 && <div style={{ color:'#94a3b8', fontSize:'0.82rem', textAlign:'center', marginTop:20 }}>Nessun file caricato</div>}
              </div>
              <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                <select onChange={async e => {
                  const val = e.target.value; if (!val) return;
                  if (val==='all') selectAll();
                  if (val==='none') deselectAll();
                  if (val==='invert') { const allSel = files.every(f => selectedFiles.includes(f.filename)); allSel ? deselectAll() : selectAll(); }
                  if (val==='errors') setSelectedFiles(files.filter(f => Array.isArray(f.validation?.errors)&&f.validation.errors.length>0).map(f=>f.filename));
                  if (val==='noerrors') setSelectedFiles(files.filter(f => f.validation&&Array.isArray(f.validation.errors)&&f.validation.errors.length===0).map(f=>f.filename));
                  if (val==='registry') {
                    const toLoad = files.filter(f => f.entityID && !registryCache[f.entityID]);
                    await Promise.all(toLoad.map(f => loadRegistryData(f.entityID)));
                    setSelectedFiles(prev => { const safePrev=Array.isArray(prev)?prev:[]; const inReg=files.filter(f=>f.entityID&&registryCache[f.entityID]?.exists).map(f=>f.filename); const allIn=inReg.every(fn=>safePrev.includes(fn)); return allIn?safePrev.filter(fn=>!inReg.includes(fn)):[...new Set([...safePrev,...inReg])]; });
                  }
                  e.target.value='';
                }} style={{ flex:1, background:'#334155', color:'#f1f5f9', border:'1px solid #475569', borderRadius:6, padding:'6px 8px', fontSize:'0.8rem', cursor:'pointer' }} defaultValue="">
                  <option value="" disabled>⚡ Selezione rapida…</option>
                  <option value="all">☑ Tutti ({files.length})</option>
                  <option value="none">☐ Nessuno</option>
                  <option value="invert">⇄ Inverti</option>
                  <option value="errors">❌ Solo con errori</option>
                  <option value="noerrors">✅ Solo senza errori</option>
                  <option value="registry">🌐 Solo in Registry</option>
                </select>
                {selectedFiles.length > 0 && <button style={S.btn('#475569')} onClick={deselectAll} title="Cancella selezione">✗ {selectedFiles.length}</button>}
              </div>
              {selectedFiles.length > 0 && (
                <div style={{ display:'flex', gap:6 }}>
                  <button style={{ ...S.btn('#dc2626'), flex:1 }} onClick={deleteSelected}>🗑 Elimina ({selectedFiles.length})</button>
                  <button style={{ ...S.btn('#10b981'), flex:1 }} onClick={openPRPreview} disabled={!githubValid}>🚀 PR ({selectedFiles.length})</button>
                </div>
              )}
              {selectedFiles.length > 0 && <button style={{ ...S.btn('#10b981'), marginTop:4 }} onClick={openPRPreview} disabled={!githubValid}>🚀 Crea PR ({selectedFiles.length})</button>}
            </>
          )}
        </div>
        <Link to="/history" style={{ color:'#94a3b8', fontSize:'0.82rem', textDecoration:'none', paddingTop:8, borderTop:'1px solid #334155' }}>📜 Storico PR</Link>
      </div>

      {activePage === 'users' && userRole === 'admin' && (
        <div style={S.main}><UserManagementBoundary><UserManagement /></UserManagementBoundary></div>
      )}

      {activePage === 'main' && <div style={S.main}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
          <h2 style={{ margin:0 }}>Dettagli File ({sortedFiles.length})</h2>
          <button style={S.btn('#f1f5f9','#374151')} onClick={loadFiles}>🔄 Aggiorna</button>
        </div>
        {sortedFiles.length === 0 ? (
          <div style={{ textAlign:'center', marginTop:80, color:'#94a3b8' }}>
            <div style={{ fontSize:'4rem' }}>📂</div>
            <h3>Seleziona dei file dalla sidebar</h3>
            <p>Carica file XML e selezionali per vedere i dettagli</p>
          </div>
        ) : (
          <>
            <div style={S.card}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.85rem' }}>
                <thead>
                  <tr>
                    <th style={{ ...S.th, width:36 }}></th>
                    <th style={S.th} onClick={() => handleSort('filename')}>Nome File {sortConfig.key==='filename'&&(sortConfig.direction==='asc'?'↑':'↓')}</th>
                    <th style={S.th} onClick={() => handleSort('organizationName')}>Organizzazione {sortConfig.key==='organizationName'&&(sortConfig.direction==='asc'?'↑':'↓')}</th>
                    <th style={S.th}>Entity ID</th>
                    <th style={S.th} onClick={() => handleSort('creationDate')}>Data {sortConfig.key==='creationDate'&&(sortConfig.direction==='asc'?'↑':'↓')}</th>
                    <th style={S.th}>Validazione</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedFiles.map(file => {
                    const safeExpandedRows = Array.isArray(expandedRows)?expandedRows:[];
                    const safeValidating = ensureSet(validating);
                    const safeCertificateLoading = ensureSet(certificateLoading);
                    const isExpanded = safeExpandedRows.includes(file.filename);
                    const isValidating = safeValidating.has(file.filename);
                    const registry = file.entityID ? registryCache[file.entityID] : null;

                    // DOPO
                    const certCacheKey = file.filename && file.entityID
                      ? `${file.filename}::${file.entityID}`
                      : file.entityID
                    const certInfo    = certCacheKey ? certificateCache[certCacheKey] : null
                    const certLoading = file.entityID ? safeCertificateLoading.has(file.entityID) : false
                    const validationErrors   = Array.isArray(file?.validation?.errors)   ? file.validation.errors   : [];
                    const validationWarnings = Array.isArray(file?.validation?.warnings) ? file.validation.warnings : [];
                    const certErrors = Array.isArray(certInfo?.errors) ? certInfo.errors : [];
                    return (
                      <React.Fragment key={file.filename}>
                        <tr onClick={() => toggleRowExpansion(file.filename)} style={{ cursor:'pointer', background: isExpanded?'#f0f9ff':'#fff' }}>
                          <td style={{ ...S.td, textAlign:'center', fontWeight:700, color:'#3b82f6' }}>{isExpanded?'−':'+'}</td>
                          <td style={S.td}><code style={{ fontSize:'0.8rem' }}>{file.filename}</code></td>
                          <td style={S.td}>{file.organizationName||<span style={{ color:'#9ca3af' }}>N/A</span>}</td>
                          <td style={S.td}><span style={{ fontSize:'0.76rem', color:'#6b7280' }}>{file.entityID?`${file.entityID.substring(0,45)}…`:<span style={{ color:'#9ca3af' }}>N/A</span>}</span></td>
                          <td style={S.td}>{file.creationDate?new Date(file.creationDate).toLocaleDateString('it-IT'):'N/A'}</td>
                          <td style={S.td}>{isValidating?<span style={{ fontSize:'0.8rem', color:'#94a3b8' }}>⟳ validazione...</span>:<ValidationBadge validation={file.validation} />}</td>
                        </tr>
                        {isExpanded && (
                          <tr>
                            <td colSpan="6" style={{ background:'#f8fafc', padding:'16px 20px' }}>
                              {file.entityID && registry?.exists && (<div style={{ marginBottom:12, padding:'10px 14px', borderRadius:6, background:'#ecfdf3', borderLeft:'4px solid #16a34a', color:'#166534', fontSize:'0.85rem', display:'flex', alignItems:'center', gap:12 }}><span>✅ EntityID presente nel registro SPID</span>{registry.registry_link&&<a href={registry.registry_link} target="_blank" rel="noopener noreferrer" onClick={e=>e.stopPropagation()} style={{ color:'#15803d', fontWeight:600, textDecoration:'none' }}>🔗 Scheda registro</a>}</div>)}
                              {file.entityID && registry && !registry.exists && (<div style={{ marginBottom:12, padding:'10px 14px', borderRadius:6, background:'#fef2f2', borderLeft:'4px solid #dc2626', color:'#991b1b', fontSize:'0.85rem' }}>❌ EntityID non trovato nel registro SPID</div>)}
                              {file.entityID && !registry && (<div style={{ marginBottom:12, padding:'10px 14px', borderRadius:6, background:'#f1f5f9', borderLeft:'4px solid #94a3b8', color:'#64748b', fontSize:'0.85rem' }}>⟳ Verifica registro SPID in corso…</div>)}
                              <table style={{ width:'100%', fontSize:'0.85rem', borderCollapse:'collapse', marginBottom:12 }}>
                                <tbody>
                                  {[['Nome file', !registry?.exists?<button onClick={e=>{e.stopPropagation();handleViewXml(file.filename);}} style={{ background:'none', border:'none', color:'#2563eb', cursor:'pointer', textDecoration:'underline', padding:0, fontSize:'0.85rem' }}>{file.filename}</button>:file.filename],['EntityID',file.entityID||'N/D'],['Organizzazione',file.organizationName||'N/D'],['Data creazione',file.creationDate?new Date(registry?.createDate||file.creationDate).toLocaleString('it-IT'):'N/D'],['Data modifica',file.modificationDate?new Date(registry?.lastUpdateDate||file.modificationDate).toLocaleString('it-IT'):'N/D'],['Dimensione',file.size?`${(file.size/1024).toFixed(1)} KB`:'N/D']].map((row,i)=>(
                                    <tr key={`${file.filename}-detail-${i}`}>
                                      <th style={{ padding:'5px 16px 5px 0', fontWeight:600, color:'#374151', width:150, verticalAlign:'top' }}>{Array.isArray(row)?row[0]:'N/D'}</th>
                                      <td style={{ padding:'5px 0', color:'#1e293b' }}>{Array.isArray(row)?row[1]:'N/D'}</td>
                                    </tr>
                                  ))}
                                  <tr>
                                    <th style={{ padding:'5px 16px 5px 0', fontWeight:600, color:'#374151', width:150, verticalAlign:'top' }}>Certificato di sigillo</th>
                                    <td style={{ padding:'5px 0', color:'#1e293b' }}>
                                      {certLoading&&<span>Verifica certificato in corso...</span>}
                                      {!certLoading&&certInfo?.certificate&&(<details style={{ border:'1px solid #d1d5db', borderRadius:'6px', padding:'8px', marginTop:'4px' }}><summary style={{ cursor:'pointer', fontWeight:600, listStyle:'none' }}>{certInfo.valid?'✅ Certificato valido':'❌ Certificato non valido'}</summary><div style={{ marginTop:'8px', paddingLeft:'12px', fontSize:'0.82rem' }}><div><strong>Not Before:</strong> {certInfo.certificate.notBefore||'N/D'}</div><div><strong>Not After:</strong> {certInfo.certificate.notAfter||'N/D'}</div><div><strong>Subject:</strong> {certInfo.certificate.subject||'N/D'}</div><div><strong>Issuer:</strong> {certInfo.certificate.issuer||'N/D'}</div>{certErrors.length>0&&<div style={{ marginTop:'6px', color:'#991b1b' }}><strong>Errori:</strong><ul style={{ margin:'2px 0', paddingLeft:'16px' }}>{certErrors.map((e,i)=><li key={i}>{typeof e==='string'?e:JSON.stringify(e)}</li>)}</ul></div>}</div></details>)}
                                      {!certLoading&&certInfo?.error&&<span style={{ color:'#991b1b' }}>{certInfo.error}</span>}
                                      {!certLoading&&!certInfo&&<span>N/D</span>}
                                    </td>
                                  </tr>
                                </tbody>
                              </table>
                              {isValidating&&<div style={{ padding:10, borderRadius:6, background:'#f1f5f9', color:'#64748b', fontSize:'0.85rem' }}>⟳ Validazione in corso…</div>}
                              {!isValidating&&file.validation&&(<>
                                {validationErrors.length>0&&(<div style={{ marginBottom:8, padding:12, borderRadius:6, background:'#fef2f2', borderLeft:'4px solid #dc2626' }}><strong style={{ color:'#991b1b', display:'block', marginBottom:6 }}>❌ Errori di validazione ({validationErrors.length})</strong><ul style={{ margin:0, paddingLeft:20 }}>{validationErrors.map((e,i)=><li key={i} style={{ fontSize:'0.82rem', color:'#991b1b', marginBottom:3 }}>{e.source === 'certificate' ? '🔐 ' : ''}{typeof e==='object'?`[${e.testId||e.test_id||e.testid||'N/D'}] ${e.message||JSON.stringify(e)}`:e}</li>)}</ul></div>)}
                                {validationWarnings.length>0&&(<div style={{ marginBottom:8, padding:12, borderRadius:6, background:'#fffbeb', borderLeft:'4px solid #d97706' }}><strong style={{ color:'#92400e', display:'block', marginBottom:6 }}>⚠️ Warning ({validationWarnings.length})</strong><ul style={{ margin:0, paddingLeft:20 }}>{validationWarnings.map((w,i)=><li key={i} style={{ fontSize:'0.82rem', color:'#92400e', marginBottom:3 }}>{typeof w==='object'?`[${w.testId||w.test_id||w.testid||'N/D'}] ${w.message||JSON.stringify(w)}`:w}</li>)}</ul></div>)}
                                {validationErrors.length===0&&validationWarnings.length===0&&(<div style={{ padding:10, borderRadius:6, background:'#ecfdf3', borderLeft:'4px solid #16a34a', color:'#166534', fontSize:'0.85rem' }}>✅ Nessun errore o warning di validazione.</div>)}
                              </>)}
                              {!isValidating&&!file.validation&&<div style={{ padding:10, borderRadius:6, background:'#f1f5f9', color:'#94a3b8', fontSize:'0.85rem' }}>Validazione non ancora disponibile.</div>}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {totalPages>1&&(<div style={{ display:'flex', gap:12, alignItems:'center', justifyContent:'center', marginTop:8 }}>
              <button style={S.btn('#f1f5f9','#374151')} onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={page===1}>← Prec.</button>
              <span style={{ color:'#6b7280', fontSize:'0.9rem' }}>Pag. {page} / {totalPages}</span>
              <button style={S.btn('#f1f5f9','#374151')} onClick={()=>setPage(p=>Math.min(totalPages,p+1))} disabled={page===totalPages}>Succ. →</button>
              <select value={resultsPerPage} onChange={e=>{setResultsPerPage(Number(e.target.value));setPage(1);}} style={{ padding:'6px 10px', borderRadius:6, border:'1px solid #d1d5db', fontSize:'0.85rem' }}>
                {[10,20,50,100].map(n=><option key={n} value={n}>{n} / pag.</option>)}
              </select>
            </div>)}
          </>
        )}
      </div>}

      {xmlModalContent&&(<div onClick={()=>setXmlModalContent(null)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }}><div onClick={e=>e.stopPropagation()} style={{ background:'#fff', borderRadius:10, padding:24, width:'80vw', maxHeight:'80vh', overflowY:'auto', boxShadow:'0 8px 32px rgba(0,0,0,.2)' }}><div style={{ display:'flex', justifyContent:'space-between', marginBottom:12 }}><strong>{xmlModalContent.filename}</strong><button onClick={()=>setXmlModalContent(null)} style={{ background:'none', border:'none', fontSize:'1.2rem', cursor:'pointer' }}>✕</button></div><pre style={{ background:'#f8fafc', borderRadius:6, padding:16, fontSize:'0.76rem', overflowX:'auto', whiteSpace:'pre-wrap', wordBreak:'break-all', margin:0 }}>{xmlModalContent.content}</pre></div></div>)}
      {prPreview&&(<PRPreviewModal preview={prPreview} onConfirm={confirmCreatePR} onCancel={()=>setPrPreview(null)} loading={prInProgress} />)}
      {prInProgress&&(<div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:2000, display:'flex', alignItems:'center', justifyContent:'center' }}><ProgressTracker steps={prSteps} currentStep={prStep} /></div>)}
    </div>
  );
}

// ─── PR HISTORY PAGE ─────────────────────────────────────
function PRHistoryPage() {
  const [pullRequests, setPullRequests] = useState([]);
  const [expandedPRs, setExpandedPRs]   = useState([]);
  const [syncing, setSyncing]           = useState(false);
  const [filters, setFilters]           = useState({ search:'', dateFrom:'', dateTo:'' });
  const prRef = useRef([]);
  useEffect(() => { prRef.current = pullRequests; }, [pullRequests]);

  const syncStatuses = React.useCallback(async (source) => {
    const list = source ?? prRef.current;
    if (!list?.length) return;
    setSyncing(true);
    try {
      const updated = list.map(pr => ({ ...pr }));
      let changed = false;
      for (let i = 0; i < updated.length; i++) {
        const pr = updated[i];
        if (!pr.number) continue;
        try {
          const res = await fetch(API.prStatus(pr.number), { headers: { Authorization: `Bearer ${localStorage.getItem(TOKEN_KEY)}` } });
          if (!res.ok) continue;
          const data = await res.json();
          let newStatus = data.state;
          if (data.merged) newStatus = 'merged';
          if (newStatus && newStatus !== pr.status) { updated[i] = { ...pr, status: newStatus }; changed = true; }
        } catch {}
      }
      if (changed) { setPullRequests(updated); localStorage.setItem(LS_KEY, JSON.stringify(updated)); notify.success('Stato PR aggiornato'); }
    } finally { setSyncing(false); }
  }, []);

  useEffect(() => {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return;
    let loaded = [];
    try {
      const parsed = JSON.parse(raw);
      loaded = Array.isArray(parsed) ? parsed.map(pr => ({ ...pr, organizations:Array.isArray(pr.organizations)?pr.organizations:[], fileCount:typeof pr.fileCount==='number'?pr.fileCount:(pr.files?.length||0), createdAt:pr.createdAt||new Date().toISOString(), status:pr.status||'open' })) : [];
    } catch { loaded = []; }
    setPullRequests(loaded);
    if (loaded.length > 0) syncStatuses(loaded);
  }, []); // eslint-disable-line

  useEffect(() => {
    const id = setInterval(() => { if (prRef.current.length > 0) syncStatuses(); }, 30000);
    return () => clearInterval(id);
  }, []); // eslint-disable-line

  const togglePR = (id) => setExpandedPRs(prev => prev.includes(id) ? prev.filter(x=>x!==id) : [...prev, id]);
  const filteredPRs = pullRequests.filter(pr => {
    const d = new Date(pr.createdAt||new Date());
    return (!filters.search||(pr.organizations||[]).some(o=>o.toLowerCase().includes(filters.search.toLowerCase()))||(pr.branch||'').toLowerCase().includes(filters.search.toLowerCase())) && (!filters.dateFrom||d>=new Date(filters.dateFrom)) && (!filters.dateTo||d<=new Date(filters.dateTo));
  });
  const statusBadge = (s) => ({ open:{bg:'#dcfce7',color:'#166534',label:'🟢 Aperta'}, merged:{bg:'#ede9fe',color:'#5b21b6',label:'🟣 Merged'}, closed:{bg:'#fee2e2',color:'#991b1b',label:'🔴 Chiusa'} }[s]||{bg:'#f1f5f9',color:'#374151',label:s});
  const S2 = { page:{minHeight:'100vh',background:'#f8fafc',fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',padding:24}, card:{background:'#fff',borderRadius:10,padding:24,boxShadow:'0 1px 4px rgba(0,0,0,.08)'}, th:{padding:'10px 16px',background:'#f1f5f9',textAlign:'left',borderBottom:'2px solid #e2e8f0',fontSize:'0.85rem',fontWeight:600}, td:{padding:'10px 16px',borderBottom:'1px solid #f1f5f9',fontSize:'0.85rem'}, btn:(bg='#3b82f6',c='#fff')=>({background:bg,color:c,border:'none',borderRadius:6,padding:'8px 14px',cursor:'pointer',fontWeight:600,fontSize:'0.82rem'}) };

  return (
    <div style={S2.page}>
      <div style={{ maxWidth:1100, margin:'0 auto' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:24 }}>
          <h2 style={{ margin:0 }}>📜 Storico Pull Request</h2>
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            {syncing&&<span style={{ fontSize:'0.85rem', color:'#6b7280' }}>🔄 Sincronizzazione…</span>}
            <button style={S2.btn('#f1f5f9','#374151')} onClick={() => syncStatuses()} disabled={syncing}>🔄 Aggiorna stati</button>
            <Link to="/" style={{ ...S2.btn('#f1f5f9','#374151'), textDecoration:'none', display:'inline-block' }}>← Home</Link>
          </div>
        </div>
        <div style={{ ...S2.card, marginBottom:16, display:'flex', gap:16, flexWrap:'wrap' }}>
          {[['Cerca','text','Organizzazione, branch…','search'],['Da Data','date','','dateFrom'],['A Data','date','','dateTo']].map(([label,type,ph,key])=>(
            <label key={key} style={{ display:'flex', flexDirection:'column', gap:4, fontSize:'0.85rem', fontWeight:600 }}>
              {label}<input type={type} placeholder={ph} value={filters[key]} onChange={e=>setFilters(prev=>({...prev,[key]:e.target.value}))} style={{ padding:'8px 10px', border:'1px solid #d1d5db', borderRadius:6, fontSize:'0.9rem' }} />
            </label>
          ))}
        </div>
        {filteredPRs.length===0?(<div style={{ ...S2.card, textAlign:'center', padding:60, color:'#94a3b8' }}><div style={{ fontSize:'3rem' }}>📭</div><h3>Nessuna Pull Request</h3><p>Le PR create appariranno qui</p></div>):(
          <div style={S2.card}>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead><tr>{['','PR #','Branch','Organizzazioni','File','Data','Stato'].map(h=><th key={h} style={S2.th}>{h}</th>)}</tr></thead>
              <tbody>
                {filteredPRs.map(pr=>{
                  const badge=statusBadge(pr.status);
                  return (
                    <React.Fragment key={pr.id||pr.number}>
                      <tr style={{ background:'#fff' }}>
                        <td style={{ ...S2.td, textAlign:'center', cursor:'pointer', color:'#3b82f6', fontWeight:700 }} onClick={()=>togglePR(pr.id)}>{expandedPRs.includes(pr.id)?'−':'+'}</td>
                        <td style={S2.td}><a href={pr.url} target="_blank" rel="noopener noreferrer" style={{ color:'#3b82f6' }}>#{pr.number}</a></td>
                        <td style={S2.td}><code style={{ fontSize:'0.82rem' }}>{pr.branch||'-'}</code></td>
                        <td style={S2.td}>{(pr.organizations||[]).length} enti</td>
                        <td style={S2.td}>{pr.fileCount||0}</td>
                        <td style={S2.td}>{new Date(pr.createdAt||new Date()).toLocaleDateString('it-IT')}</td>
                        <td style={S2.td}><span style={{ background:badge.bg, color:badge.color, padding:'3px 10px', borderRadius:12, fontSize:'0.8rem', fontWeight:600 }}>{badge.label}</span></td>
                      </tr>
                      {expandedPRs.includes(pr.id)&&(<tr><td colSpan="7" style={{ background:'#f8fafc', padding:20 }}><strong>Organizzazioni ({(pr.organizations||[]).length}):</strong><ul style={{ columns:2, listStyle:'none', padding:'8px 0 0', margin:0 }}>{(pr.organizations||[]).map((o,i)=><li key={i} style={{ padding:'3px 0', fontSize:'0.85rem' }}>• {o}</li>)}{(pr.organizations||[]).length===0&&<li style={{ color:'#9ca3af', fontSize:'0.85rem' }}>Nessuna organizzazione salvata</li>}</ul><div style={{ marginTop:12 }}><strong>Link:</strong>{' '}<a href={pr.url} target="_blank" rel="noopener noreferrer" style={{ color:'#3b82f6' }}>{pr.url}</a></div></td></tr>)}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
