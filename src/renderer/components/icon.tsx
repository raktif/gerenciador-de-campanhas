import { iconIdSchema, type IconId } from '../../core/contracts/icons';

type IconProps = {
  className?: string;
  value: string | null;
};

export function Icon({ className = 'size-5', value }: IconProps): React.JSX.Element {
  if (value === null)
    return (
      <span aria-hidden="true" className={className} data-icon-fallback="none">
        —
      </span>
    );

  const parsed = iconIdSchema.safeParse(value);
  if (!parsed.success)
    return (
      <span aria-hidden="true" className={className} data-icon-fallback="legacy">
        ?
      </span>
    );

  return (
    <svg
      aria-hidden="true"
      className={className}
      data-icon-id={parsed.data}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      {iconPaths[parsed.data].map((path) => (
        <path d={path} key={path} />
      ))}
    </svg>
  );
}

export const iconPaths: Readonly<Record<IconId, readonly string[]>> = {
  person: ['M20 21a8 8 0 0 0-16 0', 'M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8'],
  group: [
    'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2',
    'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8',
    'M22 21v-2a4 4 0 0 0-3-3.87',
    'M16 3.13a4 4 0 0 1 0 7.75',
  ],
  crown: ['M3 18h18', 'M5 18 3 6l5 4 4-6 4 6 5-4-2 12Z'],
  skull: [
    'M12 2a8 8 0 0 0-5 14.25V21h10v-4.75A8 8 0 0 0 12 2Z',
    'M9 11h.01',
    'M15 11h.01',
    'M10 17v4',
    'M14 17v4',
  ],
  location: ['M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z', 'M12 10h.01'],
  building: ['M3 21h18', 'M6 21V3h12v18', 'M9 7h2', 'M13 7h2', 'M9 11h2', 'M13 11h2', 'M10 21v-5h4v5'],
  mountain: ['m3 20 6-10 4 6 2-3 6 7Z', 'm9 10 3-5 4 7'],
  forest: ['M12 22V8', 'm7 12 5-10 5 10', 'm5 17 7-12 7 12', 'M5 22h14'],
  house: ['m3 11 9-8 9 8', 'M5 10v11h14V10', 'M9 21v-7h6v7'],
  shield: ['M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z'],
  swords: ['m14.5 4.5 5-2-2 5-9 9-3 1 1-3 9-9Z', 'm5 5 14 14', 'm14 18 4-4', 'm6 10 4-4'],
  magic: ['m15 4 5 5L8 21l-5-5Z', 'm14 5 5 5', 'M6 3v4', 'M4 5h4', 'M19 15v4', 'M17 17h4'],
  package: ['m3 7 9 5 9-5-9-5Z', 'm3 7 9 5 9-5v10l-9 5-9-5Z', 'M12 12v10'],
  gem: ['m6 3-4 6 10 12L22 9l-4-6Z', 'M2 9h20', 'm9 3-3 6 6 12 6-12-3-6'],
  book: ['M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5Z', 'M4 5.5v14', 'M8 7h8'],
  scroll: ['M6 3h12v15a3 3 0 0 1-3 3H6a3 3 0 0 0 3-3V6a3 3 0 0 0-3-3Z', 'M9 7h6', 'M9 11h6'],
  eye: ['M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z', 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z'],
  flag: ['M5 22V4', 'M5 4h12l-2 4 2 4H5'],
  star: ['m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8-6.1-3.2-6.1 3.2 1.2-6.8-5-4.9 6.9-1Z'],
  network: ['M12 7a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z', 'M5 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z', 'M19 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z', 'M12 7v4', 'm10 12-5 6', 'm14 12 5 6'],
};
