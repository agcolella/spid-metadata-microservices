import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import { LoginView } from './views/LoginView';
import MainView from './views/MainView';
import PRHistoryView  from './views/PRHistoryView';
import { ForceChangePasswordModal } from './components/ForceChangePasswordModal';
//import { TOKEN_KEY } from './constants';

export default function App() {
  const { token, login, logout, mustChangePassword, passwordChanged } = useAuth();

  if (!token) return <LoginView onLogin={login} />;

  return (
    <>
      {mustChangePassword && (
        <ForceChangePasswordModal onSuccess={passwordChanged} />
      )}
      <Router>
        <div style={{ position: 'fixed', top: 12, right: 16,
          zIndex: mustChangePassword ? 0 : 9999 }}>
          <button onClick={logout}
            style={{ background: 'none', border: '1px solid #d1d5db', borderRadius: 6,
              padding: '4px 12px', cursor: 'pointer', fontSize: '0.85rem', color: '#6b7280' }}>
            Esci
          </button>
        </div>
        <Routes>
          <Route path="/"        element={<MainView />} />
          <Route path="/history" element={<PRHistoryView />} />
        </Routes>
      </Router>
    </>
  );
}
