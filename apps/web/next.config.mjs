/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    // don’t fail the production build on lint errors
    ignoreDuringBuilds: true,
  },
  typescript: {
    // optional: don’t fail build on TS errors
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
