import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "*.ngrok.app",
    "*.ngrok-free.app",
    "*.ngrok-free.dev",
  ],
};

export default nextConfig;
