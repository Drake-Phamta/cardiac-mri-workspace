// Must stay the first import: fast-png needs a latin1 TextDecoder when it loads, and Hermes has none.
import './src/lib/textDecoderLatin1.mjs';
import { registerRootComponent } from 'expo';

import App from './App';

registerRootComponent(App);
