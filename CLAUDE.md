# vue-quill-editor

Vue 3 + Quill 2.0 rich text editor library with EDM (image/video/file) embed extensions.

## Commands

- **Dev**: `pnpm dev` (Vite dev server on 127.0.0.1:5173)
- **Build**: `pnpm build` (vue-tsc + vite build → dist/)
- **Build demo**: `pnpm build:demo`
- **Lint**: `pnpm lint` (ESLint via @antfu/eslint-config)
- **Lint fix**: `pnpm lint:fix`
- **Type check**: `npx vue-tsc --project tsconfig.build.json --noEmit`
- **Server dev**: `cd server && pnpm dev` (Fastify on 127.0.0.1:3001)
- **Server build**: `cd server && pnpm build`

## Architecture

```
src/
├── editor/    # RichTextEditor.vue + Quill blot registrations
├── viewer/    # EdmContentViewer.vue (read-only embed rendering)
├── shared/    # Types, utilities, shared CSS
├── pages/     # DemoPage.vue
└── router/    # Vue Router config
server/        # Fastify API (file upload, EDM config)
```

## Stack

- Vue 3 + Vite 8 + TypeScript 6
- Quill 2.0 (peer dependency)
- Fastify 5 (dev server)
- pnpm (package manager)
- @vercel/blob (storage)

## Notes

- Library entry: `src/editor/index.ts` → builds to `dist/` as ES + CJS
- Quill and Vue are externalized in the library build
- The Vite dev server proxies `/api` → `http://127.0.0.1:3001`
