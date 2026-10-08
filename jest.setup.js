const util = require('util');

if (util.TextDecoder) {
  global.TextDecoder = util.TextDecoder;
}
if (util.TextEncoder) {
  global.TextEncoder = util.TextEncoder;
}

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest')
);
