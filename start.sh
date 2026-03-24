#!/bin/bash
cd /home/pi/spid-metadata-microservices
pm2 restart ecosystem.config.cjs --update-env

