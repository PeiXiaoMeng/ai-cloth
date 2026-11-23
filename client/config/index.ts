import { defineConfig } from '@tarojs/cli'

export default defineConfig(async (merge) => {
  const config = {
    projectName: 'ai-cloth-client',
    date: '2026-11-10',
    designWidth: 750,
    deviceRatio: {
      640: 2.34 / 2,
      750: 1,
      828: 1.81 / 2,
    },
    sourceRoot: 'src',
    outputRoot: 'dist',
    plugins: [],
    defineConstants: {},
    copy: {
      patterns: [],
      options: {},
    },
    framework: 'react',
    compiler: {
      type: 'webpack5',
      // 关闭预编译，规避 enhanced-resolve 兼容性问题
      prebundle: {
        enable: false,
      },
    },
    mini: {
      postcss: {
        pxtransform: {
          enable: true,
          config: {},
        },
        cssModules: {
          enable: false,
        },
      },
      webpackChain(chain) {
        // 提高小程序包体积上限相关配置可在此扩展
      },
    },
    h5: {},
  }

  if (process.env.NODE_ENV === 'development') {
    return merge({}, config, {})
  }
  return merge({}, config, {})
})
