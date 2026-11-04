#!/usr/bin/bash

set -euo pipefail

cp node_modules/less/dist/less.js ./lib
cp node_modules/vue/dist/vue.esm-browser.prod.js ./lib

echo "Install complete. Run 'npm start' to run."