import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { PhaseZeroApp } from './app/phase-zero-app';
import './styles.css';

const root = document.querySelector<HTMLDivElement>('#root');

if (root === null) {
  throw new Error('Elemento raiz da aplicação não encontrado.');
}

createRoot(root).render(
  <StrictMode>
    <PhaseZeroApp />
  </StrictMode>,
);
