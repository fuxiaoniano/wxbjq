# Project Guide

- Entry point: `server.js`; HTTP routing: `server/router.js`.
- Browser app: `public/index.html` and native ES modules under `public/js/`.
- Authentication: `server/auth/`; email providers: `server/email/`.
- Membership and feature access: `server/membership/`; administrator APIs: `server/admin/`.
- WeChat account binding, encryption, and token cache: `server/wechat/`; standalone admin page: `public/admin.html`.
- JSON repositories write atomically under `data/`; never commit `data/` or `.env`.
- Preserve unauthenticated editor behavior unless a feature is explicitly gated.
- Run `npm run check`, `npm test`, `npm run typecheck`, and `npm run build` before handoff.
- Node.js 20+ is required. Production must use HTTPS and one Node process while JSON storage is in use.
