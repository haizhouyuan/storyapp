module.exports = {
  plugins: [
    // Tailwind CSS
    require('tailwindcss'),
    
    // Autoprefixer for browser compatibility
    require('autoprefixer'),
    
    // 生产环境优化
    ...(process.env.NODE_ENV === 'production' ? [
      // CSS优化
      require('cssnano')({
        preset: ['default', {
          discardComments: {
            removeAll: true,
          },
          normalizeWhitespace: true,
          mergeLonghand: true,
          convertValues: true,
          discardUnused: false, // 避免移除Tailwind动态类
        }],
      }),
    ] : []),
  ],
};