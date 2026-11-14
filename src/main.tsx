import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import './index.css';

if (import.meta.env.DEV) {
  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    navigator.serviceWorker
      .getRegistrations()
      .then((regs) => {
        regs.forEach((reg) => {
          if (reg.active?.scriptURL.includes('dev-sw')) {
            void reg.unregister();
          }
        });
      })
      .catch(() => {});
  }
} else {
  registerSW({
    immediate: true,
  });
}

createRoot(document.getElementById('root')!).render(<App />);
