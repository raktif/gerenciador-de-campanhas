import { describe, expect, it, vi } from 'vitest';
import type { CampaignCover } from '../../src/core/contracts/campaign-covers';
import type { Campaign } from '../../src/core/contracts/campaigns';
import {
  handleSecondaryDialogKeyDown,
  managerBackgroundAccessibility,
  replacementDecision,
  trapFocus,
} from '../../src/renderer/features/campaigns/campaign-cover';

describe('regressões de concorrência e modal da capa', () => {
  it('aguarda o carregamento e exige confirmação pela identidade pública mesmo após falha', () => {
    expect(replacementDecision(campaign, null, true)).toBe('wait');
    expect(replacementDecision({ ...campaign, coverAttachmentId: attachmentId }, null, false)).toBe(
      'confirm',
    );
    expect(replacementDecision(campaign, null, false)).toBe('import');
    expect(replacementDecision(campaign, cover, false)).toBe('confirm');
  });

  it('torna o fundo inerte e invisível à árvore acessível somente com modal secundário', () => {
    expect(managerBackgroundAccessibility(true)).toEqual({ 'aria-hidden': true, inert: true });
    expect(managerBackgroundAccessibility(false)).toEqual({});
  });

  it('contém Tab e Shift+Tab exclusivamente nos controles do modal secundário', () => {
    const focusFirst = vi.fn();
    const focusLast = vi.fn();
    const first = { focus: focusFirst } as unknown as HTMLElement;
    const last = { focus: focusLast } as unknown as HTMLElement;
    const container = {
      querySelectorAll: () => [first, last] as unknown as NodeListOf<HTMLElement>,
    };
    const forward = { key: 'Tab', shiftKey: false, preventDefault: vi.fn() };
    trapFocus(forward, container, last);
    expect(forward.preventDefault).toHaveBeenCalledOnce();
    expect(focusFirst).toHaveBeenCalledOnce();

    const backward = { key: 'Tab', shiftKey: true, preventDefault: vi.fn() };
    trapFocus(backward, container, first);
    expect(backward.preventDefault).toHaveBeenCalledOnce();
    expect(focusLast).toHaveBeenCalledOnce();
  });

  it('dá prioridade ao Escape do modal secundário e impede propagação ao manager', () => {
    const onCancel = vi.fn();
    const event = {
      key: 'Escape',
      shiftKey: false,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    };
    handleSecondaryDialogKeyDown(event as never, null, onCancel);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(event.stopPropagation).toHaveBeenCalledOnce();
    expect(onCancel).toHaveBeenCalledOnce();
  });
});

const attachmentId = '10000000-0000-4000-8000-000000000001';
const campaign: Campaign = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Ethéria',
  systemName: null,
  concept: null,
  genre: null,
  tone: null,
  summary: null,
  coverAttachmentId: null,
  status: 'active',
  createdAt: '2026-10-28T10:00:00.000Z',
  updatedAt: '2026-10-28T10:00:00.000Z',
  archivedAt: null,
  revision: 1,
};
const cover: CampaignCover = {
  campaign,
  attachment: {
    id: attachmentId,
    campaignId: campaign.id,
    originalFilename: 'capa.png',
    mimeType: 'image/png',
    fileSize: 100,
    checksumSha256: 'a'.repeat(64),
    visibility: 'gm',
    width: 800,
    height: 600,
    sourceKind: 'file',
    processedMimeType: 'image/webp',
    processingStatus: 'ready',
    createdAt: campaign.createdAt,
    updatedAt: campaign.updatedAt,
    revision: 1,
  },
};
