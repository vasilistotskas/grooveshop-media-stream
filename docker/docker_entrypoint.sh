#!/bin/sh
set -e

cd /mnt/app

npm i && npm run format && npm run lint

npm run start:dev
