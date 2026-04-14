import React from 'react';

export function ModalOverlay({ children, onClose }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)',
        zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 10, padding: 28, width: 420,
          maxWidth: '95vw', boxShadow: '0 8px 32px rgba(0,0,0,.18)',
        }}
      >
        {children}
      </div>
    </div>
  );
}
