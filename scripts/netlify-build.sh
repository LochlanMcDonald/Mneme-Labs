#!/usr/bin/env bash
# Assemble the deployable site: root site at /, Groundwork app at /groundwork/.
set -euo pipefail

(cd groundwork && npm ci && npm run build)

rm -rf _site
mkdir -p _site/groundwork
cp index.html LICENSE _site/
cp -r images _site/images
cp -r groundwork/dist/. _site/groundwork/
