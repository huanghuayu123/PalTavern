import HtmlWebpackPlugin from 'html-webpack-plugin';
import MiniCssExtractPlugin from 'mini-css-extract-plugin';
import path from 'node:path';
import TerserPlugin from 'terser-webpack-plugin';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));

export default (_env, argv) => ({
  devtool: argv.mode === 'production' ? 'source-map' : 'eval-source-map',
  entry: path.join(root, 'src', 'independent-chat', 'index.ts'),
  target: ['web', 'es2015'],
  output: {
    filename: 'index.js',
    path: path.join(root, 'dist', 'independent-chat'),
    clean: true,
    publicPath: './',
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        loader: 'ts-loader',
        options: {
          transpileOnly: true,
          onlyCompileBundledFiles: true,
          compilerOptions: {
            target: 'ES2015',
            noUnusedLocals: false,
            noUnusedParameters: false,
          },
        },
        exclude: /node_modules/,
      },
      {
        test: /\.css$/,
        use: [
          MiniCssExtractPlugin.loader,
          { loader: 'css-loader', options: { url: false } },
          'postcss-loader',
        ],
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.css'],
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: path.join(root, 'src', 'independent-chat', 'index.html'),
      filename: 'index.html',
      scriptLoading: 'defer',
      cache: false,
    }),
    new MiniCssExtractPlugin({ filename: 'index.css' }),
  ],
  optimization: {
    minimize: true,
    minimizer: [
      new TerserPlugin({
        extractComments: false,
        terserOptions: argv.mode === 'production'
          ? { ecma: 2015, compress: { ecma: 2015 }, format: { ecma: 2015, quote_style: 1 } }
          : { ecma: 2015, format: { ecma: 2015, beautify: true, indent_level: 2 }, compress: false, mangle: false },
      }),
    ],
  },
});
