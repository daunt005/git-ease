import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { applyTextScale, loadWorkspace } from './workspace.ts';
import './styles.css';

applyTextScale(loadWorkspace().textScale);

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
