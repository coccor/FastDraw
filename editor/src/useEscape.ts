import { useEffect, useRef } from 'react';

// Escape closes a dialog, wherever the focus is in it (a text box too). The listener is added once, in the
// capture phase, so it sees the key before the editor's own handler does; it stops the key there, so closing a
// dialog does not also clear the selection. It calls the latest onClose without being added again: a listener
// replaced while the key is being handled (the editor re-renders on Escape) would miss that very key.
export function useEscape(onClose: () => void) {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); close.current(); } };
    window.addEventListener('keydown', k, true);
    return () => window.removeEventListener('keydown', k, true);
  }, []);
}
