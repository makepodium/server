#!/usr/bin/env node

import { cpSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const srcDir = join(here, '..', 'src');
const distDir = join(here, '..', 'dist');

if (!existsSync(distDir)) {
  console.error(`dist/ missing at ${distDir}; run tsc first`);
  process.exit(1);
}

const EXTENSIONS = new Set(['.html', '.ico']);

cpSync(srcDir, distDir, {
  recursive: true,
  filter: (source) => {
    if (!source.includes('.')) return true;

    const dot = source.lastIndexOf('.');
    const ext = source.slice(dot);
    return EXTENSIONS.has(ext);
  },
});

console.log(`Copied template assets: ${[...EXTENSIONS].join(', ')}`);
