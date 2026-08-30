#!/bin/sh
set -e

cd /mnt/app

corepack enable
pnpm install --frozen-lockfile

pnpm run dev
