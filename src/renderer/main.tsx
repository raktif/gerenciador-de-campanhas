import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { CampaignApp } from './app/campaign-app';
import { NavigationProvider } from './app/navigation-provider';
import { ThemeProvider } from './theme/theme-provider';
import { applyDocumentTheme, loadInitialAppearance } from './theme/theme-model';
import '@xyflow/react/dist/style.css';
import './styles.css';

const root = document.querySelector<HTMLDivElement>('#root');

if (root === null) {
  throw new Error('Elemento raiz da aplicação não encontrado.');
}

void startRenderer(root);

async function startRenderer(rootElement: HTMLDivElement): Promise<void> {
  const initialAppearance = await loadInitialAppearance(window.campaignManager.appearance);
  applyDocumentTheme(initialAppearance.setting.theme, document.documentElement);

  createRoot(rootElement).render(
    <StrictMode>
      <ThemeProvider
        initialLoadFailed={initialAppearance.loadFailed}
        initialSetting={initialAppearance.setting}
      >
        <NavigationProvider>
          <CampaignApp />
        </NavigationProvider>
      </ThemeProvider>
    </StrictMode>,
  );
}
