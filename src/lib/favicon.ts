import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';

const FAVICON_PATH = fileURLToPath(
  new URL('../assets/favicon.ico', import.meta.url),
);

export const FAVICON_BYTES: Buffer = readFileSync(FAVICON_PATH);
export const FAVICON_CACHE_CONTROL = 'public, max-age=604800, immutable';
