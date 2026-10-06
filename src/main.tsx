import { createRoot } from 'react-dom/client';
import '@fontsource/gowun-dodum/korean-400.css';
import '@fontsource/gowun-dodum/latin-400.css';
import '@fontsource-variable/fraunces/soft.css';
import './styles/app.css';
import { App } from './app/App';
import { startRuntime } from './app/runtime';
import { initAds } from './ads';

startRuntime();
const mount = document.getElementById('app-stage');
if (mount) {
  mount.classList.add('mounted');
  createRoot(mount).render(<App />);
}
initAds();
