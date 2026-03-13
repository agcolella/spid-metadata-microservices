/**
 * MetadataList — adattato da AgID/spid-onboarding List.js
 * Logica originale: caricamento, download, upload, validazione, eliminazione metadata.
 * Adattato per usare le API del gateway /api/files e /api/validate.
 */
import React, { Component } from 'react';
import MetadataView from './MetadataView';
import apiClient from '../api/client';
import Utility from '../utils/utility';

class MetadataList extends Component {
  constructor(props) {
    super(props);
    this.state = {
      metadata_list: {},       // oggetto indicizzato per entity_id
      url: '',
      loading: false,
      loaded: false,
      fileName: '',
      fileSize: '',
      fileType: '',
      progress: 0,
      blockUI: false,
      modal: null,
    };
  }

  componentDidMount() {
    this.loadMetadataList(false);
    window.scrollTo(0, 0);
  }

  // ─── Blocco UI ────────────────────────────────────────────────
  setBlockUI(active) {
    this.setState({ blockUI: active });
  }

  showModal(opts) {
    this.setState({ modal: opts });
  }

  closeModal() {
    this.setState({ modal: null });
  }

  // ─── Caricamento lista metadata (adattato da loadMetadataList) ─
  loadMetadataList(recheck = false) {
    this.setBlockUI(true);
    apiClient.get('/api/files/metadata')
      .then((res) => {
        this.setBlockUI(false);
        const md = res.data;
        this.setState({ metadata_list: {} }, () => {
          for (let i in md) {
            apiClient.get(`/api/files/metadata?entity_id=${encodeURIComponent(md[i].entity_id)}`)
              .then((metaRes) => {
                const metadatatest = Object.assign({}, metaRes.data);
                apiClient.get(`/api/validate/metadata/validation?entity_id=${encodeURIComponent(metadatatest.entity_id)}`)
                  .then((valRes) => {
                    metadatatest.id = md[i].id;
                    metadatatest.status = md[i].status;
                    metadatatest.validation = valRes.data;
                    Utility.log('Validation:', metadatatest.entity_id, valRes.data);
                    const metadata_list = this.state.metadata_list;
                    metadata_list[metadatatest.entity_id] = metadatatest;
                    this.setState({ metadata_list }, () => {
                      if (recheck) {
                        this.checkMetadata(metadatatest.entity_id);
                      } else {
                        this.getLastCheckMetadata(metadatatest.entity_id);
                      }
                    });
                  })
                  .catch(() => {
                    Utility.log('Validation fetch failed for', metadatatest.entity_id);
                  });
              })
              .catch(() => {
                Utility.log('Metadata fetch failed for', md[i].entity_id);
              });
          }
        });
      })
      .catch(() => {
        this.setBlockUI(false);
        this.showModal({
          title: 'Errore',
          body: 'Si è verificato un errore durante il caricamento dei metadata.',
          isOpen: true,
        });
      });
  }

  setMetadataURL(url) {
    this.setState({ url });
  }

