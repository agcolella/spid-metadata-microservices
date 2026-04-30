// frontend/src/App.jsx
import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import { LoginView } from './views/LoginView';
import MainView from './views/MainView';
import PRHistoryView from './views/PRHistoryView';
import SpidCallbackView from './views/SpidCallbackView';
import { ForceChangePasswordModal } from './components/ForceChangePasswordModal';

export default function App() {
  const { token, login, logout, mustChangePassword, passwordChanged } = useAuth();

  return (
    <Router>
      <AppRoutes
        token={token}
        login={login}
        logout={logout}
        mustChangePassword={mustChangePassword}
        passwordChanged={passwordChanged}
      />
    </Router>
  );
}

function AppRoutes({ token, login, logout, mustChangePassword, passwordChanged }) {
  // /auth/callback — accessibile sempre, prima di qualsiasi check auth.
  // Sia React Router che il check diretto sul pathname per sicurezza.
  if (window.location.pathname === '/auth/callback') {
    return <SpidCallbackView onLogin={login} />;
  }

  // Non autenticato → pagina di login
  if (!token) {
    return <LoginView onLogin={login} />;
  }

  // Autenticato: mostra modal cambio password obbligatorio se necessario
  return (
    <>
      {mustChangePassword && (
        <ForceChangePasswordModal onSuccess={passwordChanged} />
      )}

      {/* Bottone Esci — nascosto sotto il modal cambio password */}
      <div style={{
        position: 'fixed', top: 12, right: 16,
        zIndex: mustChangePassword ? 0 : 9999
      }}>
        <button
          onClick={logout}
          style={{
            background: 'none', border: '1px solid #d1d5db',
            borderRadius: 6, padding: '4px 12px',
            cursor: 'pointer', fontSize: '0.85rem', color: '#6b7280'
          }}
        >
          Esci
        </button>
      </div>

      <Routes>
        <Route path="/"        element={<MainView />} />
        <Route path="/history" element={<PRHistoryView />} />
      </Routes>
    </>
  );
}
