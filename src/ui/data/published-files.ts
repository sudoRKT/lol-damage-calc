// A `fetch` that reads the PUBLISHED files off disk. Test-support, and deliberately not a mock.
//
// WHY THIS EXISTS RATHER THAN A FIXTURE. Every test in this area that needs champion, item or
// ability data could be handed a hand-written object with three champions in it. That fixture
// would then be the thing under test: it would carry the shapes somebody expected the pipeline to
// write, not the shapes it actually wrote, and the seam between the two areas — which is exactly
// where the interface breaks — would never be exercised. This reads `public/data/**` itself, so a
// test that passes here passes against the real 173-champion roster and the real 209-item pool.
//
// IT IS HONEST ABOUT ABSENCE. A path with no file behind it returns a real 404 response, because
// that is what the browser gets for `/data/abilities/Ahri.json` today — one abilities file is
// published and 172 champions have none. A stub that invented an empty ability list instead would
// hide the single largest gap in this product from every test that uses it.

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const PUBLIC_DIR = join(REPO, 'public');

/** Where a request path resolves to on disk, or null when it escapes `public/`. */
export function publishedPath(url: string): string | null {
  const path = url.startsWith('http') ? new URL(url).pathname : url;
  const full = normalize(join(PUBLIC_DIR, path));
  return full.startsWith(PUBLIC_DIR) ? full : null;
}

/**
 * A `fetch` over the published files.
 *
 * Only the three members the loaders use are implemented — `ok`, `status`, `json` — and the cast
 * is confined to this one file so no component ever sees a partial Response.
 */
export const fetchPublished: typeof fetch = (async (input: RequestInfo | URL) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const path = publishedPath(url);
  if (!path || !existsSync(path)) {
    return { ok: false, status: 404, json: async () => null } as unknown as Response;
  }
  const text = readFileSync(path, 'utf8');
  return {
    ok: true,
    status: 200,
    json: async () => JSON.parse(text) as unknown,
  } as unknown as Response;
}) as unknown as typeof fetch;
