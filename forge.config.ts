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
  rebuildConfig: {},
  hooks: {
    packageAfterPrune: async (_forgeConfig, buildPath) => {
      // Forge's production-prune step does not currently retain external
      // packages from pnpm 11's hoisted layout. The Vite main bundle keeps
      // this native driver external, so copy its runtime package explicitly.
      const source = path.join(process.cwd(), 'node_modules', 'better-sqlite3');
      const destination = path.join(buildPath, 'node_modules', 'better-sqlite3');
      await mkdir(path.dirname(destination), { recursive: true });
      await cp(source, destination, { recursive: true });
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

export default config;
