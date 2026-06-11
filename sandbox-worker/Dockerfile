# Base image must match the @cloudflare/sandbox package version (keep in sync).
FROM docker.io/cloudflare/sandbox:0.12.1

# The base image ships Node 20, Python 3.11, and common shell tools — enough to run
# `npm install` + a Next/Vite dev server for generated apps. Add more if needed:
#   RUN npm install -g pnpm

EXPOSE 8080
