/** @type {import('next').NextConfig} */
const nextConfig = {
  images: { remotePatterns: [{ protocol: 'https', hostname: '*.supabase.co' }] },
  serverExternalPackages: ['pdf-parse'],
};
export default nextConfig;
