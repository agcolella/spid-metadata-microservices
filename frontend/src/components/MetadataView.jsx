/**
 * MetadataView — adattato da AgID/spid-onboarding view.js
 * Template JSX con Bootstrap 5 (in sostituzione di Bootstrap Italia).
 */
import React from 'react';
import Utility from '../utils/utility';

// Icone di stato validazione (sostituiscono le img check-*.png originali)
function ValidationIcon({ status, label }) {
  if (status === 0) return <span className="spinner-border spinner-border-sm text-secondary" title={`${label}: in corso`} aria-label={`${label}: in corso`} />;
  if (status === 1) return <span className="badge bg-success" title={`${label}: OK`} aria-label={`${label}: OK`}>✓ OK</span>;
  if (status === -1) return <span className="badge bg-danger" title={`${label}: non superata`} aria-label={`${label}: non superata`}>✗ KO</span>;
  if (status === -2) return <span className="badge bg-warning text-dark" title={`${label}: errore connessione`} aria-label={`${label}: errore connessione`}>⚠ N/D</span>;
  return <span className="badge bg-secondary">—</span>;
}

function MetadataView({ state, onSetURL, onAddMetadata, onUpload, onResetAndDownload, onGotoValidator, onOpenMetadata, onDeleteModal, onCloseModal }) {
  const { metadata_list, url, loading, loaded, fileName, fileSize, progress, blockUI, modal } = state;

  return (
    <div>
      {/* Overlay blocco UI */}
      {blockUI && (
        <div
          style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(255,255,255,0.7)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          aria-busy="true"
          aria-label="Operazione in corso"
        >
          <div className="spinner-border text-primary" role="status" style={{ width: '3rem', height: '3rem' }}>
            <span className="visually-hidden">Caricamento...</span>
          </div>
        </div>
      )}

      {/* Modal */}
      {modal && modal.isOpen && (
        <div className="modal show d-block" tabIndex="-1" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title" id="modalTitle">{modal.title}</h5>
                <button type="button" className="btn-close" onClick={onCloseModal} aria-label="Chiudi" />
              </div>
              <div className="modal-body" dangerouslySetInnerHTML={{ __html: modal.body }} />
              <div className="modal-footer">
                {modal.onConfirm && (
                  <button type="button" className="btn btn-danger"
                    onClick={() => { modal.onConfirm(); onCloseModal(); }}>
                    Elimina
                  </button>
                )}
                <button type="button" className="btn btn-secondary" onClick={onCloseModal}>Chiudi</button>
              </div>
            </div>
          </div>
        </div>
      )}
      {modal && modal.isOpen && <div className="modal-backdrop show" />}

      {/* Intestazione */}
      <header className="mb-4">
        <h1 className="h3">Gestione Metadata Test</h1>
        <hr />
      </header>

      <main>
        <div className="row g-4 mb-4">
          {/* Sezione 1: Download da URL */}
          <div className="col-lg-6">
            <div className="card h-100">
              <div className="card-body">
                <h6 className="card-title">Scarica metadata da URL</h6>
                <div className="input-group">
                  <label htmlFor="input-metadata-url" className="visually-hidden">URL del metadata</label>
                  <input
                    type="url"
                    className="form-control"
                    id="input-metadata-url"
                    placeholder="https://esempio.it/metadata.xml"
                    value={url}
                    onChange={(e) => onSetURL(e.target.value)}
                    aria-label="URL del metadata"
                  />
                  <button
                    className="btn btn-primary"
                    type="button"
                    onClick={onAddMetadata}
                    aria-label="Scarica metadata"
                    title="Scarica metadata dall'URL"
                  >
                    ⬇ Scarica
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Sezione 2: Upload ZIP */}
          <div className="col-lg-6">
            <div className="card h-100">
              <div className="card-body">
                <h6 className="card-title">Carica archivio ZIP con file XML</h6>
                {(!loading && !loaded) && (
                  <div>
                    <input
                      type="file"
                      name="document"
                      id="input-metadata-upload"
                      className="form-control"
                      accept=".zip"
                      onChange={(e) => { if (e.target.files[0]) onUpload(e.target.files[0]); }}
                      aria-label="Carica archivio ZIP"
                    />
                    <label htmlFor="input-metadata-upload" className="form-label mt-2 text-muted small">
                      Seleziona un archivio .zip contenente i file XML dei metadata
                    </label>
                  </div>
                )}
                {(loading || loaded) && (
                  <div>
                    <p className="mb-1">
                      <strong>{fileName}</strong>
                      {fileSize && <span className="text-muted ms-2">{Utility.formatFileSize(fileSize)}</span>}
                    </p>
                    {loading && (
                      <div className="progress" role="progressbar" aria-valuenow={progress} aria-valuemin="0" aria-valuemax="100" aria-label="Progresso upload">
                        <div
                          className="progress-bar progress-bar-striped progress-bar-animated"
                          style={{ width: `${progress}%` }}
                        >
                          {Math.round(progress)}%
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Tabella metadata */}
        <div className="table-responsive">
          <table className="table table-bordered table-hover align-middle">
            <caption>Lista dei metadata registrati</caption>
            <thead className="table-light">
              <tr>
                <th scope="col">Informazioni Metadata</th>
                <th scope="col" className="text-center">Validazioni</th>
                <th scope="col" className="text-center">Azioni</th>
              </tr>
            </thead>
            <tbody>
              {Object.keys(metadata_list).length === 0 && (
                <tr>
                  <td colSpan="3" className="text-center text-muted py-4">
                    Nessun metadata caricato. Aggiungi un metadata tramite URL o carica un archivio ZIP.
                  </td>
                </tr>
              )}
              {Object.keys(metadata_list).map((entity_id) => {
                const md = metadata_list[entity_id];
                return (
                  <tr key={entity_id}>
                    {/* Informazioni */}
                    <td>
                      <dl className="mb-0 small">
                        <dt className="d-inline text-muted">Ente: </dt>
                        <dd className="d-inline">{md.organization_description || '—'}</dd>
                        <br />
                        <dt className="d-inline text-muted">EntityID: </dt>
                        <dd className="d-inline"><code>{md.entity_id}</code></dd>
                        <br />
                        <dt className="d-inline text-muted">Tipo: </dt>
                        <dd className="d-inline">
                          {md.type === 'SP' && 'Service Provider'}
                          {md.type === 'AG' && 'Aggregato'}
                          {!md.type && '—'}
                        </dd>
                      </dl>
                    </td>

                    {/* Validazioni */}
                    <td className="text-center">
                      <table className="table table-sm table-borderless mb-0 small">
                        <tbody>
                          <tr>
                            <td className="text-end text-muted pe-2">Metadata:</td>
                            <td><ValidationIcon status={md.check_extra} label="Validazione Extra" /></td>
                          </tr>
                          <tr>
                            <td className="text-end text-muted pe-2">Request:</td>
                            <td>
                              {(md.validation && md.validation.request_extra)
                                ? <span className="badge bg-success" title="Request Extra: OK">✓ OK</span>
                                : <span className="badge bg-danger" title="Request Extra: non superata">✗ KO</span>
                              }
                            </td>
                          </tr>
                          <tr>
                            <td className="text-end text-muted pe-2">Response:</td>
                            <td>
                              {md.validation && (
                                <span className="me-1 text-muted">
                                  {md.validation.response_done}/{md.validation.response_num}
                                </span>
                              )}
                              {(md.validation && md.validation.response_validation)
                                ? <span className="badge bg-success" title="Response: OK">✓ OK</span>
                                : <span className="badge bg-danger" title="Response: non superata">✗ KO</span>
                              }
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </td>

                    {/* Azioni */}
                    <td className="text-center">
                      <div className="btn-group" role="group" aria-label="Azioni metadata">
                        <button
                          className="btn btn-sm btn-outline-primary"
                          title="Riesegui validazione metadata"
                          aria-label="Riesegui validazione"
                          onClick={() => onResetAndDownload(md)}
                        >
                          🔄
                        </button>
                        <button
                          className="btn btn-sm btn-outline-primary"
                          title="Accedi al Validator SPID"
                          aria-label="Apri Validator"
                          onClick={() => onGotoValidator(md.entity_id)}
                        >
                          🔗
                        </button>
                        <button
                          className="btn btn-sm btn-outline-secondary"
                          title="Visualizza/Scarica XML"
                          aria-label="Scarica XML"
                          onClick={() => onOpenMetadata(md)}
                        >
                          📄
                        </button>
                        <button
                          className="btn btn-sm btn-danger"
                          title="Elimina metadata"
                          aria-label="Elimina"
                          onClick={() => onDeleteModal(md)}
                        >
                          🗑
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}

export default MetadataView;
