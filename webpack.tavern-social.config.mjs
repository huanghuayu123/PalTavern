import HtmlWebpackPlugin from 'html-webpack-plugin';
import MiniCssExtractPlugin from 'mini-css-extract-plugin';
import path from 'node:path';
import TerserPlugin from 'terser-webpack-plugin';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));

export default (_env, argv) => ({
  experiments: {
    outputModule: true,
  },
  devtool: argv.mode === 'production' ? 'source-map' : 'eval-source-map',
  entry: path.join(root, 'src', 'independent-chat', 'index.ts'),
  target: 'browserslist',
  output: {
    filename: 'index.js',
    path: path.join(root, 'dist', 'independent-chat'),
    clean: true,
    publicPath: './',
    library: {
      type: 'module',
    },
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
      scriptLoading: 'module',
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
          ? { format: { quote_style: 1 } }
          : { format: { beautify: true, indent_level: 2 }, compress: false, mangle: false },
      }),
    ],
  },
});
