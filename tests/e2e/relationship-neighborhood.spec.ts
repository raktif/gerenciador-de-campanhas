import { createRequire } from 'node:module';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Locator,
  type Page,
} from '@playwright/test';
import type { CampaignManagerGateway } from '../../src/core/contracts/gateway';
import type { RelationshipViewState } from '../../src/core/contracts/relationship-views';

const repositoryRoot = process.cwd();
const requireFromRepository = createRequire(path.join(repositoryRoot, 'package.json'));
const electronExecutable = requireFromRepository('electron') as string;

test('navega pela vizinhança com profundidade, direção inversa e filtros', async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'rpg-neighborhood-e2e-'));
  let application: ElectronApplication | null = null;
  try {
    application = await launch(dataDirectory);
    const window = await application.firstWindow();
    await window.getByRole('button', { name: 'Criar primeira campanha' }).click();
    await window.getByLabel('Nome da campanha').fill('Ethéria');
    await window.getByRole('button', { name: 'Criar campanha', exact: true }).click();
    await window.getByRole('button', { name: 'Abrir campanha Ethéria' }).click();
    await window.getByRole('button', { name: 'Gerenciar tipos de entidade' }).click();
    await window.getByRole('button', { name: 'Criar primeiro tipo' }).click();
    await window.getByLabel('Nome plural').fill('Personagens');
    await window.getByLabel('Nome singular').fill('Personagem');
    await window.getByLabel('Identificador (slug)').fill('personagens');
    await window.getByRole('button', { name: 'Criar tipo de entidade' }).click();
    await window.getByRole('button', { name: 'Voltar para detalhes da campanha' }).click();
    await window.getByRole('button', { name: 'Ver entidades' }).click();
    for (const name of ['Gorel', 'Kabotya', 'Cabos Antigos']) await createEntity(window, name);
    await window.getByRole('button', { name: 'Voltar para detalhes da campanha' }).click();
    await window.getByRole('button', { name: 'Tipos de relação' }).click();
    await window.getByRole('button', { name: 'Novo tipo de relação' }).click();
    await window.getByLabel('Nome *').fill('Conhece');
    await window.getByLabel('Slug *').fill('conhece');
    await window.getByLabel('Nome inverso', { exact: true }).fill('É conhecido por');
    await window.getByRole('button', { name: 'Criar tipo' }).click();
    await window.getByRole('button', { name: 'Voltar para detalhes da campanha' }).click();
    await window.getByRole('button', { name: 'Relações', exact: true }).click();
    await createRelationship(window, 'Gorel', 'Kabotya');
    await createRelationship(window, 'Kabotya', 'Cabos Antigos');

    await window.getByLabel('Entidade central').selectOption({ label: 'Gorel' });
    const list = window.getByTestId('neighborhood-text-list');
    await list.locator('summary').click();
    await expect(list).toContainText('Gorel — Conhece → Kabotya');
    await expect(list).not.toContainText('Cabos Antigos');
    await window.getByLabel('Profundidade').selectOption('2');
    await expect(list).toContainText('Kabotya — Conhece → Cabos Antigos');
    await expect(window.getByTestId('neighborhood-graph-edge')).toHaveCount(2);
    const canvas = window.getByTestId('relationship-canvas');
    await expect(canvas.getByRole('button', { name: 'Ampliar mapa' })).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Organizar automaticamente' })).toBeVisible();
    const gorelNode = canvas.locator('.react-flow__node').filter({ hasText: 'Gorel' }).first();
    await expect(gorelNode).toBeVisible();
    const gorelId = await gorelNode.getAttribute('data-id');
    if (gorelId === null) throw new Error('O nó central não possui identificador.');
    const beforeDrag = await readRelationshipLayout(window, 'Ethéria');
    const initialBox = await gorelNode.boundingBox();
    if (initialBox === null) throw new Error('O nó central não possui dimensões para arraste.');
    await window.mouse.move(
      initialBox.x + initialBox.width / 2,
      initialBox.y + initialBox.height / 2,
    );
    await window.mouse.down();
    await window.mouse.move(
      initialBox.x + initialBox.width / 2 + 90,
      initialBox.y + initialBox.height / 2 + 45,
      { steps: 8 },
    );
    await window.mouse.up();
    await expect
      .poll(async () => (await readRelationshipLayout(window, 'Ethéria')).view.revision)
      .toBeGreaterThan(beforeDrag.view.revision);
    const afterDrag = await readRelationshipLayout(window, 'Ethéria');
    const draggedNode = requireLayoutNode(afterDrag, gorelId);
    expect(draggedNode.pinned).toBe(true);
    const persistedTransform = await nodeTransform(gorelNode);
    expect(nodeCoordinates(persistedTransform)).toEqual({ x: draggedNode.x, y: draggedNode.y });

    await window.getByRole('button', { name: 'Voltar para detalhes da campanha' }).click();
    await window.getByRole('button', { name: 'Relações', exact: true }).click();
    await window.getByLabel('Entidade central').selectOption({ label: 'Gorel' });
    await window.getByLabel('Profundidade').selectOption('2');
    await list.locator('summary').click();
    const reopenedCanvas = window.getByTestId('relationship-canvas');
    const reopenedGorelNode = reopenedCanvas
      .locator('.react-flow__node')
      .filter({ hasText: 'Gorel' })
      .first();
    await expect(reopenedGorelNode).toBeVisible();
    await expect.poll(() => nodeTransform(reopenedGorelNode)).toBe(persistedTransform);
    const beforeKeyboard = await readRelationshipLayout(window, 'Ethéria');
    const beforeKeyboardNode = requireLayoutNode(beforeKeyboard, gorelId);
    await reopenedGorelNode.press('Enter');
    await reopenedGorelNode.press('ArrowRight');
    await expect
      .poll(async () => (await readRelationshipLayout(window, 'Ethéria')).view.revision)
      .toBeGreaterThan(beforeKeyboard.view.revision);
    const afterKeyboard = await readRelationshipLayout(window, 'Ethéria');
    const keyboardNode = requireLayoutNode(afterKeyboard, gorelId);
    expect(keyboardNode).toMatchObject({
      x: beforeKeyboardNode.x + 5,
      y: beforeKeyboardNode.y,
      pinned: true,
    });
    await expect
      .poll(async () => nodeCoordinates(await nodeTransform(reopenedGorelNode)).x)
      .toBe(keyboardNode.x);
    const beforeZoom = afterKeyboard;
    await reopenedCanvas.getByRole('button', { name: 'Ampliar mapa' }).click();
    await expect
      .poll(async () => (await readRelationshipLayout(window, 'Ethéria')).view.revision)
      .toBeGreaterThan(beforeZoom.view.revision);
    const afterZoom = await readRelationshipLayout(window, 'Ethéria');
    expect(afterZoom.view.viewport.zoom).toBeGreaterThan(beforeZoom.view.viewport.zoom);
    await reopenedCanvas.getByRole('button', { name: 'Organizar automaticamente' }).click();
    await expect
      .poll(async () => (await readRelationshipLayout(window, 'Ethéria')).view.revision)
      .toBeGreaterThan(afterZoom.view.revision);
    const afterAutoLayout = await readRelationshipLayout(window, 'Ethéria');
    const automaticallyArrangedNode = requireLayoutNode(afterAutoLayout, gorelId);
    expect(automaticallyArrangedNode.pinned).toBe(false);
    expect({ x: automaticallyArrangedNode.x, y: automaticallyArrangedNode.y }).not.toEqual({
      x: keyboardNode.x,
      y: keyboardNode.y,
    });
    const resetButton = reopenedCanvas.getByRole('button', { name: 'Restaurar layout' });
    await resetButton.click();
    const resetDialog = window.getByRole('alertdialog', { name: 'Restaurar o layout do mapa?' });
    await expect(resetDialog).toBeVisible();
    const cancelReset = resetDialog.getByRole('button', { name: 'Cancelar' });
    await expect(cancelReset).toBeFocused();
    await cancelReset.click();
    await expect(resetButton).toBeFocused();
    await resetButton.click();
    const beforeReset = afterAutoLayout;
    await resetDialog.getByRole('button', { name: 'Confirmar restauração' }).click();
    await expect
      .poll(async () => (await readRelationshipLayout(window, 'Ethéria')).view.revision)
      .toBeGreaterThan(beforeReset.view.revision);
    const afterReset = await readRelationshipLayout(window, 'Ethéria');
    expect(afterReset.nodes).toEqual([]);
    expect(afterReset.view.viewport).toEqual({ x: 0, y: 0, zoom: 1 });
    await window.getByLabel('Tipo de relação').selectOption({ label: 'Conhece' });
    await expect(list).toContainText('Kabotya — Conhece → Cabos Antigos');
    await window.getByLabel('Estado canônico').selectOption('rejected');
    await expect(list).toContainText('Nenhuma conexão corresponde aos filtros.');
    await window.getByLabel('Estado canônico').selectOption('');
    await window.getByLabel('Visibilidade').selectOption('players');
    await expect(list).toContainText('Nenhuma conexão corresponde aos filtros.');
    await window.getByLabel('Visibilidade').selectOption('');
    await list.getByRole('button', { name: 'Cabos Antigos' }).click();
    await expect(list).toContainText('Cabos Antigos — É conhecido por → Kabotya');
    await window.getByLabel('Natureza').selectOption('rumor');
    await expect(list).toContainText('Nenhuma conexão corresponde aos filtros.');
    await window.getByRole('button', { name: 'Voltar para detalhes da campanha' }).click();
    await window.getByRole('button', { name: 'Tipos de relação' }).click();
    await window.getByRole('button', { name: 'Arquivar' }).click();
    await window.getByRole('button', { name: 'Confirmar' }).click();
    await window.getByRole('button', { name: 'Voltar para detalhes da campanha' }).click();
    await window.getByRole('button', { name: 'Relações', exact: true }).click();
    await window.getByLabel('Entidade central').selectOption({ label: 'Cabos Antigos' });
    await window.getByLabel('Profundidade').selectOption('2');
    await expect(window.getByTestId('neighborhood-text-list')).toContainText(
      'Cabos Antigos — É conhecido por → Kabotya',
    );
  } finally {
    await application?.close();
    await rm(dataDirectory, { recursive: true, force: true });
  }
});

