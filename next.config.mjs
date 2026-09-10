/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep an overrideable production output directory for deployment tooling.
  // Next.js 16 already isolates `next dev` under `.next/dev`.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  serverExternalPackages: ['better-sqlite3', 'node-ical', 'nodemailer'],
};

export default nextConfig;
