// Static export (for GitHub Pages) is enabled with STATIC_EXPORT=true.
// In that mode the app has no server: ClientsideProvider handles /api/* in
// the browser with IndexedDB persistence and Web Worker / WebContainer runtimes.
const isExport = process.env.STATIC_EXPORT === "true";
const basePath = process.env.PAGES_BASE_PATH ?? "";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Inlined into the client bundle so the browser runtime can resolve the
  // Web Worker, COI service worker, and desktop bottle iframe under a base path.
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
  ...(isExport
    ? {
        output: "export",
        trailingSlash: true,
        images: { unoptimized: true },
        ...(basePath ? { basePath, assetPrefix: `${basePath}/` } : {}),
      }
    : {
        // Cross-origin isolation (for the WebContainer Node backend's
        // SharedArrayBuffer) is scoped to the /openshell route ONLY. Applying it
        // globally breaks the v86 tiers, which halt under cross-origin isolation,
        // and isolation is all-or-nothing per page — so the Node runtime lives on
        // its own isolated top-level page while the dashboard and v86 tiers stay
        // non-isolated. In static export these headers are a no-op; that route
        // would need a COI service worker to isolate on GitHub Pages.
        async headers() {
          const coi = [
            { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
            { key: "Cross-Origin-Embedder-Policy", value: "credentialless" },
          ];
          return [
            { source: "/openshell", headers: coi },
            { source: "/openshell/:path*", headers: coi },
          ];
        },
      }),
};

export default nextConfig;
