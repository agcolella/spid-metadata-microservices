# SPID Metadata App — Frontend

Frontend React per la gestione dei metadata SPID, adattato dalla logica di [AgID/spid-onboarding](https://github.com/AgID/spid-onboarding) (modulo `spid-onboarding.metadatatest`).

## Stack

- React 18
- React Router v6
- Axios
- Bootstrap 5

## Struttura

```
frontend/
  src/
    App.js                  # Router principale (login + dashboard protetta)
    api/client.js           # Axios instance con interceptor JWT
    components/
      Login.jsx             # Form di login
      Dashboard.jsx         # Navbar + outlet
      MetadataList.jsx      # Logica (adattata da List.js di spid-onboarding)
      MetadataView.jsx      # Template JSX (adattato da view.js di spid-onboarding)
    utils/utility.js        # Utility (log, validazione URL, formattazione)
```

## Configurazione

Crea `.env` in questa directory:

```env
REACT_APP_GATEWAY_URL=http://localhost:8080
REACT_APP_VALIDATOR_URL=https://validator.spid.gov.it
```

## Avvio locale

```bash
cd frontend
npm install
npm start
```

Il frontend sarà disponibile su `http://localhost:3000` e si collegherà al gateway su `:8080`.

## Mapping API (gateway → microservizi)

| Funzione | Endpoint |
|---|---|
| Lista metadata utente | `GET /api/files/metadata` |
| Dettaglio metadata | `GET /api/files/metadata?entity_id=...` |
| Download da URL | `GET /api/files/download?url=...` |
| Upload ZIP | `POST /api/files/zip` |
| Elimina metadata | `DELETE /api/files/metadata?entity_id=...` |
| Validazione (check) | `GET /api/validate/check/extra?entity_id=...` |
| Ultimo check | `GET /api/validate/lastcheck/extra?entity_id=...` |
| Validation summary | `GET /api/validate/metadata/validation?entity_id=...` |
| Login | `POST /api/auth/login` |

## Differenze rispetto all'originale (spid-onboarding)

| Aspetto | spid-onboarding originale | Questa implementazione |
|---|---|---|
| API path | `/metadatatest/...` | `/api/files/...`, `/api/validate/...` |
| Auth | apikey via query string | JWT Bearer token in header |
| CSS framework | Bootstrap Italia + SVG sprite | Bootstrap 5 standard |
| Icone | SVG sprite `#it-*` | Emoji Unicode |
| Build | Webpack custom | react-scripts (CRA) |
