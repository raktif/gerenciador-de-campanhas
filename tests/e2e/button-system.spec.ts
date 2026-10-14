import { createRequire } from 'node:module';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Locator,
  type Page,
} from '@playwright/test';

const repositoryRoot = process.cwd();
const requireFromRepository = createRequire(path.join(repositoryRoot, 'package.json'));
const electronExecutable = requireFromRepository('electron') as string;

test('padroniza formulários e diálogos nos tamanhos mínimo e amplo', async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'rpg-actions-e2e-'));
  let application: ElectronApplication | null = null;

  try {
    application = await launch(dataDirectory);
    let window = await application.firstWindow();
    await setWindowBounds(application, 1024, 700);

    await window.getByRole('button', { name: 'Criar primeira campanha' }).click();
    await window.getByLabel('Nome da campanha').fill('Campanha dos Botões');
    const primaryActions = window.getByRole('group', {
      name: 'Ações principais da campanha',
    });
    await expectActionOrderAndAlignment(primaryActions, ['Cancelar', 'Criar campanha']);
    await expect(primaryActions.getByRole('button', { name: 'Cancelar' })).toHaveAttribute(
      'type',
      'button',
    );
    const createCampaign = primaryActions.getByRole('button', { name: 'Criar campanha' });
    await expect(createCampaign).toHaveAttribute('type', 'submit');
    await createCampaign.click();

    await window.getByRole('button', { name: 'Abrir campanha Campanha dos Botões' }).click();
    const quickCaptureTrigger = window.getByRole('button', { name: /Captura rápida/ });
    await quickCaptureTrigger.click();
    const quickCapture = window.getByRole('dialog', { name: 'Captura rápida' });
    await expectWithinViewport(quickCapture, window);
    await expectActionOrderAndAlignment(
      quickCapture.getByRole('group', { name: 'Ações do diálogo' }),
      ['Cancelar', 'Salvar captura'],
    );
    await expect(quickCapture.getByRole('button', { name: 'Salvar captura' })).toBeDisabled();
    await window.keyboard.press('Escape');
    await expect(quickCapture).toHaveCount(0);
    await expect(quickCaptureTrigger).toBeFocused();

    await application.close();
    application = null;
    seedActionFixtures(dataDirectory);
    application = await launch(dataDirectory);
    window = await application.firstWindow();
    await setWindowBounds(application, 1440, 900);
    await window.getByRole('button', { name: 'Abrir campanha Campanha dos Botões' }).click();

    const campaignNavigation = window.getByRole('navigation', {
      name: 'Navegação da campanha Campanha dos Botões',
    });
    const activeNavigationItem = campaignNavigation.getByRole('button', {
      name: 'Detalhes da campanha',
    });
    const inactiveNavigationItem = campaignNavigation.getByRole('button', {
      name: 'Caixa de Entrada',
    });
    const entityNavigationItem = campaignNavigation.getByRole('button', { name: 'Ver entidades' });
    await expect(activeNavigationItem).toHaveAttribute('aria-current', 'page');
    const activeNavigationStyle = await computedNavigationStyle(activeNavigationItem);
    expect(activeNavigationStyle.backgroundAlpha).toBe(255);
    expect(activeNavigationStyle.textContrast).toBeGreaterThanOrEqual(4.5);
    const inactiveNavigationStyle = await computedNavigationStyle(inactiveNavigationItem);
    expect(inactiveNavigationStyle.backgroundAlpha).toBe(0);
    expect(inactiveNavigationStyle.textContrast).toBeGreaterThanOrEqual(4.5);
    await activeNavigationItem.focus();
    await window.keyboard.press('Tab');
    await expect(inactiveNavigationItem).toBeFocused();
    const focusedNavigationStyle = await computedNavigationStyle(inactiveNavigationItem);
    expect(focusedNavigationStyle).toMatchObject({
      focusVisible: true,
      outlineStyle: 'solid',
      outlineWidth: '2px',
    });
    expect(focusedNavigationStyle.outlineContrast).toBeGreaterThanOrEqual(3);
    await entityNavigationItem.click();
    await expect(entityNavigationItem).toHaveAttribute('aria-current', 'page');
    await expect
      .poll(async () => {
        const style = await computedNavigationStyle(entityNavigationItem);
        return style.backgroundAlpha === 255 && style.textContrast >= 4.5;
      })
      .toBe(true);
    const entityFilters = window.getByRole('group', { name: 'Filtros de entidades' });
    await expect(entityFilters.getByRole('button', { name: 'Ativas' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(entityFilters.getByRole('button', { name: 'Arquivadas' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    const entityCardActions = window.getByRole('group', { name: 'Ações de Aris' });
    await expect(entityCardActions.getByRole('button')).toHaveCount(5);
    await expectMinimumButtonHeight(entityCardActions, 44);
    const entityTitleLink = window.getByRole('button', { name: 'Abrir detalhes de Aris' }).first();
    expect(
      await entityTitleLink.evaluate((element) => {
        const style = getComputedStyle(element);
        const parentStyle = getComputedStyle(element.parentElement ?? element);
        return {
          borderWidth: style.borderWidth,
          fontSize: style.fontSize,
          inheritedFontSize: parentStyle.fontSize,
          minHeight: style.minHeight,
          padding: style.padding,
        };
      }),
    ).toEqual({
      borderWidth: '0px',
      fontSize: '20px',
      inheritedFontSize: '20px',
      minHeight: '0px',
      padding: '0px',
    });
    await setWindowBounds(application, 1024, 700);
    await expectWithinViewport(window.getByTestId('entity-list'), window);
    await expectWithinViewport(entityCardActions, window);
    await setWindowBounds(application, 1440, 900);
    await entityTitleLink.click();
    await window.getByRole('button', { name: 'Editar', exact: true }).click();
    await window.getByLabel('Resumo').fill('Alteração que será descartada');
    const entityCancel = window.getByRole('button', { name: 'Cancelar', exact: true });
    await entityCancel.click();

    const discardDialog = window.getByRole('dialog', { name: 'Descartar alterações?' });
    const discardActions = discardDialog.getByRole('group', { name: 'Ações do diálogo' });
    await expectActionOrderAndAlignment(discardActions, [
      'Continuar editando',
      'Descartar alterações',
    ]);
    const continueEditing = discardActions.getByRole('button', { name: 'Continuar editando' });
    const discardChanges = discardActions.getByRole('button', { name: 'Descartar alterações' });
    await expect(continueEditing).toBeFocused();
    await expect(discardChanges).toHaveClass(/border-red-300/);
    await window.keyboard.press('Shift+Tab');
    await expect(discardChanges).toBeFocused();
    await window.keyboard.press('Tab');
    await expect(continueEditing).toBeFocused();
    await window.keyboard.press('Escape');
    await expect(discardDialog).toHaveCount(0);
    await expect(entityCancel).toBeFocused();
    await entityCancel.click();
    await discardChanges.click();
    await expect(window.getByTestId('entity-list')).toContainText('Aris');
    await expect(
      window.getByRole('button', { name: 'Abrir detalhes de Aris' }).first(),
    ).toBeFocused();

    await window.getByRole('button', { name: 'Caixa de Entrada' }).click();
    const inboxFilters = window.getByRole('group', { name: 'Filtrar capturas' });
    await expect(inboxFilters.getByRole('button', { name: 'Pendentes' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expectMinimumButtonHeight(inboxFilters, 44);
    const confirmationCard = inboxCard(window, 'Captura para confirmação');
    await expectMinimumButtonHeight(
      confirmationCard.getByRole('group', { name: 'Ações da captura' }),
      44,
    );
    const dismissTrigger = confirmationCard.getByRole('button', { name: 'Descartar' });
    await dismissTrigger.click();
    const confirmation = window.getByRole('dialog', { name: /Confirmar descarte/ });
    const confirmationActions = confirmation.getByRole('group', { name: 'Ações do diálogo' });
    await expectActionOrderAndAlignment(confirmationActions, ['Cancelar', 'Confirmar descarte']);
    const confirmationCancel = confirmationActions.getByRole('button', { name: 'Cancelar' });
    const confirmationSubmit = confirmationActions.getByRole('button', {
      name: 'Confirmar descarte',
    });
    await expect(confirmationCancel).toBeFocused();
    await window.keyboard.press('Tab');
    await expect(confirmationSubmit).toBeFocused();
    await window.keyboard.press('Shift+Tab');
    await expect(confirmationCancel).toBeFocused();
    await window.keyboard.press('Escape');
    await expect(confirmation).toHaveCount(0);
    await expect(dismissTrigger).toBeFocused();

    const conversionCard = inboxCard(window, 'Captura para conversão');
    await conversionCard.getByRole('button', { name: 'Marcar como em revisão' }).click();
    const conversionTrigger = conversionCard.getByRole('button', { name: 'Converter em entidade' });
    await conversionTrigger.click();
    const conversion = window.getByRole('dialog', { name: 'Converter em entidade' });
    const conversionActions = conversion.getByRole('group', { name: 'Ações do diálogo' });
    await expectActionOrderAndAlignment(conversionActions, ['Cancelar', 'Confirmar conversão']);
    await expect(conversion.getByLabel('Nome')).toBeFocused();
    await window.keyboard.press('Shift+Tab');
    await expect(conversion.getByLabel('Tipo de entidade')).toBeFocused();
    await window.keyboard.press('Tab');
    await expect(conversion.getByLabel('Nome')).toBeFocused();
    await window.keyboard.press('Escape');
    await expect(conversion).toHaveCount(0);
    await expect(conversionTrigger).toBeFocused();
  } finally {
    await application?.close();
    await rm(dataDirectory, { recursive: true, force: true });
  }
});

function inboxCard(window: Page, text: string): Locator {
  return window.getByText(text, { exact: true }).locator('xpath=ancestor::article');
}

async function expectActionOrderAndAlignment(group: Locator, labels: string[]): Promise<void> {
  const buttons = group.getByRole('button');
  await expect(buttons).toHaveCount(labels.length);
  await expect(buttons).toHaveText(labels);
  const bounds = await buttons.evaluateAll((items) =>
    items.map((button) => {
      const box = button.getBoundingClientRect();
      return { height: box.height, top: box.top };
    }),
  );
  expect(new Set(bounds.map(({ height }) => height)).size).toBe(1);
  expect(new Set(bounds.map(({ top }) => top)).size).toBe(1);
}

async function expectWithinViewport(locator: Locator, window: Page): Promise<void> {
  const bounds = await locator.boundingBox();
  const viewport = await window.evaluate(() => ({ height: innerHeight, width: innerWidth }));
  expect(bounds).not.toBeNull();
  expect(bounds?.x ?? -1).toBeGreaterThanOrEqual(0);
  expect(bounds?.y ?? -1).toBeGreaterThanOrEqual(0);
  expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeLessThanOrEqual(viewport.width);
  expect((bounds?.y ?? 0) + (bounds?.height ?? 0)).toBeLessThanOrEqual(viewport.height);
}

async function expectMinimumButtonHeight(group: Locator, minimum: number): Promise<void> {
  const heights = await group
    .getByRole('button')
    .evaluateAll((buttons) => buttons.map((button) => button.getBoundingClientRect().height));
  expect(heights.length).toBeGreaterThan(0);
  for (const height of heights) expect(height).toBeGreaterThanOrEqual(minimum);
}

async function computedNavigationStyle(button: Locator): Promise<{
  backgroundAlpha: number;
  focusVisible: boolean;
  outlineContrast: number;
  outlineStyle: string;
  outlineWidth: string;
  textContrast: number;
}> {
  return button.evaluate((element) => {
    const style = getComputedStyle(element);
    const surface = getComputedStyle(element.closest('aside') ?? document.body).backgroundColor;
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext('2d');
    if (context === null) throw new Error('Canvas 2D indisponível para validar contraste.');

    function channels(color: string): [number, number, number, number] {
      context?.clearRect(0, 0, 1, 1);
      if (context === null) throw new Error('Canvas 2D indisponível para validar contraste.');
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      const [red = 0, green = 0, blue = 0, alpha = 0] = context.getImageData(0, 0, 1, 1).data;
      return [red, green, blue, alpha];
    }

    function luminance([red, green, blue]: [number, number, number, number]): number {
      const linear = [red, green, blue].map((channel) => {
        const value = channel / 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * (linear[0] ?? 0) + 0.7152 * (linear[1] ?? 0) + 0.0722 * (linear[2] ?? 0);
    }

    function contrast(
      left: [number, number, number, number],
      right: [number, number, number, number],
    ): number {
      const lighter = Math.max(luminance(left), luminance(right));
      const darker = Math.min(luminance(left), luminance(right));
      return (lighter + 0.05) / (darker + 0.05);
    }

    const background = channels(style.backgroundColor);
    const surfaceChannels = channels(surface);
    const effectiveBackground = background[3] === 0 ? surfaceChannels : background;
    return {
      backgroundAlpha: background[3],
      focusVisible: element.matches(':focus-visible'),
      outlineContrast: contrast(channels(style.outlineColor), surfaceChannels),
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
      textContrast: contrast(channels(style.color), effectiveBackground),
    };
  });
}

function seedActionFixtures(dataDirectory: string): void {
  const database = new Database(path.join(dataDirectory, 'database', 'app.db'));
  try {
    const campaign = database
      .prepare("SELECT id FROM campaigns WHERE name = 'Campanha dos Botões'")
      .get() as { id: string } | undefined;
    if (campaign === undefined) throw new Error('Campanha do teste ausente.');
    const now = new Date().toISOString();
    const transaction = database.transaction(() => {
      database
        .prepare(
          `INSERT INTO entity_types (id, campaign_id, name, singular_name, slug, sort_order, is_system, is_archived, created_at, updated_at, revision)
           VALUES ('60000000-0000-4000-8000-000000000091', ?, 'Personagens', 'Personagem', 'personagens', 0, 0, 0, ?, ?, 1)`,
        )
        .run(campaign.id, now, now);
      database
        .prepare(
          `INSERT INTO entities (id, campaign_id, entity_type_id, name, summary, canon_state, knowledge_state, visibility, origin_kind, created_at, updated_at, revision)
           VALUES ('30000000-0000-4000-8000-000000000091', ?, '60000000-0000-4000-8000-000000000091', 'Aris', 'Sentinela', 'accepted', 'fact', 'gm', 'manual', ?, ?, 1)`,
        )
        .run(campaign.id, now, now);
      const insertCapture = database.prepare(
        `INSERT INTO inbox_items (id, campaign_id, raw_text, status, origin_kind, captured_at, created_at, updated_at, revision)
         VALUES (?, ?, ?, 'new', 'manual', ?, ?, ?, 1)`,
      );
      insertCapture.run(
        '80000000-0000-4000-8000-000000000091',
        campaign.id,
        'Captura para confirmação',
        now,
        now,
        now,
      );
      insertCapture.run(
        '80000000-0000-4000-8000-000000000092',
        campaign.id,
        'Captura para conversão',
        now,
        now,
        now,
      );
    });
    transaction();
  } finally {
    database.close();
  }
}

async function setWindowBounds(
  application: ElectronApplication,
  width: number,
  height: number,
): Promise<void> {
  const bounds = await application.evaluate(
    ({ BrowserWindow }, requestedBounds) => {
      const window = BrowserWindow.getAllWindows()[0];
      if (window === undefined) throw new Error('Janela principal ausente.');
      window.setBounds({ ...window.getBounds(), ...requestedBounds });
      return window.getBounds();
    },
    { width, height },
  );
  expect(bounds.width).toBe(width);
  expect(bounds.height).toBe(height);
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
