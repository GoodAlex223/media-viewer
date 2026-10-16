// ESLint flat configuration for Electron media_viewer project.
//
// Twelve file-group blocks, plus one rule-only object (1c):
//   1.  Node/Electron main           — main.js, logger.js, path-grants.js, ipc-guard.js
//   1c. main.js IPC guard            — no ipcMain registration outside ipc-guard (G1)
//   1b. Electron preload             — preload.js (Node + browser hybrid)
//   2a. Browser renderer (module)    — media-viewer.js (loaded as type="module")
//   2b. Browser renderer (script)    — face-detector.js (loaded as plain <script>)
//   2c. Browser renderer modules     — fullscreen.js, ml-training.js (ES modules, imported by media-viewer.js)
//   3a. Web Workers                  — sorting-worker.js, ml-worker.js, feature-worker.js
//   3a-jxl. Module Web Worker        — jxl-decode-worker.js (ES module worker)
//   3b. Shared libs (worker+browser) — feature-extractor.js, ml-model.js, media-formats.js
//   4.  Unit tests (Vitest)          — tests/**/*.js (excl. e2e)
//   5a. E2E helpers (CJS)            — tests/e2e/**/*.cjs
//   5b. E2E tests (Playwright)       — tests/e2e/**/*.js, playwright.config.js
//   6.  Scripts + Claude Code hooks  — scripts/**/*.js, .claude/hooks/**/*.js (Node CJS)
//
// Renderer blocks (2a, 2b, 2c, 3b) share htmlSinkGuard (G1): no built string reaches the HTML parser.
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

// G1 lint guard (spec § 6.4): renderer code never hands a built string to the HTML parser.
// innerHTML/outerHTML may take only a static string; insertAdjacentHTML and document.write are
// banned outright. tests/lint-guard.test.js proves every selector fires. Flat config REPLACES a
// rule's options for a matching file, so any later no-restricted-syntax entry for these files
// must be merged into this array, not set in another object.
const NOT_STATIC = ":not([right.type='Literal']):not([right.type='TemplateLiteral'][right.expressions.length=0])";
const HTML_SINK_MESSAGE =
    'Build DOM nodes (createElement + textContent) instead of handing a built string to the HTML parser (G1).';
const htmlSinkGuard = [
    'error',
    {
        selector: `AssignmentExpression[left.property.name=/^(innerHTML|outerHTML)$/]${NOT_STATIC}`,
        message: HTML_SINK_MESSAGE,
    },
    {
        selector: `AssignmentExpression[left.computed=true][left.property.value=/^(innerHTML|outerHTML)$/]${NOT_STATIC}`,
        message: HTML_SINK_MESSAGE,
    },
    { selector: "CallExpression[callee.property.name='insertAdjacentHTML']", message: HTML_SINK_MESSAGE },
    {
        selector: "CallExpression[callee.object.name='document'][callee.property.name=/^(write|writeln)$/]",
        message: HTML_SINK_MESSAGE,
    },
];

export default [
    // Global ignores
    {
        ignores: ['node_modules/**', 'docs/**'],
    },

    // 1. Node / Electron main process
    {
        files: ['main.js', 'logger.js', 'path-grants.js', 'ipc-guard.js', 'clip-image.js'],
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

    // 1c. main.js — every privileged channel registers through ipc-guard's handle/on (G1 § 3.3),
    // which checks the sender frame and each argument. ipc-guard.js itself must call ipcMain, so
    // this object names main.js alone. tests/lint-guard.test.js proves it fires.
    {
        files: ['main.js'],
        rules: {
            'no-restricted-syntax': [
                'error',
                {
                    selector:
                        "CallExpression[callee.object.name='ipcMain'][callee.property.name=/^(handle|handleOnce|on|once|addListener|prependListener|prependOnceListener)$/]",
                    message:
                        'Register IPC through guard.handle / guard.on (ipc-guard.js), never on ipcMain directly (G1).',
                },
            ],
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
            'no-restricted-syntax': htmlSinkGuard,
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
            'no-restricted-syntax': htmlSinkGuard,
        },
    },

    // 2c. Browser renderer modules (ES module — imported by media-viewer.js)
    {
        files: ['fullscreen.js', 'tournament-engine.js', 'tournament.js', 'ml-training.js', 'like-or-skip.js'],
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
            'no-restricted-syntax': htmlSinkGuard,
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
                TRAINING_CONFIG_VERSION: 'readonly',
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

    // 3a-jxl. Module Web Worker (ES module worker — `new Worker(url, { type: 'module' })`)
    {
        files: ['jxl-decode-worker.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: {
                ...globals.worker,
            },
        },
        rules: {
            ...sharedRules,
            'no-undef': 'error',
        },
    },

    // 3b. Shared libraries loaded via importScripts and browser <script> (have conditional CJS export pattern)
    {
        files: ['feature-extractor.js', 'ml-model.js', 'media-formats.js', 'feature-cache-transport.js'],
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
            'no-restricted-syntax': htmlSinkGuard,
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

    // 6. Build / maintenance scripts and Claude Code hook scripts (Node CJS — `node scripts/*.js`,
    //    `node .claude/hooks/*.js`)
    {
        files: ['scripts/**/*.js', '.claude/hooks/**/*.js'],
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

    // Disable ESLint rules that conflict with Prettier (must be last)
    eslintConfigPrettier,
];
