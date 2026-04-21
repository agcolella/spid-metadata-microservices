import { useEffect } from 'react';

export default function SpidCallbackView({ onLogin }) {
  useEffect(() => {
    const token = new URLSearchParams(window.location.hash.slice(1)).get('token');

    if (token) {
      window.location.hash = '';
      onLogin(token, null, false);
    } else {
      window.location.href = '/login?error=spid_callback';
    }
  }, [onLogin]);   // ← aggiunto onLogin

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', background: '#f8fafc' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '2rem', marginBottom: 16 }}>⏳</div>
        <p style={{ color: '#6b7280' }}>Accesso SPID in corso...</p>
      </div>
    </div>
  );
}
