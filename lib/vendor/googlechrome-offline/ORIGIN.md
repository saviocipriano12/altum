# GoogleChrome offline navigation reference

Source: https://github.com/GoogleChrome/samples
Commit: `88046c15e9c3190edb5f875e91b5bb2bb2a5c72b`
File: `service-worker/custom-offline-page/service-worker.js`
License: Apache-2.0, retained as `LICENSE`.

The original file is copied unchanged as `service-worker.reference.js` for review.
Its navigation preload and offline fallback were adapted into `public/sw.js`.
Altum restricts interception to its client area, excludes APIs and Next.js assets,
and never caches authenticated HTML or customer data. No dependency was installed.
