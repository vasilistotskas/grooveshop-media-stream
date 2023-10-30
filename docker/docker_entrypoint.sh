#!/bin/sh
set -e

cd /mnt/app

rm -rf node_modules && rm -rf build

npm i

npm run start:dev
