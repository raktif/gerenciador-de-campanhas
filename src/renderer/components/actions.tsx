import { forwardRef, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from 'react';

export type ButtonVariant =
  'primary' | 'secondary' | 'danger' | 'ghost' | 'link' | 'dark-navigation';
export type ButtonSize = 'inline' | 'small' | 'medium' | 'large';
export type IconButtonSize = Exclude<ButtonSize, 'inline'>;

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  busy?: boolean;
  fullWidth?: boolean;
  size?: ButtonSize;
  variant?: ButtonVariant;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    busy = false,
    className,
    disabled = false,
    fullWidth = false,
    size = 'medium',
    type = 'button',
    variant = 'secondary',
    ...props
  },
  ref,
) {
  return (
    <button
      {...props}
      aria-busy={busy || undefined}
      className={buttonClassName({ className, fullWidth, size, variant })}
      disabled={disabled || busy}
      ref={ref}
      type={type}
    />
  );
});

export interface IconButtonProps extends Omit<
  ButtonProps,
  'aria-label' | 'children' | 'fullWidth' | 'size'
> {
  'aria-label': string;
  children: ReactNode;
  size?: IconButtonSize;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  {
    'aria-label': ariaLabel,
    busy = false,
    children,
    className,
    disabled = false,
    size = 'medium',
    type = 'button',
    variant = 'secondary',
    ...props
  },
  ref,
) {
  return (
    <button
      {...props}
      aria-busy={busy || undefined}
      aria-label={ariaLabel}
      className={iconButtonClassName({ className, size, variant })}
      disabled={disabled || busy}
      ref={ref}
      type={type}
    >
      {children}
    </button>
  );
});

interface ActionGroupProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export interface ButtonGroupProps extends ActionGroupProps {
  'aria-label': string;
  align?: 'start' | 'center' | 'end';
}

export const ButtonGroup = forwardRef<HTMLDivElement, ButtonGroupProps>(function ButtonGroup(
  { 'aria-label': ariaLabel, align = 'start', children, className, role = 'group', ...props },
  ref,
) {
  return (
    <div
      {...props}
      aria-label={ariaLabel}
      className={joinClassNames(
        'flex flex-wrap items-center gap-3',
        groupAlignmentClassNames[align],
        className,
      )}
      ref={ref}
      role={role}
    >
      {children}
    </div>
  );
});

export interface FormActionsProps extends ActionGroupProps {
  'aria-label'?: string;
  layout?: 'end' | 'between';
}

export const FormActions = forwardRef<HTMLDivElement, FormActionsProps>(function FormActions(
  {
    'aria-label': ariaLabel = 'Ações do formulário',
    children,
    className,
    layout = 'end',
    role = 'group',
    ...props
  },
  ref,
) {
  return (
    <div
      {...props}
      aria-label={ariaLabel}
      className={joinClassNames(
        'action-group-divider flex flex-wrap items-center gap-3 border-t pt-6',
        formActionLayoutClassNames[layout],
        className,
      )}
      ref={ref}
      role={role}
    >
      {children}
    </div>
  );
});

export interface DialogActionsProps extends ActionGroupProps {
  'aria-label'?: string;
}

export const DialogActions = forwardRef<HTMLDivElement, DialogActionsProps>(function DialogActions(
  { 'aria-label': ariaLabel = 'Ações do diálogo', children, className, role = 'group', ...props },
  ref,
) {
  return (
    <div
      {...props}
      aria-label={ariaLabel}
      className={joinClassNames('flex flex-wrap items-center justify-end gap-3', className)}
      ref={ref}
      role={role}
    >
      {children}
    </div>
  );
});

export interface ToolbarActionsProps extends ActionGroupProps {
  'aria-label': string;
}

export const ToolbarActions = forwardRef<HTMLDivElement, ToolbarActionsProps>(
  function ToolbarActions(
    { 'aria-label': ariaLabel, children, className, role = 'group', ...props },
    ref,
  ) {
    return (
      <div
        {...props}
        aria-label={ariaLabel}
        className={joinClassNames('flex flex-wrap items-center gap-3', className)}
        ref={ref}
        role={role}
      >
        {children}
      </div>
    );
  },
);

function buttonClassName({
  className,
  fullWidth,
  size,
  variant,
}: {
  className?: string | undefined;
  fullWidth: boolean;
  size: ButtonSize;
  variant: ButtonVariant;
}): string {
  return joinClassNames(
    buttonBaseClassName,
    buttonSizeClassNames[size],
    buttonVariantClassNames[variant],
    fullWidth ? 'w-full' : undefined,
    className,
  );
}

function iconButtonClassName({
  className,
  size,
  variant,
}: {
  className?: string | undefined;
  size: IconButtonSize;
  variant: ButtonVariant;
}): string {
  return joinClassNames(
    buttonBaseClassName,
    iconButtonSizeClassNames[size],
    buttonVariantClassNames[variant],
    'shrink-0 p-0',
    className,
  );
}

function joinClassNames(...classNames: (string | undefined)[]): string {
  return classNames.filter((className) => className !== undefined && className !== '').join(' ');
}

const buttonBaseClassName =
  'inline-flex max-w-full items-center justify-center gap-2 text-center whitespace-normal transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60';

const buttonSizeClassNames: Record<ButtonSize, string> = {
  inline: 'min-h-0 rounded-none p-0 text-[inherit] leading-[inherit]',
  small: 'min-h-9 rounded-lg px-3 py-1.5 text-sm font-semibold leading-5',
  medium: 'min-h-11 rounded-xl px-4 py-2.5 text-sm font-semibold leading-5',
  large: 'min-h-12 rounded-xl px-5 py-3 text-base font-semibold leading-5',
};

const iconButtonSizeClassNames: Record<IconButtonSize, string> = {
  small: 'size-11 rounded-lg text-sm font-semibold',
  medium: 'size-11 rounded-xl text-sm font-semibold',
  large: 'size-12 rounded-xl text-base font-semibold',
};

const buttonVariantClassNames: Record<ButtonVariant, string> = {
  primary: 'action-button--primary border',
  secondary: 'action-button--secondary border',
  danger: 'action-button--danger border',
  ghost: 'action-button--ghost border',
  link: 'action-button--link border underline-offset-4',
  'dark-navigation': 'action-button--dark-navigation border',
};

const groupAlignmentClassNames: Record<NonNullable<ButtonGroupProps['align']>, string> = {
  start: 'justify-start',
  center: 'justify-center',
  end: 'justify-end',
};

const formActionLayoutClassNames: Record<NonNullable<FormActionsProps['layout']>, string> = {
  end: 'justify-end',
  between: 'justify-between',
};
