import { useEffect } from 'react';

/* iOS Safari does not shrink the layout viewport when the soft keyboard opens,
   so 100dvh alone would leave the chat composer behind the keyboard. */
export function useKeyboardViewport() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const root = document.documentElement;
    const update = () => {
      const keyboardOpen = window.innerHeight - vv.height > 120;
      if (keyboardOpen) {
        root.style.setProperty('--vvh', `${Math.round(vv.height)}px`);
        root.dataset.keyboard = 'true';
      } else {
        root.style.removeProperty('--vvh');
        delete root.dataset.keyboard;
      }
    };
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      root.style.removeProperty('--vvh');
      delete root.dataset.keyboard;
    };
  }, []);
}