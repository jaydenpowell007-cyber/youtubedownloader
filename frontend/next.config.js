/** @type {import('next').NextConfig} */
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "i.ytimg.com" },
      { protocol: "https", hostname: "img.youtube.com" },
      { protocol: "https", hostname: "i1.sndcdn.com" },
      { protocol: "https", hostname: "**.sndcdn.com" },
      { protocol: "https", hostname: "i.scdn.co" },
    ],
  },
  async rewrites() {
    return [
      {
        source: "/ws/:path*",
        destination: `${API_URL}/ws/:path*`,
      },
      {
        source: "/api/:path*",
        destination: `${API_URL}/api/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
