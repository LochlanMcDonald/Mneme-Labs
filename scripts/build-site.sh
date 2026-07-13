#!/usr/bin/env bash
# Assemble the Netlify site: Mneme Labs root site at /, a local-only copy
# of Groundwork at /groundwork/. The account-enabled app itself lives on
# the Azure Static Web App (groundwork-security.com).
set -euo pipefail

(cd groundwork && npm ci && npm run build)

rm -rf _site
mkdir -p _site/groundwork
cp index.html LICENSE _site/
cp -r images _site/images
cp -r groundwork/dist/. _site/groundwork/
