import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/opencode/:path*",
        destination: "http://127.0.0.1:4096/:path*",
      },
    ];
  },
};

export default nextConfig;
