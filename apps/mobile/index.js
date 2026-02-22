/**
 * @format
 */

// Polyfills for Hermes engine (must be before any library that uses them)
if (typeof globalThis.TextEncoder === 'undefined') {
  globalThis.TextEncoder = class TextEncoder {
    encode(str) {
      const buf = [];
      for (let i = 0; i < str.length; i++) {
        let c = str.charCodeAt(i);
        if (c < 0x80) {
          buf.push(c);
        } else if (c < 0x800) {
          buf.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
        } else if (c >= 0xd800 && c <= 0xdbff) {
          const hi = c;
          const lo = str.charCodeAt(++i);
          c = 0x10000 + ((hi - 0xd800) << 10) + (lo - 0xdc00);
          buf.push(
            0xf0 | (c >> 18),
            0x80 | ((c >> 12) & 0x3f),
            0x80 | ((c >> 6) & 0x3f),
            0x80 | (c & 0x3f)
          );
        } else {
          buf.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
        }
      }
      return new Uint8Array(buf);
    }
  };
}

if (typeof globalThis.TextDecoder === 'undefined') {
  globalThis.TextDecoder = class TextDecoder {
    decode(buf) {
      const bytes = new Uint8Array(buf);
      let result = '';
      let i = 0;
      while (i < bytes.length) {
        let c = bytes[i++];
        if (c < 0x80) {
          result += String.fromCharCode(c);
        } else if (c < 0xe0) {
          result += String.fromCharCode(((c & 0x1f) << 6) | (bytes[i++] & 0x3f));
        } else if (c < 0xf0) {
          result += String.fromCharCode(
            ((c & 0x0f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f)
          );
        } else {
          const cp =
            ((c & 0x07) << 18) |
            ((bytes[i++] & 0x3f) << 12) |
            ((bytes[i++] & 0x3f) << 6) |
            (bytes[i++] & 0x3f);
          const offset = cp - 0x10000;
          result += String.fromCharCode(0xd800 + (offset >> 10), 0xdc00 + (offset & 0x3ff));
        }
      }
      return result;
    }
  };
}

import 'react-native-url-polyfill/auto';

// Register LiveKit WebRTC globals for React Native
import { registerGlobals } from '@livekit/react-native';
registerGlobals();

import { AppRegistry } from 'react-native';
import App from './src/App';
import { name as appName } from './app.json';

AppRegistry.registerComponent(appName, () => App);