  // ─── Upload ZIP (adattato da upload) ──────────────────────────
  upload(metadata_zip) {
    this.setState({
      loading: true,
      loaded: false,
      fileName: metadata_zip.name,
      fileSize: metadata_zip.size,
      fileType: metadata_zip.type,
    });

    const formData = new FormData();
    formData.append('file', metadata_zip);

    apiClient.post('/api/files/zip', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (progressEvent) => {
        const progress = (progressEvent.loaded * 100) / progressEvent.total;
        this.setState({ progress });
      },
    })
      .then(() => {
        this.setState({ loading: false, loaded: false, progress: 0 });
        this.loadMetadataList(true);
      })
      .catch((err) => {
        const msg = err.response?.data || 'Errore durante l\'upload del file.';
        this.showModal({ title: 'Errore', body: msg, isOpen: true });
        this.setState({ loading: false, loaded: false });
      });
  }

  // ─── Download metadata da URL (adattato da downloadMetadata) ──
  downloadMetadata(url, callback_success, callback_error) {
    if (Utility.isValidURL(url)) {
      apiClient.get(`/api/files/download?url=${encodeURIComponent(url)}`)
        .then((res) => {
          const metadata = res.data;
          metadata.check_extra = 0;
          const metadata_list = this.state.metadata_list;
          metadata_list[metadata.entity_id] = metadata;
          this.setState({ url: '', metadata_list }, () => {
            this.checkMetadata(metadata.entity_id);
            if (callback_success) callback_success();
          });
        })
        .catch(() => {
          if (callback_error) callback_error();
        });
    } else {
      if (callback_error) callback_error();
      this.showModal({
        title: 'Attenzione',
        body: 'Inserire un indirizzo URL valido.',
        isOpen: true,
      });
    }
  }

  addMetadata() {
    this.setBlockUI(true);
    this.downloadMetadata(
      this.state.url,
      () => this.setBlockUI(false),
      () => {
        this.setBlockUI(false);
        this.showModal({
          title: 'Errore',
          body: 'Si è verificato un errore durante il download del metadata. Controllare l\'URL e riprovare.',
          isOpen: true,
        });
      }
    );
  }

  resetAndDownload(metadata) {
    this.resetMetadataTestResult(metadata.entity_id);
    this.downloadMetadata(metadata.url, () => {}, () => {
      this.checkMetadata(metadata.entity_id);
    });
  }

  // ─── Validazione metadata (adattato da checkMetadataForTest) ──
  checkMetadataForTest(entity_id, test) {
    this.setMetadataTestResult(entity_id, test, 0);
    apiClient.get(`/api/validate/check/${test}?entity_id=${encodeURIComponent(entity_id)}`)
      .then((res) => {
        const result = res.data;
        if (result && result.report) {
          let testNode;
          switch (test) {
            case 'extra': testNode = result.report.test?.sp?.metadata_extra?.SpidSpMetadataCheckExtra; break;
            default: testNode = null;
          }
          const success = this.checkTestResult(testNode);
          if (success === null) this.setMetadataTestResult(entity_id, test, 2);
          else if (success) this.setMetadataTestResult(entity_id, test, 1);
          else this.setMetadataTestResult(entity_id, test, -1);
        }
      })
      .catch(() => {
        this.setMetadataTestResult(entity_id, test, -2);
      });
  }

  checkMetadata(entity_id) {
    this.checkMetadataForTest(entity_id, 'extra');
  }

  // ─── Controllo risultato test (identico a List.js originale) ──
  checkTestResult(testGroups) {
    let result = null;
    for (let i in testGroups) {
      const testGroup = testGroups[i];
      if (testGroup.result != null) {
        if (result === null) result = testGroup.result === 'success';
        else result = result && testGroup.result === 'success';
      }
    }
    return result;
  }

  resetMetadataTestResult(entity_id) {
    const metadata_list = this.state.metadata_list;
    const metadata = metadata_list[entity_id];
    metadata.check_extra = 0;
    metadata_list[entity_id] = metadata;
    this.setState({ metadata_list });
  }

  setMetadataTestResult(entity_id, test, result) {
    const metadata_list = this.state.metadata_list;
    const metadata = metadata_list[entity_id];
    if (!metadata) return;
    metadata[`check_${test}`] = result;
    metadata_list[entity_id] = metadata;
    this.setState({ metadata_list });
  }

  // ─── Ultimo check (adattato da getLastCheckMetadataForTest) ───
  getLastCheckMetadataForTest(entity_id, test) {
    this.setMetadataTestResult(entity_id, test, 0);
    apiClient.get(`/api/validate/lastcheck/${test}?entity_id=${encodeURIComponent(entity_id)}`)
      .then((res) => {
        const result = res.data;
        if (result && result.report) {
          let testNode;
          switch (test) {
            case 'extra': testNode = result.report.test?.sp?.metadata_extra?.SpidSpMetadataCheckExtra; break;
            default: testNode = null;
          }
          const success = this.checkTestResult(testNode);
          if (success === null) this.setMetadataTestResult(entity_id, test, 2);
          else if (success) this.setMetadataTestResult(entity_id, test, 1);
          else this.setMetadataTestResult(entity_id, test, -1);
        } else {
          // lastcheck non disponibile: esegui nuovo check
          this.checkMetadataForTest(entity_id, test);
        }
      })
      .catch(() => {
        this.setMetadataTestResult(entity_id, test, -2);
      });
  }

  getLastCheckMetadata(entity_id) {
    this.getLastCheckMetadataForTest(entity_id, 'extra');
  }

  // ─── Eliminazione metadata ────────────────────────────────────
  deleteModal(metadata) {
    this.showModal({
      title: 'Cancellazione Metadata',
      body: `Con questa azione stai cancellando il metadata con EntityID: <strong>${metadata.entity_id}</strong>`,
      isOpen: true,
      onConfirm: () => this.remove(metadata),
    });
  }

  remove(metadata) {
    this.setBlockUI(true);
    apiClient.delete(`/api/files/metadata?entity_id=${encodeURIComponent(metadata.entity_id)}`)
      .then(() => {
        const metadata_list = this.state.metadata_list;
        delete metadata_list[metadata.entity_id];
        this.setState({ metadata_list }, () => {
          this.loadMetadataList(false);
        });
      })
      .catch((err) => {
        this.setBlockUI(false);
        this.showModal({
          title: 'Errore',
          body: `Si è verificato un errore durante la cancellazione: ${err.message}`,
          isOpen: true,
        });
      });
  }

  // ─── Download XML ─────────────────────────────────────────────
  openMetadata(metadata) {
    const xml = metadata.xml;
    const universalBOM = '\uFEFF';
    const link = document.createElement('a');
    link.href = 'data:text/xml; charset=utf-8,' + encodeURIComponent(universalBOM + xml);
    link.target = '_blank';
    link.download = 'metadata.xml';
    link.click();
  }

  // ─── Apertura Validator ───────────────────────────────────────
  gotoValidator(entity_id) {
    const validatorHost = process.env.REACT_APP_VALIDATOR_URL || 'https://validator.spid.gov.it';
    window.open(`${validatorHost}?store_type=test&entity_id=${encodeURIComponent(entity_id)}`);
  }

  render() {
    return (
      <MetadataView
        state={this.state}
        onSetURL={(url) => this.setMetadataURL(url)}
        onAddMetadata={() => this.addMetadata()}
        onUpload={(file) => this.upload(file)}
        onResetAndDownload={(m) => this.resetAndDownload(m)}
        onGotoValidator={(eid) => this.gotoValidator(eid)}
        onOpenMetadata={(m) => this.openMetadata(m)}
        onDeleteModal={(m) => this.deleteModal(m)}
        onCloseModal={() => this.closeModal()}
      />
    );
  }
}

export default MetadataList;
