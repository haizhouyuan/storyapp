/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
    "../shared/**/*.{js,jsx,ts,tsx}",
  ],
  // 启用JIT模式以获得更快的构建速度
  mode: 'jit',
  theme: {
    extend: {
      fontFamily: {
        'child': ['Nunito', 'sans-serif'],
      },
      colors: {
        // 儿童友好的色彩系统
        child: {
          // 主色调：柔和的粉彩色
          'mint': '#A8E6CF',      // 薄荷绿
          'cream': '#FFF8DC',     // 奶油白
          'yellow': '#FFEB9C',    // 温暖浅黄
          
          // 按钮色彩
          'blue': '#B3D9FF',      // 淡蓝
          'green': '#B8E6B8',     // 浅绿
          'orange': '#FFD4A3',    // 淡橙
          'pink': '#FFB3BA',      // 淡粉
          
          // 强调色
          'gold': '#FFD700',      // 金色
          'purple': '#DDA0DD',    // 淡紫色
          
          // 中性色
          'gray': {
            100: '#F7FAFC',
            200: '#EDF2F7',
            300: '#E2E8F0',
            400: '#CBD5E0',
            500: '#A0AEC0',
          }
        }
      },
      fontSize: {
        // 儿童友好的字体尺寸
        'child-xs': ['14px', { lineHeight: '1.6' }],
        'child-sm': ['16px', { lineHeight: '1.6' }],
        'child-base': ['18px', { lineHeight: '1.6' }],
        'child-lg': ['20px', { lineHeight: '1.6' }],
        'child-xl': ['24px', { lineHeight: '1.5' }],
        'child-2xl': ['28px', { lineHeight: '1.4' }],
        'child-3xl': ['32px', { lineHeight: '1.3' }],
        'child-4xl': ['36px', { lineHeight: '1.2' }],
      },
      spacing: {
        // 适合儿童操作的间距
        'child-xs': '8px',
        'child-sm': '12px',
        'child-md': '16px',
        'child-lg': '20px',
        'child-xl': '24px',
        'child-2xl': '32px',
        'child-3xl': '48px',
      },
      borderRadius: {
        // 圆润的边框
        'child': '16px',
        'child-lg': '20px',
        'child-xl': '24px',
      },
      boxShadow: {
        // 柔和的阴影
        'child': '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
        'child-lg': '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
        'child-xl': '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
        'child-glow': '0 0 20px rgba(255, 217, 61, 0.3)',
      },
      animation: {
        'bounce-gentle': 'bounce 2s infinite',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'wiggle': 'wiggle 1s ease-in-out infinite',
      },
      keyframes: {
        wiggle: {
          '0%, 100%': { transform: 'rotate(-3deg)' },
          '50%': { transform: 'rotate(3deg)' },
        }
      }
    },
  },
  plugins: [
    require('@tailwindcss/forms')({
      strategy: 'class',
    }),
  ],
}