const path = require('path');

/*
 * dist/ also holds the minified stylesheet build-css.js writes, so webpack does not clean the
 * directory: a watch rebuild would delete a file it knows nothing about.
 */

const babel = {
    test: /\.jsx?$/,
    exclude: /node_modules/,
    use: {
        loader: 'babel-loader',
        options: {
            presets: [
                ['@babel/preset-env', { targets: '> 1%, not dead' }],
                ['@babel/preset-react', { runtime: 'classic' }],
            ],
        },
    },
};

module.exports = {
    mode: 'production',
    devtool: false,
    resolve: { extensions: ['.js', '.jsx'] },
    module: { rules: [babel] },
    entry: { builder: './client/builder/index.js' },
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: '[name].min.js',
    },
    // Divi already ships these in the builder; bundling them would load React twice.
    externals: {
        react: 'React',
        '@wordpress/i18n': ['wp', 'i18n'],
    },
};
