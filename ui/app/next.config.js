/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // 避免打包 pdfkit，否则会找不到 Helvetica.afm 等内置资源导致 PDF 导出 500（见 foliojs/pdfkit#1549）
  experimental: {
    serverComponentsExternalPackages: ["pdfkit"],
  },
};

module.exports = nextConfig;
