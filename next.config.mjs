/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // hltv uses got-scraping / header-generator which reads data files at
    // module init time using __dirname-relative paths.  Bundling it breaks
    // those paths, so we keep it as a true Node require() instead.
    serverComponentsExternalPackages: ["hltv"],
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "a.espncdn.com" },
      { protocol: "https", hostname: "a1.espncdn.com" },
      { protocol: "https", hostname: "a2.espncdn.com" },
      { protocol: "https", hostname: "a3.espncdn.com" },
      { protocol: "https", hostname: "a4.espncdn.com" },
      { protocol: "https", hostname: "s.afl.com.au" },
    ],
  },
};
export default nextConfig;
