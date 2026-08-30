import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { CampaignApp } from './app/campaign-app';
import './styles.css';

const root = document.querySelector<HTMLDivElement>('#root');

if (root === null) {
  throw new Error('Elemento raiz da aplicação não encontrado.');
}

createRoot(root).render(
  <StrictMode>
    <CampaignApp />
  </StrictMode>,
);
