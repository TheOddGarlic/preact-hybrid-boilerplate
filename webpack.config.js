/*
 * Copyright (c) 2020-present Umut İnan Erdoğan and other contributors
 * 
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 * 
 * 1. Redistributions of source code must retain the above copyright notice, this
 *    list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 *    this list of conditions and the following disclaimer in the
 *    documentation and/or other materials provided with the distribution.
 * 3. Neither the name of the copyright holder nor the names of its contributors
 *    may be used to endorse or promote products derived from this software without
 *    specific prior written permission.
 * 
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
 * FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
 * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
 * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
 * CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
 * OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

const { resolve, join } = require('path')
const { existsSync, readdirSync, unlinkSync } = require('fs')
const TerserJSPlugin = require('terser-webpack-plugin')
const ManifestPlugin = require('webpack-manifest-plugin')
const MiniCSSExtractPlugin = require('mini-css-extract-plugin')
const FriendlyErrorsWebpackPlugin = require('friendly-errors-webpack-plugin')
const OptimizeCSSAssetsPlugin = require('optimize-css-assets-webpack-plugin')
const PreactRefreshWebpackPlugin = require('@prefresh/webpack')
const { DefinePlugin, optimize: { LimitChunkCountPlugin } } = require('webpack')
const SRC = join(__dirname, 'src')

// Env vars
let commitHash = null
try { commitHash = require('child_process').execSync('git rev-parse HEAD').toString().trim() } catch (e) {}

const isDev = process.env.NODE_ENV === 'development'
const src = resolve(__dirname, 'src')

const baseConfig = {
  mode: isDev ? 'development' : 'production',
  entry: resolve(src, 'main.jsx'),
  output: {
    filename: isDev ? '[name].js' : '[contenthash].js',
    chunkFilename: isDev ? '[name].chk.js' : '[contenthash].js',
    path: resolve(__dirname, 'dist'),
    publicPath: '/dist/'
  },
  resolve: {
    extensions: [ '.js', '.jsx' ],
    alias: {
      '@components': resolve(__dirname, 'src', 'components'),
      '@styles': resolve(__dirname, 'src', 'styles'),
      '@assets': resolve(__dirname, 'src', 'assets'),
      '@constants': join(SRC, 'constants.js'),
    }
  },
  module: {
    strictExportPresence: true,
    rules: [
      {
        test: /\.jsx?/,
        include: src,
        use: [
          {
            loader: 'babel-loader',
            options: {
              cacheDirectory: true,
              cacheCompression: true,
              compact: true,
              presets: [ ['@babel/react', { runtime: 'automatic', importSource: 'preact' }] ],
              plugins: [
                '@babel/plugin-syntax-dynamic-import',
                '@babel/plugin-proposal-object-rest-spread',
                '@babel/plugin-proposal-class-properties',
                isDev ? '@prefresh/babel-plugin' : null
              ].filter(Boolean)
            }
          }
        ]
      },
      {
        test: /\.s?css$/,
        use: [
          {
            loader: MiniCSSExtractPlugin.loader,
            options: { hmr: isDev }
          },
          // If you want to disable css modules, remove the block below and uncomment this line.
          // 'css-loader',
          {
            loader: 'css-loader',
            options: {
              modules: {
                exportLocalsConvention: 'camelCaseOnly',
                localIdentName: '[local]-[hash:7]'
              }
            }
          },
          {
            loader: 'postcss-loader',
            options: { plugins: [ require('autoprefixer') ] }
          },
          'sass-loader'
        ]
      },
      {
        test: /\.(svg|mp4|webm|woff2?|eot|ttf|otf|wav|ico)$/,
        use: [
          {
            loader: 'file-loader',
            options: { name: '[hash:20].[ext]' }
          }
        ]
      },
      {
        test: /\.(png|jpe?g|gif)$/,
        use: [
          {
            loader: 'file-loader',
            options: { name: '[hash:20].[ext]' }
          },
          {
            loader: 'image-webpack-loader',
            options: {
              disable: isDev,
              mozjpeg: {
                progressive: true,
                quality: 95
              },
              optipng: { enabled: false },
              pngquant: {
                quality: [ 0.9, 1 ],
                speed: 4
              },
              gifsicle: {
                interlaced: true,
                optimizationLevel: 2
              }
            }
          }
        ]
      }
    ]
  },
  plugins: [
    new ManifestPlugin({
      writeToFileEmit: true,
      fileName: resolve(__dirname, 'http', 'dist', 'manifest.json')
    }),
    new MiniCSSExtractPlugin({
      filename: isDev ? '[name].css' : '[contenthash].css',
      chunkFilename: isDev ? '[name].css' : '[contenthash].css'
    }),
    new DefinePlugin({
      WEBPACK: {
        GIT_REVISION: JSON.stringify(commitHash)
      },
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV)
    })
  ],
  optimization: {
    minimize: !isDev,
    minimizer: [
      new TerserJSPlugin({
        extractComments: false,
        parallel: true,
        cache: true
      }),
      new OptimizeCSSAssetsPlugin({
        cssProcessorPluginOptions: {
          preset: [ 'default', {
            cssDeclarationSorter: true,
            discardUnused: true,
            mergeIdents: true,
            reduceIdents: true
          } ]
        }
      })
    ],
    splitChunks: {
      cacheGroups: {
        styles: {
          name: 'styles',
          test: /\.s?css$/,
          chunks: 'all',
          enforce: true
        }
      }
    }
  },
  devServer: {
    quiet: true,
    historyApiFallback: true,
    allowedHosts: [ 'localhost', '.ngrok.io' ], // Learn more about ngrok here: https://ngrok.com/
    proxy: { '/': `http://localhost:${process.env.PORT || 6969}` }
  }
}

if (isDev) {
  baseConfig.plugins.push(new FriendlyErrorsWebpackPlugin(), new PreactRefreshWebpackPlugin())
  module.exports = baseConfig
} else {
  baseConfig.plugins.push({
    apply: (compiler) =>
      compiler.hooks.compile.tap('cleanBuild', () => {
        if (existsSync(compiler.options.output.path)) {
          for (const filename of readdirSync(compiler.options.output.path)) {
            if (filename !== 'manifest.json') {
              unlinkSync(resolve(compiler.options.output.path, filename))
            }
          }
        }
      })
  })

  const nodeCfg = {
    ...baseConfig,
    entry: resolve(src, 'components', 'App.jsx'),
    output: {
      filename: 'App.js',
      chunkFilename: '[name].chk.js',
      libraryTarget: 'commonjs2',
      path: resolve(__dirname, 'http', 'dist'),
      publicPath: '/dist/'
    },
    plugins: [
      ...baseConfig.plugins.slice(1),
      new LimitChunkCountPlugin({ maxChunks: 1 })
    ],
    optimization: {
      ...baseConfig.optimization,
      minimize: false
    },
    target: 'node',
    externals: [ require('webpack-node-externals')() ],
    node: {
      __dirname: false,
      __filename: false
    }
  }

  module.exports = [ baseConfig, nodeCfg ]
}
