/** @type {import('next').NextConfig} */
const nextConfig = {
  images: { remotePatterns: [{ protocol: 'https', hostname: '*.supabase.co' }] },
  experimental: { serverComponentsExternalPackages: ['pdf-parse'] },
};
export default nextConfig;
