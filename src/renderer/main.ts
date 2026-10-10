import '@fontsource/fraunces/500.css';
import '@fontsource/fraunces/600.css';
import '@fontsource/outfit/400.css';
import '@fontsource/outfit/500.css';
import '@fontsource/outfit/600.css';
import './styles.css';
import { startKiosk } from './app';

void startKiosk().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'The kiosk could not start.';
  document.body.textContent = message;
});
