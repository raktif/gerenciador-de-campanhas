import { z } from 'zod';

export const iconCatalog = [
  { id: 'person', label: 'Pessoa' },
  { id: 'group', label: 'Grupo' },
  { id: 'crown', label: 'Coroa' },
  { id: 'skull', label: 'Caveira' },
  { id: 'location', label: 'Localização' },
  { id: 'building', label: 'Construção' },
  { id: 'mountain', label: 'Montanha' },
  { id: 'forest', label: 'Floresta' },
  { id: 'house', label: 'Casa' },
  { id: 'shield', label: 'Escudo' },
  { id: 'swords', label: 'Espadas' },
  { id: 'magic', label: 'Magia' },
  { id: 'package', label: 'Pacote' },
  { id: 'gem', label: 'Joia' },
  { id: 'book', label: 'Livro' },
  { id: 'scroll', label: 'Pergaminho' },
  { id: 'eye', label: 'Olho' },
  { id: 'flag', label: 'Bandeira' },
  { id: 'star', label: 'Estrela' },
  { id: 'network', label: 'Rede' },
] as const;

export const iconIds = iconCatalog.map(({ id }) => id) as [
  (typeof iconCatalog)[number]['id'],
  ...(typeof iconCatalog)[number]['id'][],
];

export const iconIdSchema = z.enum(iconIds);
export type IconId = z.infer<typeof iconIdSchema>;
