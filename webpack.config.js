const path = require('path');

module.exports = {
  mode: 'production',
  entry: {
    contentScript: './src/contentScript.ts',
    background: './src/background.ts',
    options: './src/options.ts',
    popup: './src/popup.ts',
    llmExtractor: './src/extractors/llmExtractor.ts'
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
    alias: {
      '@handlers': path.resolve(__dirname, 'src/handlers/'),
      '@extractors': path.resolve(__dirname, 'src/extractors/'),
      '@utils': path.resolve(__dirname, 'src/utils/'),
      '@types': path.resolve(__dirname, 'src/types.ts')
    }
  },
  output: {
    filename: '[name].js',
    path: path.resolve(__dirname, 'dist'),
  },
};