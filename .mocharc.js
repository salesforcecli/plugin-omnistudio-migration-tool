module.exports = {
  extension: ['ts'],
  spec: ['src/**/__tests__/**/*.test.ts', 'test/**/*.test.ts'],
  ignore: ['**/node_modules/**', '**/@jest/**'],
  require: ['ts-node/register'],
  timeout: 5000,
};
