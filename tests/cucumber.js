module.exports = {
  default: {
    require: ['support/**/*.ts', 'step-definitions/**/*.ts'],
    requireModule: ['tsx/cjs'],
    format: ['progress-bar', '@cucumber/pretty-formatter'],
    formatOptions: { snippetInterface: 'async-await' },
    tags: process.env.CUCUMBER_TAGS || '@api',
  },
};
