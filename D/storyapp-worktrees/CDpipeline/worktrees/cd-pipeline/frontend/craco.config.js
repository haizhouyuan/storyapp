const path = require('path');
const webpack = require('webpack');

/**
 * Create React App Configuration Override (CRACO)
 * 优化构建配置，提升性能和减小包体积
 */
module.exports = {
  webpack: {
    configure: (webpackConfig, { env, paths }) => {
      // ===== 性能优化配置 =====
      
      // 1. 启用代码分割优化
      if (env === 'production') {
        webpackConfig.optimization = {
          ...webpackConfig.optimization,
          splitChunks: {
            chunks: 'all',
            cacheGroups: {
              // 第三方库单独打包
              vendor: {
                test: /[\\/]node_modules[\\/]/,
                name: 'vendors',
                chunks: 'all',
                priority: 10,
              },
              // React相关库单独打包
              react: {
                test: /[\\/]node_modules[\\/](react|react-dom|react-router-dom)[\\/]/,
                name: 'react-vendor',
                chunks: 'all',
                priority: 20,
              },
              // UI组件库单独打包
              ui: {
                test: /[\\/]node_modules[\\/](framer-motion|@heroicons\/react)[\\/]/,
                name: 'ui-vendor',
                chunks: 'all',
                priority: 15,
              },
              // 公共代码提取
              common: {
                name: 'common',
                minChunks: 2,
                chunks: 'all',
                priority: 5,
                reuseExistingChunk: true,
              },
            },
          },
          // 运行时代码单独提取
          runtimeChunk: {
            name: 'runtime',
          },
          // 模块ID优化（用于长期缓存）
          moduleIds: 'deterministic',
          chunkIds: 'deterministic',
        };

        // 2. 资源压缩优化
        webpackConfig.optimization.minimizer.forEach((plugin) => {
          if (plugin.constructor.name === 'TerserPlugin') {
            plugin.options = {
              ...plugin.options,
              terserOptions: {
                ...(plugin.options.terserOptions || {}),
                compress: {
                  ...(plugin.options.terserOptions?.compress || {}),
                  drop_console: true, // 移除console.log
                  drop_debugger: true,
                  pure_funcs: ['console.log', 'console.warn'], // 移除指定函数调用
                },
                mangle: {
                  safari10: true, // 兼容Safari 10
                },
              },
            };
          }
        });

        // 3. Bundle分析插件（开发时启用）
        if (process.env.ANALYZE_BUNDLE) {
          const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer');
          webpackConfig.plugins.push(
            new BundleAnalyzerPlugin({
              analyzerMode: 'server',
              openAnalyzer: true,
            })
          );
        }
      }

      // 4. 开发环境优化
      if (env === 'development') {
        // 启用更快的源映射
        webpackConfig.devtool = 'eval-cheap-module-source-map';
        
        // 缓存配置（提升二次构建速度）
        webpackConfig.cache = {
          type: 'filesystem',
          cacheDirectory: path.resolve(__dirname, '.cache'),
          buildDependencies: {
            config: [__filename],
          },
        };
      }

      // 5. 别名配置（简化导入路径）
      webpackConfig.resolve.alias = {
        ...webpackConfig.resolve.alias,
        '@': path.resolve(__dirname, 'src'),
        '@components': path.resolve(__dirname, 'src/components'),
        '@pages': path.resolve(__dirname, 'src/pages'),
        '@utils': path.resolve(__dirname, 'src/utils'),
        '@shared': path.resolve(__dirname, '../shared'),
      };

      // 6. 外部依赖优化（CDN）
      if (env === 'production' && process.env.USE_CDN === 'true') {
        webpackConfig.externals = {
          react: 'React',
          'react-dom': 'ReactDOM',
          axios: 'axios',
        };
      }

      // 7. 文件大小限制优化
      webpackConfig.performance = {
        ...webpackConfig.performance,
        maxAssetSize: 500000, // 500KB
        maxEntrypointSize: 500000,
        assetFilter: (assetFilename) => {
          // 忽略字体和图片文件的大小检查
          return !assetFilename.endsWith('.woff2') && 
                 !assetFilename.endsWith('.woff') && 
                 !assetFilename.endsWith('.ttf') &&
                 !assetFilename.endsWith('.png') &&
                 !assetFilename.endsWith('.jpg') &&
                 !assetFilename.endsWith('.jpeg');
        },
      };

      return webpackConfig;
    },
    
    // 插件配置
    plugins: [
      // 环境变量定义
      new webpack.DefinePlugin({
        'process.env.BUILD_TIME': JSON.stringify(new Date().toISOString()),
        'process.env.COMMIT_HASH': JSON.stringify(
          process.env.GITHUB_SHA || 'development'
        ),
      }),
      
      // 预加载插件（优化关键资源加载）
      ...(process.env.NODE_ENV === 'production' ? [
        new webpack.optimize.ModuleConcatenationPlugin(), // Scope hoisting
      ] : []),
    ],
  },

  // ===== Babel 配置优化 =====
  babel: {
    presets: [
      [
        '@babel/preset-react',
        {
          runtime: 'automatic',
        },
      ],
    ],
    plugins: [
      // 生产环境移除PropTypes
      ...(process.env.NODE_ENV === 'production' ? [
        ['babel-plugin-transform-remove-console', { exclude: ['error', 'warn'] }],
        'babel-plugin-transform-remove-debugger',
      ] : []),
      
      // 按需导入优化
      [
        'babel-plugin-import',
        {
          libraryName: '@heroicons/react',
          libraryDirectory: '',
          camel2DashComponentName: false,
        },
        '@heroicons/react',
      ],
    ],
  },

  // ===== ESLint 配置 =====
  eslint: {
    enable: true,
    mode: 'file',
  },

  // ===== TypeScript 配置优化 =====
  typescript: {
    enableTypeChecking: true,
  },

  // ===== DevServer 配置优化 =====
  devServer: {
    compress: true,
    hot: true,
    open: false,
    client: {
      overlay: {
        warnings: false,
        errors: true,
      },
    },
    // 代理配置（开发环境）
    proxy: {
      '/api': {
        target: process.env.REACT_APP_API_URL || 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
      },
    },
  },

  // ===== 样式配置 =====
  style: {
    postcss: {
      mode: 'file',
    },
  },
};