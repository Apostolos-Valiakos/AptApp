import type { NextConfig } from "next";

// Built to plain static files (out/), which the app's Express server serves
// at "/" — see server/server.js. No Next server runs in production.
const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
};

export default nextConfig;
