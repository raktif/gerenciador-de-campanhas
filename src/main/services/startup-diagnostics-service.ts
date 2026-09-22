import type {
  CopiedStartupDiagnostic,
  CopyStartupDiagnosticInput,
} from '../../core/contracts/diagnostics';

export class StartupDiagnosticsService {
  public constructor(private readonly copy: (text: string) => void) {}

  public copyStartupDiagnostic(input: CopyStartupDiagnosticInput): CopiedStartupDiagnostic {
    this.copy(
      [
        'Gerenciador de Campanhas de RPG — diagnóstico de inicialização',
        `versão=${String(input.version)}`,
        `tela=${input.screen}`,
        `operação=${input.operation}`,
        `código=${input.code}`,
      ].join('\n'),
    );
    return { copied: true };
  }
}
