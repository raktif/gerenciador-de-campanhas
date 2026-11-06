import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerDMG } from '@electron-forge/maker-dmg';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives';
import { VitePlugin } from '@electron-forge/plugin-vite';
import type { ForgeConfig } from '@electron-forge/shared-types';
import { FuseV1Options, FuseVersion } from '@electron/fuses';
import { cp, mkdir } from 'node:fs/promises';
import path from 'node:path';

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    executableName: 'gerenciador-de-campanhas',
  },
  // Os mÃ³dulos nativos distribuem binÃ¡rios prÃ©-compilados compatÃ­veis. Rebuild
  // local Ã© desnecessÃ¡rio e faria o desenvolvimento depender de node-gyp.
  rebuildConfig: { onlyModules: [] },
  hooks: {
    packageAfterPrune: async (_forgeConfig, buildPath) => {
      // O production-prune do Forge nÃ£o preserva os externos do layout hoisted
      // do pnpm 11. Copiamos o driver SQLite, o processador e os binÃ¡rios sharp
      // instalados para a plataforma do build.
      await copyRuntimePackage(buildPath, 'better-sqlite3');
      await copyRuntimePackage(buildPath, 'sharp');
      await copyRuntimePackage(buildPath, '@img');
    },
  },
  makers: [
    new MakerSquirrel({}),
    new MakerZIP({}, ['darwin', 'linux']),
    new MakerDMG({}, ['darwin']),
    new MakerDeb({}, ['linux']),
  ],
  plugins: [
    new AutoUnpackNativesPlugin({}),
    new VitePlugin({
      build: [
        {
          entry: { main: 'src/main/index.ts' },
          config: 'vite.main.config.mts',
          target: 'main',
        },
        {
          entry: { preload: 'src/preload/index.ts' },
          config: 'vite.preload.config.mts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.mts',
        },
      ],
    }),
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

async function copyRuntimePackage(buildPath: string, packageName: string): Promise<void> {
  const source = path.join(process.cwd(), 'node_modules', packageName);
  const destination = path.join(buildPath, 'node_modules', packageName);
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(source, destination, { recursive: true });
}

export default config;
