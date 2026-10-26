import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { AppearanceSetting, AppearanceTheme } from '../../core/contracts/appearance';
import { applyDocumentTheme, toggledTheme } from './theme-model';
import { createThemeSynchronizer, type ThemeSynchronizer } from './theme-synchronizer';

interface ThemeContextValue {
  busy: boolean;
  error: string | null;
  theme: AppearanceTheme;
  toggleTheme(): Promise<void>;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const loadFailureMessage =
  'Não foi possível carregar a aparência salva. O modo diurno foi usado com segurança.';
const updateFailureMessage =
  'Não foi possível alterar a aparência. A configuração anterior foi mantida. Tente novamente.';

export function ThemeProvider({
  children,
  initialLoadFailed,
  initialSetting,
}: {
  children: ReactNode;
  initialLoadFailed: boolean;
  initialSetting: AppearanceSetting;
}): React.JSX.Element {
  const [setting, setSetting] = useState(initialSetting);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(initialLoadFailed ? loadFailureMessage : null);
  const mutationInFlight = useRef(false);
  const synchronizer = useRef<ThemeSynchronizer | null>(null);

  useEffect(() => {
    applyDocumentTheme(setting.theme, document.documentElement);
  }, [setting.theme]);

  useEffect(() => {
    const mountedSynchronizer = createThemeSynchronizer({
      gateway: window.campaignManager.appearance,
      initialSetting,
      onAccepted: (confirmed) => {
        setSetting(confirmed);
        applyDocumentTheme(confirmed.theme, document.documentElement);
        if (!mutationInFlight.current) setError(null);
      },
    });
    synchronizer.current = mountedSynchronizer;
    const stop = mountedSynchronizer.start();

    return () => {
      stop();
      if (synchronizer.current === mountedSynchronizer) synchronizer.current = null;
    };
  }, [initialSetting]);

  const toggleTheme = useCallback(async (): Promise<void> => {
    const themeSynchronizer = synchronizer.current;
    if (themeSynchronizer === null) return;
    if (mutationInFlight.current) return;
    mutationInFlight.current = true;
    setBusy(true);
    setError(null);
    const expected = themeSynchronizer.current();
    const nextTheme = toggledTheme(expected.theme);
    setSetting({ theme: nextTheme, revision: expected.revision });
    applyDocumentTheme(nextTheme, document.documentElement);

    try {
      const result = await window.campaignManager.appearance.setTheme({
        theme: nextTheme,
        revision: expected.revision,
      });
      if (result.ok) {
        themeSynchronizer.accept(result.data);
      } else {
        const confirmed = themeSynchronizer.current();
        setSetting(confirmed);
        applyDocumentTheme(confirmed.theme, document.documentElement);
        setError(updateFailureMessage);
      }
    } catch {
      const confirmed = themeSynchronizer.current();
      setSetting(confirmed);
      applyDocumentTheme(confirmed.theme, document.documentElement);
      setError(updateFailureMessage);
    } finally {
      mutationInFlight.current = false;
      setBusy(false);
    }
  }, []);

  return (
    <ThemeContext.Provider value={{ busy, error, theme: setting.theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (context === null) throw new Error('ThemeProvider não encontrado.');
  return context;
}
