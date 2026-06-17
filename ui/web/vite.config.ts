import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiTarget = process.env.VITE_API_TARGET || env.VITE_API_TARGET || "http://localhost:8080";

  console.log(`[Vite Dev Server] Proxying /api to: ${apiTarget}`);

  return {
    // Absolute base so hashed assets resolve from the domain root at ANY route
    // depth. With a relative base ("./"), a deep first-load like the CAS callback
    // (/sso/cas?ticket=...) resolves assets against /sso/ and the SPA fallback
    // serves index.html for them → "Expected a JavaScript module but got text/html".
    base: "/",
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
      // Force a single React instance. Under pnpm, a dependency that lists react
      // as a peer (e.g. "agentation") can otherwise resolve its own copy, which
      // makes hooks run against a different React and throws "Invalid hook call /
      // Cannot read properties of null (reading 'useCallback')".
      dedupe: ["react", "react-dom"],
    },
    server: {
      port: 5173,
      proxy: {
        "/api/v1/ai-sdk/proxy": {
          target: "https://litellm.zalopay.vn/v1",
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/v1\/ai-sdk\/proxy/, ""),
          secure: false,
        },
        "/api": {
          target: apiTarget,
          changeOrigin: true,
          secure: false,
          configure: (proxy, _options) => {
            proxy.on("error", (err, req, _res) => {
              console.error(`[Proxy Error] ${req.method} ${req.url}:`, err.message);
            });
            proxy.on("proxyReq", (_proxyReq, req, _res) => {
              console.log(`[Proxy Request] ${req.method} ${req.url} -> ${apiTarget}${req.url}`);
            });
            proxy.on("proxyRes", (proxyRes, req, _res) => {
              console.log(`[Proxy Response] ${req.method} ${req.url} -> Status: ${proxyRes.statusCode}`);
            });
          },
        },
      },
    },
    build: {
      rollupOptions: {
        input: {
          main: path.resolve(__dirname, "index.html"),
          jsonRenderElements: path.resolve(__dirname, "json-render-elements.html"),
          onboarding: path.resolve(__dirname, "onboarding.html"),
        },
      },
    },
  };
});
