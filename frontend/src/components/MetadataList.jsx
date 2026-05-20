import React, { Component } from 'react';
import MetadataView from './MetadataView';
import apiClient from '../api/client';
import Utility from '../utils/utility';
import axios from 'axios';
import { API, getAuthHeaders } from '../services/api';
import { API } from '../constants';

class MetadataList extends Component {
  constructor(props) {
    super(props);
    this.state = {
      metadata_list: {},
      loading: false,
      fileName: '',
      fileSize: 0,
      progress: 0,
      blockUI: false,
      modal: null,
    };
  }

  componentDidMount() {
    this.loadMetadataList();
    window.scrollTo(0, 0);
  }

  setBlockUI(active) {
    this.setState({ blockUI: active });
  }

  showModal(opts) {
    this.setState({ modal: opts });
  }

  closeModal() {
    this.setState({ modal: null });
  }

  loadMetadataList() {
    this.setBlockUI(true);
    axios.get(API.files, getAuthHeaders())
      .then((res) => {
        this.setBlockUI(false);
        const files = res.data;
        const metadata_list = {};
        files.forEach((f) => {
          metadata_list[f.filename] = {
            entity_id: f.filename,
            organization_description: f.filename.replace('.xml', ''),
            type: 'SP',
            size: f.size,
            modificationDate: f.modificationDate,
            creationDate: f.creationDate,
          };
        });
        this.setState({ metadata_list });
      })
      .catch(() => {
        this.setBlockUI(false);
        this.showModal({
          title: 'Errore',
          body: 'Si è verificato un errore durante il caricamento dei file.',
          isOpen: true,
        });
      });
  }

  upload(file) {
    this.setState({
      loading: true,
      fileName: file.name,
      fileSize: file.size,
      progress: 0,
    });

    const formData = new FormData();
    formData.append('xmlFile', file);

    apiClient.post('/api/files/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (e) => {
        this.setState({ progress: Math.round((e.loaded * 100) / e.total) });
      },
    })
      .then(() => {
        this.setState({ loading: false, fileName: '', fileSize: 0, progress: 0 });
        this.loadMetadataList();
      })
      .catch((err) => {
        this.showModal({
          title: 'Errore',
          body: err.response?.data?.error || 'Errore durante l\'upload.',
          isOpen: true,
        });
        this.setState({ loading: false, fileName: '', fileSize: 0, progress: 0 });
      });
  }

  deleteModal(metadata) {
    this.showModal({
      title: 'Elimina file',
      body: `Stai eliminando il file <strong>${metadata.entity_id}</strong>. Continuare?`,
      isOpen: true,
      onConfirm: () => this.remove(metadata),
    });
  }

  remove(metadata) {
    this.setBlockUI(true);
    apiClient.post('/api/files/delete-xml-files', { filenames: [metadata.entity_id] })
      .then(() => {
        const metadata_list = { ...this.state.metadata_list };
        delete metadata_list[metadata.entity_id];
        this.setState({ metadata_list });
        this.setBlockUI(false);
      })
      .catch((err) => {
        this.setBlockUI(false);
        this.showModal({
          title: 'Errore',
          body: `Errore durante l'eliminazione: ${err.message}`,
          isOpen: true,
        });
      });
  }

openMetadata(metadata) {
  apiClient.post('/api/files/get-xml-contents', { filenames: [metadata.entity_id] })
    .then((res) => {
      const item = Array.isArray(res.data) ? res.data[0] : res.data;
      const xml = item?.content || '';
      if (!xml) {
        this.showModal({ title: 'Errore', body: 'Contenuto XML non disponibile.', isOpen: true });
        return;
      }
      const universalBOM = '\uFEFF';
      const link = document.createElement('a');
      link.href = 'data:text/xml; charset=utf-8,' + encodeURIComponent(universalBOM + xml);
      link.target = '_blank';
      link.download = metadata.entity_id;
      link.click();
    })
    .catch(() => {
      this.showModal({ title: 'Errore', body: 'Impossibile scaricare il file XML.', isOpen: true });
    });
}


  render() {
    return (
      <MetadataView
        state={this.state}
        onUpload={(file) => this.upload(file)}
        onOpenMetadata={(m) => this.openMetadata(m)}
        onDeleteModal={(m) => this.deleteModal(m)}
        onCloseModal={() => this.closeModal()}
        onRefresh={() => this.loadMetadataList()}
      />
    );
  }
}

export default MetadataList;
