import React from 'react';

export function ValidationBadge({ validation, compact = false }) {
  if (!validation) return null;

  const errCount  = validation.errors?.length  || 0;
  const warnCount = validation.warnings?.length || 0;
  const hasErrors   = errCount  > 0;
  const hasWarnings = warnCount > 0;

  if (compact) {
    // Versione compatta per la sidebar
    if (!hasErrors && !hasWarnings)
      return <span style={{ fontSize:'0.7rem', background:'#d1fae5', color:'#065f46', padding:'1px 6px', borderRadius:10, fontWeight:700 }}>✓</span>;
    return (
      <span style={{ display:'flex', gap:3 }}>
        {hasErrors && (
          <span style={{ fontSize:'0.7rem', background:'#fee2e2', color:'#991b1b', padding:'1px 6px', borderRadius:10, fontWeight:700 }}>
            ✕{errCount}
          </span>
        )}
        {hasWarnings && (
          <span style={{ fontSize:'0.7rem', background:'#fef3c7', color:'#92400e', padding:'1px 6px', borderRadius:10, fontWeight:700 }}>
            ⚠{warnCount}
          </span>
        )}
      </span>
    );
  }

  // Versione estesa per la tabella principale
  if (!hasErrors && !hasWarnings)
    return <span style={{ display:'inline-block', padding:'2px 8px', borderRadius:12, fontSize:'0.75rem', fontWeight:600, background:'#d1fae5', color:'#065f46' }}>✓ Valido</span>;
  return (
    <span style={{ display:'inline-flex', gap:4 }}>
      {hasErrors && (
        <span style={{ padding:'2px 8px', borderRadius:12, fontSize:'0.75rem', fontWeight:600, background:'#fee2e2', color:'#991b1b' }}>
          ✕ {errCount} err.
        </span>
      )}
      {hasWarnings && (
        <span style={{ padding:'2px 8px', borderRadius:12, fontSize:'0.75rem', fontWeight:600, background:'#fef3c7', color:'#92400e' }}>
          ⚠ {warnCount} warn.
        </span>
      )}
    </span>
  );
}
