/**
 * Vercel discovers serverless functions in `api/` relative to the project's
 * Root Directory. The real implementation lives at site/api/fetch.js, where it
 * sits beside the Astro app it serves and beside its own test.
 *
 * This shim exists so the function is found under EITHER Root Directory
 * setting: at the repo root Vercel resolves this file, and at `site` it
 * resolves site/api/fetch.js directly and never reads this one. Deleting it is
 * safe only once the project's Root Directory is definitely `site`.
 *
 * The .mjs extension is load-bearing: the repo root has no package.json, so a
 * .js file here is treated as CommonJS and this export is a syntax error.
 */
export { default } from '../site/api/fetch.js';
