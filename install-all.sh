#!/bin/bash
echo "📦 Installazione dipendenze..."
npm install --prefix gateway
npm install --prefix services/backoffice-service
npm install --prefix services/file-service
npm install --prefix services/validation-service
npm install --prefix services/github-service
npm install --prefix services/pr-service
npm install --prefix services/batch-service
npm install --prefix services/certificate-service
npm install --prefix services/spid-service
npm install --prefix frontend
echo "✅ Fatto!"
