module.exports = {
  apps: [
    {
      name: 'gateway',
      script: 'server.mjs',
      cwd: '/home/pi/spid-metadata-microservices/gateway',
      node_args: '--env-file=/home/pi/spid-metadata-microservices/.env',
      watch: false,
      autorestart: true,
    },
    {
      name: 'backoffice',
      script: 'server.mjs',
      cwd: '/home/pi/spid-metadata-microservices/services/backoffice-service',
      node_args: '--env-file=/home/pi/spid-metadata-microservices/.env',
      watch: false,
      autorestart: true,
    },
    {
      name: 'file',
      script: 'server.mjs',
      cwd: '/home/pi/spid-metadata-microservices/services/file-service',
      node_args: '--env-file=/home/pi/spid-metadata-microservices/.env',
      watch: false,
      autorestart: true,
    },
    {
      name: 'validation',
      script: 'server.mjs',
      cwd: '/home/pi/spid-metadata-microservices/services/validation-service',
      node_args: '--env-file=/home/pi/spid-metadata-microservices/.env',
      watch: false,
      autorestart: true,
    },
    {
      name: 'github',
      script: 'server.mjs',
      cwd: '/home/pi/spid-metadata-microservices/services/github-service',
      node_args: '--env-file=/home/pi/spid-metadata-microservices/.env',
      watch: false,
      autorestart: true,
    },
    {
      name: 'pr',
      script: 'server.mjs',
      cwd: '/home/pi/spid-metadata-microservices/services/pr-service',
      node_args: '--env-file=/home/pi/spid-metadata-microservices/.env',
      watch: false,
      autorestart: true,
    },
    {
      name: 'batch',
      script: 'server.mjs',
      cwd: '/home/pi/spid-metadata-microservices/services/batch-service',
      node_args: '--env-file=/home/pi/spid-metadata-microservices/.env',
      watch: false,
      autorestart: true,
    },
    {
      name: 'frontend',
      script: 'node_modules/.bin/react-scripts',
      args: 'start',
      cwd: '/home/pi/spid-metadata-microservices/frontend',
      env: {
        PORT: 3000,
        BROWSER: 'none',   // non apre il browser automaticamente
      },
      autorestart: true,
    },    
  ]
};
