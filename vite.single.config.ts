// Builds a single self-contained HTML file that runs from file:// with no
// server and no Node.js.
//
// Why this is needed: the normal build loads Pixi.js as dynamic chunks, and
// browsers block those over file:// (opaque origin) -> black screen. Inlining
// every dynamic import into one bundle removes the fetches entirely, so
// double-clicking the HTML just works. Requires build.target esnext (top-level
// await) to match the main config.
import { defineConfig, mergeConfig } from 'vite';
import base from './vite.config';
import { viteSingleFile } from 'vite-plugin-singlefile';

const target = process.env.SINGLE_TARGET === 'mobile' ? 'mobile' : 'web';

export default mergeConfig(
    base,
    defineConfig({
        // pick the web or mobile HTML entry (they differ only in viewport and
        // device meta tags / touch behaviour), then write to its own folder
        build: {
            outDir: `dist-${target}`,
            rollupOptions: {
                input: `index.${target}.html`,
                output: { inlineDynamicImports: true },
            },
            // merge the dynamic chunks back into the one module
            cssCodeSplit: false,
            assetsInlineLimit: 100000000,
        },
        plugins: [viteSingleFile({ removeViteModuleLoader: true })],
    }),
);

