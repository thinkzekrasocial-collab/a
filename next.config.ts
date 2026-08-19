import type { NextConfig } from "next";

// The Cloudflare Worker is the production API. `beforeFiles` runs before the
// legacy local Next.js API routes, so browser requests remain same-origin on
// Vercel and the Worker's HTTP-only session cookie works without CORS setup.
const cloudflareApiOrigin =
  process.env.CLOUDFLARE_WORKER_API_URL ??
  "https://ab-maintenance-bd-api.ab-maintenance-bd.workers.dev";

const nextConfig: NextConfig = {
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: "/api/:path*",
          destination: `${cloudflareApiOrigin}/api/:path*`,
        },
      ],
    };
  },
};

export default nextConfig;
