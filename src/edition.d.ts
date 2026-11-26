// Set to true by vite.local.config.ts for the editor `fastdraw open` serves from this computer, which leaves out
// what only the editor at fastdraw.dev has. Undefined everywhere else (the site, the command line, tests).
declare const __FASTDRAW_LOCAL__: boolean | undefined;
