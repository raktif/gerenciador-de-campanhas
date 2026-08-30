import { createRequire } from 'node:module';
import path from 'node:path';
import { build } from 'vite';

const repositoryRoot = process.cwd();
const requireFromRepository = createRequire(path.join(repositoryRoot, 'package.json'));
const vitePluginDirectory = path.dirname(
  requireFromRepository.resolve('@electron-forge/plugin-vite/package.json'),
);
const { default: ViteConfigGenerator } = requireFromRepository(
  path.join(vitePluginDirectory, 'dist', 'ViteConfig.js'),
);

// Keep this configuration aligned with the VitePlugin entry in forge.config.ts.
const forgeViteConfig = {
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
};

const generator = new ViteConfigGenerator(forgeViteConfig, repositoryRoot, true);
const configs = [...(await generator.getBuildConfigs()), ...(await generator.getRendererConfig())];

for (const config of configs) {
  await build({
    configFile: false,
    logLevel: 'error',
    ...config,
  });
}
