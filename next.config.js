/** @type {import('next').NextConfig} */
const nextConfig = {
  // Standalone server bundle for the Cloudflare Container image (node server.js).
  output: "standalone",
  experimental: {
    // CRITICAL: keep the Agent SDK OUT of the webpack bundle. Bundled inline, its
    // self-relative resolution of the platform `claude` binary breaks in the
    // standalone server → "Claude Code process exited with code 1" (works in dev,
    // dies in prod). Externalized, it loads from real node_modules at runtime.
    serverComponentsExternalPackages: ["@anthropic-ai/claude-agent-sdk"],
    // The platform binary package is resolved dynamically (nft can't trace it);
    // force it into the standalone output. The Dockerfile also copies it.
    outputFileTracingIncludes: {
      "/api/**": ["./node_modules/@anthropic-ai/claude-agent-sdk-linux-x64/**"],
    },
  },
};
module.exports = nextConfig;
