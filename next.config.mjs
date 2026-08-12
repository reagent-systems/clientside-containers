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
        // Cross-origin isolation so the WebContainer-backed OpenShell runtime
        // can use SharedArrayBuffer. `credentialless` keeps existing cross-origin
        // subresources (agent egress, v86 assets) working. In static export the
        // headers below are a no-op; a COI service worker provides isolation
        // there instead (see public/coi-serviceworker.js).
        async headers() {
          return [
            {
              source: "/:path*",
              headers: [
                { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
                { key: "Cross-Origin-Embedder-Policy", value: "credentialless" },
              ],
            },
          ];
        },
      }),
};

export default nextConfig;
