import { useTheme } from './theme-provider';

export function ThemeToggle(): React.JSX.Element {
  const themeContext = useTheme();
  const { busy, error, theme } = themeContext;

  return (
    <div className="theme-control max-w-sm text-right">
      <div
        className="flex min-h-11 items-center justify-end gap-2"
        role="group"
        aria-label="Aparência"
      >
        <span aria-hidden="true" className="theme-control-icon">
          ☀
        </span>
        <button
          aria-busy={busy || undefined}
          aria-checked={theme === 'dark'}
          aria-disabled={busy || undefined}
          aria-label="Modo noturno"
          className="theme-switch size-11 shrink-0 rounded-full focus-visible:outline-2 focus-visible:outline-offset-2"
          onClick={() => void themeContext.toggleTheme()}
          role="switch"
          type="button"
        >
          <span aria-hidden="true" className="theme-switch-track">
            <span className="theme-switch-thumb" />
          </span>
        </button>
        <span aria-hidden="true" className="theme-control-icon">
          ☾
        </span>
      </div>
      {error === null ? null : (
        <p className="theme-control-error mt-2 text-sm" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
