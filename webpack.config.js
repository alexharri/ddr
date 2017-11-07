module.exports = {
  entry: "./index.js",
  output: {
    filename: "bundle.js",
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: "babel-loader",
          options: {
            presets: ["env"],
            plugins: ["transform-object-rest-spread"],
          },
        },
      },
      {
        test: /\.css$/,
        use: ["style-loader", "css-loader"],
      },
    ],
  },
  devtool: (process.env.NODE_ENV === "production"
    ? "cheap-module-source-map"
    : "inline-sourcemap"),
  devServer: {
    contentBase: __dirname,
    watchOptions: {
      ignored: /node_modules/,
    },
  },
};
