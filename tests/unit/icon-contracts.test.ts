import { describe, expect, it } from 'vitest';
import { iconCatalog, iconIds, iconIdSchema } from '../../src/core/contracts/icons';

describe('catálogo de ícones', () => {
  it('expõe os 20 identificadores estáveis com rótulos PT-BR únicos', () => {
    expect(iconCatalog).toHaveLength(20);
    expect(new Set(iconIds).size).toBe(20);
    expect(new Set(iconCatalog.map(({ label }) => label)).size).toBe(20);
    expect(iconCatalog.map(({ label }) => label)).toEqual([
      'Pessoa',
      'Grupo',
      'Coroa',
      'Caveira',
      'Localização',
      'Construção',
      'Montanha',
      'Floresta',
      'Casa',
      'Escudo',
      'Espadas',
      'Magia',
      'Pacote',
      'Joia',
      'Livro',
      'Pergaminho',
      'Olho',
      'Bandeira',
      'Estrela',
      'Rede',
    ]);
  });

  it('rejeita valores fora do catálogo', () => {
    for (const id of iconIds) expect(iconIdSchema.parse(id)).toBe(id);
    for (const value of ['', 'none', 'pessoa', '🧙', '<svg />']) {
      expect(() => iconIdSchema.parse(value)).toThrow();
    }
  });
});
