/** @type {import('next').NextConfig} */
const nextConfig = {
  // Next.js 14.x では instrumentation.ts (生成ジョブのpoller起動) が
  // このフラグ無しでは呼ばれない。15以降で不要になるが14.2.35では必須。
  experimental: {
    instrumentationHook: true,
  },
};

export default nextConfig;
