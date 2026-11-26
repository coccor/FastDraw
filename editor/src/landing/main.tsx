import React from 'react';
import { createRoot } from 'react-dom/client';
import { Landing } from './Landing.tsx';
import { installFonts } from '../fonts.ts';
import './landing.css';

// Links made by older `fastdraw open` point at the site root; the editor is at /edit/ now. A `fastdraw open`
// link pointed at the root carries `serve=` after the # instead.
if (/[?&](serve|opfs|kind)=/.test(location.search) || /^#(.*&)?serve=/.test(location.hash)) location.replace('edit/' + location.search + location.hash);
else {
  installFonts();
  createRoot(document.getElementById('root')!).render(<Landing />);
}
