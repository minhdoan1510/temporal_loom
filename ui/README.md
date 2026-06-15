# Lending Claw UI

The React frontend keeps the existing Lending Claw routes and API contracts,
with the Temporal Loom desktop shell and visual language.

## Browser development

```bash
cd web
pnpm install
pnpm dev
```

Vite proxies `/api` to `http://localhost:8080`.

## zero-native desktop

Build the frontend and run Lending Claw's HTTP server with `server.web_dir`
pointing to `ui/web/dist`, then launch the native shell:

```bash
cd web
pnpm build
cd ..
zig build run
```

The native shell loads `http://127.0.0.1:8080` so authentication cookies,
API requests, and SSE streaming remain same-origin.
