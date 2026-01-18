/**
 * @format
 */

import { AppRegistry } from 'react-native';
import App from './src/App';
import { name as appName } from './app.json';

// Polyfill for URL (required by some libraries)
import 'react-native-url-polyfill/auto';

AppRegistry.registerComponent(appName, () => App);
