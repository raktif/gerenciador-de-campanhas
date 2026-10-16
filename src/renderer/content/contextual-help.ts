import type { ContextualHelpContent } from '../components/contextual-help';
import type { FieldDefinition } from '../../core/contracts/field-definitions';

export type ContextualHelpKey =
  | 'fieldDefinition.dataType'
  | 'narrative.canonState'
  | 'narrative.knowledgeState'
  | 'narrative.visibility'
  | 'narrative.originKind'
  | 'narrative.sourceSession';

export const contextualHelpCatalog = {
  'fieldDefinition.dataType': {
    description: 'Define o formato das informações que este campo poderá armazenar.',
    purpose: 'Determina o controle exibido ao preencher uma Entidade e como o valor será validado.',
    example:
      'Use “Texto longo” para descrições extensas e “Número” para valores usados em cálculos.',
    consequence:
      'Trocar o tipo depois que o campo estiver em uso pode tornar valores existentes incompatíveis.',
  },
  'narrative.canonState': {
    description: 'Indica o nível de confirmação editorial deste registro na campanha.',
    purpose: 'Diferencia um rascunho de uma informação aceita, rejeitada ou arquivada.',
    example: 'Marque como “Aceito” depois de confirmar que o acontecimento pertence ao cânone.',
    consequence: 'O estado não altera o conteúdo, mas orienta como ele deve ser revisado e apresentado.',
  },
  'narrative.knowledgeState': {
    description: 'Indica como a informação existe dentro da campanha, independentemente de estar escrita.',
    purpose: 'Distingue fatos confirmados de rumores, suspeitas, segredos e possibilidades.',
    example:
      '“Os cabos pertencem à Rede Bélica” pode começar como Possibilidade e depois ser confirmado como Fato.',
    consequence: 'A classificação ajuda a evitar que uma hipótese seja tratada como verdade durante a preparação.',
  },
  'narrative.visibility': {
    description: 'Define para qual público a informação pode ser exibida.',
    purpose: 'Separa anotações exclusivas do mestre, conteúdo dos jogadores e conteúdo público.',
    example: 'Use “Somente mestre” para o segredo de um antagonista ainda não revelado.',
    consequence: 'Escolha a visibilidade com cuidado para não expor informações antes da hora.',
  },
  'narrative.originKind': {
    description: 'Registra de onde esta informação veio.',
    purpose: 'Preserva a proveniência para que seja possível entender e revisar a fonte do registro.',
    example: 'Selecione “Sessão” para uma descoberta feita em jogo ou “Importação” para conteúdo trazido de fora.',
    consequence: 'Ao escolher Sessão, selecione a sessão correspondente desta campanha.',
  },
  'narrative.sourceSession': {
    description: 'Seleciona a sessão desta campanha que deu origem à informação.',
    purpose: 'Vincula o registro ao acontecimento de jogo sem expor identificadores técnicos.',
    example: 'Escolha “Sessão 12 — A Mina de Kabotya” para um evento ocorrido nessa sessão.',
    consequence: 'A sessão escolhida passa a compor a proveniência do registro.',
  },
} as const satisfies Record<ContextualHelpKey, ContextualHelpContent>;

export function fieldDefinitionHelpContent(
  field: Pick<FieldDefinition, 'helpText' | 'exampleText'>,
): ContextualHelpContent | null {
  if (field.helpText === null && field.exampleText === null) return null;
  return {
    ...(field.helpText === null ? {} : { description: field.helpText }),
    ...(field.exampleText === null ? {} : { example: field.exampleText }),
  };
}
