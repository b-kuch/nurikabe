import './styles.css';
import { App } from './ui/app';

new App();

// offline support / installability; the service worker only exists in production builds
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* offline play is a bonus; the game works without it */
    });
  });
}
