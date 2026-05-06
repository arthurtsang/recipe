module.exports = {
  default: {
    require: ['support/**/*.ts', 'step-definitions/**/*.ts'],
    requireModule: ['ts-node/register'],
    format: [
      'progress-bar',
      '@cucumber/pretty-formatter',
    ],
    formatOptions: { snippetInterface: 'async-await' },
    paths: ['features/**/*.feature'],
  },
};
