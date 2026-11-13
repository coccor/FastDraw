import React from 'react';
import { createRoot } from 'react-dom/client';
import { Landing } from './Landing.tsx';
import { installFonts } from '../fonts.ts';
import './landing.css';

// Links made by older `fastdraw open` point at the site root; the editor is at /edit/ now.
if (/[?&](serve|opfs|kind)=/.test(location.search)) location.replace('edit/' + location.search + location.hash);
else {
  installFonts();
  createRoot(document.getElementById('root')!).render(<Landing />);
}
