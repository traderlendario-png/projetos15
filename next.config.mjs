import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep an overrideable production output directory for deployment tooling.
  // Next.js 16 already isolates `next dev` under `.next/dev`.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  serverExternalPackages: ['better-sqlite3', 'node-ical', 'nodemailer'],
  turbopack: {
    // Pin tracing/resolution to this repository even when a parent directory
    // contains another lockfile. Next.js requires this path to be absolute.
    root: projectRoot,
  },
};

export default nextConfig;
