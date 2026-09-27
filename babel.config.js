module.exports = function (api) {
  api.cache(true);

  // Jest component tests assert behavior, not NativeWind's platform styling runtime.
  const presets = [['babel-preset-expo']];
  if (process.env.NODE_ENV !== 'test') presets.push('nativewind/babel');

  return {
    presets,

    plugins: [
      [
        'module-resolver',
        {
          root: ['./'],

          alias: {
            '@': './',
            'tailwind.config': './tailwind.config.js',
          },
        },
      ],
      'react-native-worklets/plugin',
    ],
  };
};
