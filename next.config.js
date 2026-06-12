/** @type {import('next').NextConfig} */
const nextConfig = {
  // Standalone server bundle for the Cloudflare Container image (node server.js).
  output: "standalone",
  // The Agent SDK spawns a platform `claude` binary that nft can't statically trace;
  // force it (and the SDK) into the standalone bundle. The Dockerfile also copies it.
  experimental: {
    outputFileTracingIncludes: {
      "/api/**": ["./node_modules/@anthropic-ai/claude-agent-sdk-linux-x64/**"],
    },
  },
};
module.exports = nextConfig;
