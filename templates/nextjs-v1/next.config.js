// @ts-check
// Next.js config — Cloudflare Workers via @opennextjs/cloudflare per SOP §4.1

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Cloudflare adapter handles the rest at build time
  experimental: {
    // Allow server actions from Cloudflare Workers
    serverActions: {
      allowedOrigins: ['*'],
    },
  },
  // Image optimization disabled — Cloudflare Workers don't support next/image's default loader.
  // Use Cloudflare Images binding or external URLs for now.
  images: {
    unoptimized: true,
  },
}

module.exports = nextConfig
