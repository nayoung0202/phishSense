/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: "/tenant-invites/:token",
          destination: "/tenant-invites?token=:token",
        },
      ],
    };
  },
};

export default nextConfig;