async function createEntity(window: Page, name: string): Promise<void> {
  await window.getByRole('button', { name: 'Nova entidade', exact: true }).click();
  await window.getByLabel('Nome *').fill(name);
  await window.getByRole('button', { name: 'Criar entidade' }).click();
  await expect(window.getByRole('status')).toContainText(`Entidade “${name}” criada.`);
}
async function createRelationship(window: Page, source: string, target: string): Promise<void> {
  await window.getByLabel('Tipo *').selectOption({ label: 'Conhece' });
  await window.getByLabel('Origem *').selectOption({ label: source });
  await window.getByLabel('Destino *').selectOption({ label: target });
  await window.getByRole('button', { name: 'Salvar relação' }).click();
  await expect(window.getByRole('status')).toContainText('Relação criada.');
}
async function nodeTransform(node: Locator): Promise<string> {
  return node.evaluate((element) => (element as HTMLElement).style.transform);
}
function nodeCoordinates(transform: string): { x: number; y: number } {
  const match = /^translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)$/.exec(transform);
  if (match?.[1] === undefined || match[2] === undefined)
    throw new Error(`Transformação de nó inesperada: ${transform}`);
  return { x: Number(match[1]), y: Number(match[2]) };
}
function requireLayoutNode(state: RelationshipViewState, entityId: string) {
  const node = state.nodes.find((candidate) => candidate.entityId === entityId);
  if (node === undefined) throw new Error(`Nó ${entityId} ausente do layout persistido.`);
  return node;
}
async function readRelationshipLayout(
  window: Page,
  campaignName: string,
): Promise<RelationshipViewState> {
  return window.evaluate(async (selectedCampaignName) => {
    const manager = globalThis as unknown as { campaignManager: CampaignManagerGateway };
    const campaigns = await manager.campaignManager.campaigns.list({
      filters: { statuses: ['active'] },
    });
    if (!campaigns.ok) throw new Error(campaigns.error.message);
    const campaign = campaigns.data.items.find((item) => item.name === selectedCampaignName);
    if (campaign === undefined) throw new Error('Campanha de teste ausente.');
    const layout = await manager.campaignManager.relationshipViews.get({
      campaignId: campaign.id,
      viewType: 'campaign',
      sourceEntityId: null,
    });
    if (!layout.ok) throw new Error(layout.error.message);
    return layout.data;
  }, campaignName);
}
async function launch(dataDirectory: string): Promise<ElectronApplication> {
  const inheritedEnvironment = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  );
  delete inheritedEnvironment.ELECTRON_RUN_AS_NODE;
  return electron.launch({
    executablePath: electronExecutable,
    args: [repositoryRoot],
    env: { ...inheritedEnvironment, APP_DATA_DIR: dataDirectory, NODE_ENV: 'test' },
  });
}
