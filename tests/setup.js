const { TextEncoder, TextDecoder } = require('util');
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

global.chrome = {
  runtime: {
    getURL: (path) => path,
    sendMessage: jest.fn(),
    onMessage: {
      addListener: jest.fn()
    },
    openOptionsPage: jest.fn()
  },
  storage: {
    sync: {
      get: jest.fn(),
      set: jest.fn()
    },
    local: {
      get: jest.fn(),
      set: jest.fn()
    }
  }
};

const rewire = require('rewire');
