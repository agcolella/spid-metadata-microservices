import React from 'react';

export function ProgressTracker({ steps, currentStep }) {
  return (
    <div style={{ background:'#fff', borderRadius:12, padding:32, boxShadow:'0 8px 32px rgba(0,0,0,.2)', minWidth:400, textAlign:'center' }}>
      <div style={{ display:'flex', justifyContent:'center', gap:8, marginBottom:16 }}>
        {steps.map((step, idx) => (
          <div key={idx} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
            <div style={{
              width:36, height:36, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center',
              fontWeight:700, fontSize:'0.9rem',
              background: idx < currentStep ? '#10b981' : idx === currentStep ? '#3b82f6' : '#e5e7eb',
              color: idx <= currentStep ? '#fff' : '#6b7280'
            }}>
              {idx < currentStep ? '✓' : idx === currentStep ? '⟳' : idx + 1}
            </div>
            <span style={{ fontSize:'0.7rem', color:'#6b7280', maxWidth:70, textAlign:'center' }}>{step}</span>
          </div>
        ))}
      </div>
      <p style={{ margin:0, color:'#374151' }}>
        {currentStep < steps.length ? <>In corso: <strong>{steps[currentStep]}</strong></> : <strong>Completato!</strong>}
      </p>
    </div>
  );
}
