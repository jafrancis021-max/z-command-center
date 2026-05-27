import path from 'path'
import type { NextConfig } from "next";

// CORS is handled centrally in src/middleware.ts — no duplication here.
const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
