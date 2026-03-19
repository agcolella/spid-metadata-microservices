import React from 'react';
import Utility from '../utils/utility';

function MetadataView({ state, onUpload, onOpenMetadata, onDeleteModal, onCloseModal, onRefresh }) {
  const { metadata_list, loading, fileName, fileSize, progress, blockUI, modal } = state;

  return (
    <div>

      {/* Overlay blocco UI */}
      {blockUI && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
          background: 'rgba(255,255,255,0.75)', zIndex: 9999,
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <div className="spinner-border text-primary" style={{ width: '3rem', height: '3rem' }} role="status">
            <span className="visually-hidden">Caricamento...</span>
          </div>
        </div>
      )}

      {/* Modal */}
      {modal?.isOpen && (
        <>
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
                    <button className="btn btn-danger" onClick={() => { modal.onConfirm(); onCloseModal(); }}>
                      Elimina
                    </button>
                  )}
                  <button className="btn btn-secondary" onClick={onCloseModal}>Chiudi</button>
                </div>
              </div>
            </div>
          </div>
          <div className="modal-backdrop show" />
        </>
      )}

      {/* Intestazione */}
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h1 className="h3 mb-0">Gestione Metadata XML</h1>
        <button className="btn btn-outline-primary btn-sm" onClick={onRefresh} title="Ricarica lista">
          🔄 Aggiorna
        </button>
      </div>

      {/* Upload */}
      <div className="card mb-4">
        <div className="card-body">
          <h6 className="card-title">Carica file XML</h6>
          {!loading ? (
            <>
              <input
                type="file"
                id="input-upload"
                className="form-control"
                accept=".xml,.zip"
                onChange={(e) => { if (e.target.files[0]) onUpload(e.target.files[0]); e.target.value = ''; }}
                aria-label="Carica file XML o ZIP"
              />
              <div className="form-text">Formati accettati: .xml, .zip</div>
            </>
          ) : (
            <div>
              <p className="mb-1">
                <strong>{fileName}</strong>
                {fileSize > 0 && <span className="text-muted ms-2">{Utility.formatFileSize(fileSize)}</span>}
              </p>
              <div className="progress" role="progressbar" aria-valuenow={progress} aria-valuemin="0" aria-valuemax="100">
                <div
                  className="progress-bar progress-bar-striped progress-bar-animated"
                  style={{ width: `${progress}%` }}
                >
                  {progress}%
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Tabella file */}
      <div className="table-responsive">
        <table className="table table-bordered table-hover align-middle">
          <caption>File XML caricati: {Object.keys(metadata_list).length}</caption>
          <thead className="table-light">
            <tr>
              <th scope="col">File</th>
              <th scope="col" className="text-center">Dimensione</th>
              <th scope="col" className="text-center">Ultima modifica</th>
              <th scope="col" className="text-center">Azioni</th>
            </tr>
          </thead>
          <tbody>
            {Object.keys(metadata_list).length === 0 && (
              <tr>
                <td colSpan="4" className="text-center text-muted py-4">
                  Nessun file caricato. Usa il form sopra per caricare un file XML.
                </td>
              </tr>
            )}
            {Object.keys(metadata_list).map((key) => {
              const md = metadata_list[key];
              return (
                <tr key={key}>
                  <td>
                    <code>{md.entity_id}</code>
                  </td>
                  <td className="text-center text-muted small">
                    {Utility.formatFileSize(md.size)}
                  </td>
                  <td className="text-center text-muted small">
                    {md.modificationDate
                      ? new Date(md.modificationDate).toLocaleString('it-IT')
                      : '—'}
                  </td>
                  <td className="text-center">
                    <div className="btn-group" role="group" aria-label="Azioni">
                      <button
                        className="btn btn-sm btn-outline-secondary"
                        title="Scarica XML"
                        aria-label="Scarica XML"
                        onClick={() => onOpenMetadata(md)}
                      >
                        📄 Scarica
                      </button>
                      <button
                        className="btn btn-sm btn-danger"
                        title="Elimina file"
                        aria-label="Elimina"
                        onClick={() => onDeleteModal(md)}
                      >
                        🗑 Elimina
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

    </div>
  );
}

export default MetadataView;
