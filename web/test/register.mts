/** Installs the resolution hooks. Wired in via `--import` in the test script. */
import { register } from 'node:module';

register('./loader.mts', import.meta.url);
