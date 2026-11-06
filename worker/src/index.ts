// Worker entry. Workers only allow handler exports from the entry module, so the app,
// its constants and types live in ./app (also imported by the tests).
import { createApp } from './app';

export default createApp();
