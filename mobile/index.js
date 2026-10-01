import { registerRootComponent } from 'expo';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App)
// and sets the environment up the same way in a dev client and a release APK.
registerRootComponent(App);
