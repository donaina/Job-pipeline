const path = require("path");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  webpack: (config) => {
    config.resolve.alias["@"] = path.resolve(__dirname);
    return config;
  },
  experimental: {
    serverComponentsExternalPackages: ["pdf-parse", "postgres"],
    outputFileTracingIncludes: {
      "/api/resume": ["./resumes/**/*"],
      "/api/approve": ["./resumes/**/*"],
      "/api/kit": ["./config/applyKit.json"],
    },
  },
};

module.exports = nextConfig;
