// ESLint flat configuration for Electron media_viewer project.
//
// Ten file-group blocks:
//   1.  Node/Electron main           — main.js, logger.js
//   1b. Electron preload             — preload.js (Node + browser hybrid)
//   2a. Browser renderer (module)    — media-viewer.js (loaded as type="module")
//   2b. Browser renderer (script)    — face-detector.js (loaded as plain <script>)
//   2c. Browser renderer modules     — fullscreen.js (ES module, imported by media-viewer.js)
//   3a. Web Workers                  — sorting-worker.js, ml-worker.js, feature-worker.js
//   3b. Shared libs (worker+browser) — feature-extractor.js, ml-model.js, media-formats.js
//   4.  Unit tests (Vitest)          — tests/**/*.js (excl. e2e)
//   5a. E2E helpers (CJS)            — tests/e2e/**/*.cjs
//   5b. E2E tests (Playwright)       — tests/e2e/**/*.js, playwright.config.js
//
// eslint-config-prettier applied last to suppress formatting rule conflicts.

import globals from 'globals';
import eslintConfigPrettier from 'eslint-config-prettier';

// Shared rules for all environments
const sharedRules = {
    eqeqeq: ['error', 'always', { null: 'ignore' }],
    curly: ['error', 'all'],
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
    'prefer-const': 'error',
    'no-var': 'error',
    'no-shadow': 'warn',
    'no-console': 'off',
};

export default [
    // Global ignores
    {
        ignores: ['node_modules/**', 'docs/**'],
    },

    // 1. Node / Electron main process
    {
        files: ['main.js', 'logger.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'commonjs',
            globals: {
                ...globals.node,
            },
        },
        rules: {
            ...sharedRules,
            'no-undef': 'error',
        },
    },

    // 1b. Electron preload (Node + browser hybrid)
    {
        files: ['preload.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'commonjs',
            globals: {
                ...globals.node,
                ...globals.browser,
            },
        },
        rules: {
            ...sharedRules,
            'no-undef': 'error',
        },
    },

    // 2a. Browser renderer (ES module — loaded via <script type="module">)
    {
        files: ['media-viewer.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: {
                ...globals.browser,
                electronAPI: 'readonly',
                lucide: 'readonly',
                // Globals from <script src="feature-extractor.js"> loaded before this module
                extractFeatures: 'readonly',
                FEATURE_VERSION: 'readonly',
                FEATURE_DIM: 'readonly',
            },
        },
        rules: {
            ...sharedRules,
            'no-undef': 'error',
        },
    },

    // 2b. Browser renderer (classic script — loaded via <script>)
    {
        files: ['face-detector.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'script',
            globals: {
                ...globals.browser,
                faceapi: 'readonly',
            },
        },
        rules: {
            ...sharedRules,
            'no-undef': 'error',
        },
    },

    // 2c. Browser renderer modules (ES module — imported by media-viewer.js)
    {
        files: ['fullscreen.js', 'tournament-engine.js', 'tournament.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: {
                ...globals.browser,
            },
        },
        rules: {
            ...sharedRules,
            'no-undef': 'error',
        },
    },

    // 3a. Web Workers (pure workers — conditional CJS exports for testing)
    {
        files: ['sorting-worker.js', 'ml-worker.js', 'feature-worker.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'script',
            globals: {
                ...globals.worker,
                // Globals from importScripts('ml-model.js')
                OnlineLogisticRegression: 'readonly',
                ML_MODEL_VERSION: 'readonly',
                DEFAULT_FEATURE_DIM: 'readonly',
                // Globals from importScripts('feature-extractor.js')
                extractFeatures: 'readonly',
                FEATURE_VERSION: 'readonly',
                FEATURE_DIM: 'readonly',
                // Conditional CJS export: typeof module !== 'undefined' && module.exports
                module: 'readonly',
            },
        },
        rules: {
            ...sharedRules,
            'no-undef': 'error',
        },
    },

    // 3b. Shared libraries loaded via importScripts and browser <script> (have conditional CJS export pattern)
    {
        files: ['feature-extractor.js', 'ml-model.js', 'media-formats.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'script',
            globals: {
                ...globals.worker,
                // Conditional CJS export: typeof module !== 'undefined' && module.exports
                module: 'readonly',
            },
        },
        rules: {
            ...sharedRules,
            'no-undef': 'error',
        },
    },

    // 4. Unit test files (Vitest)
    {
        files: ['tests/**/*.js', 'vitest.config.js'],
        ignores: ['tests/e2e/**'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: {
                ...globals.node,
            },
        },
        rules: {
            ...sharedRules,
            'no-undef': 'error',
            'no-new-func': 'off', // Used to extract methods from source for testing
        },
    },

    // 5a. E2E helper scripts (CJS — run inside Electron/Node, not as test modules)
    {
        files: ['tests/e2e/**/*.cjs'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'commonjs',
            globals: {
                ...globals.node,
            },
        },
        rules: {
            ...sharedRules,
            'no-undef': 'error',
        },
    },

    // 5b. E2E test files (Playwright + Electron)
    // Browser globals needed for page.evaluate() callbacks that run in renderer context
    {
        files: ['tests/e2e/**/*.js', 'playwright.config.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: {
                ...globals.node,
                ...globals.browser,
            },
        },
        rules: {
            ...sharedRules,
            'no-undef': 'error',
        },
    },

    // Disable ESLint rules that conflict with Prettier (must be last)
    eslintConfigPrettier,
];
