// ESLint flat configuration for Electron media_viewer project.
//
// Sixteen file-group blocks, plus one rule-only object (1c):
//   1.  Node/Electron main           — main.js, logger.js, path-grants.js, ipc-guard.js, clip-image.js,
//                                      app-protocol.js, storage-migration.js, feature-cache-ledger.js,
//                                      atomic-write.js; literal require()/import() names only (v2 M-1)
//   1c. main.js IPC guard            — no ipcMain registration outside ipc-guard (G1), plus M-1
//   1d. Main code in folders (v2)    — main/**, modules/*/main/** (IPC guard + M-1)
//   1b. Electron preload             — preload.js (Node + browser hybrid)
//   2a. Browser renderer (module)    — media-viewer.js (loaded as type="module")
//   2b. Browser renderer (script)    — face-detector.js (loaded as plain <script>)
//   2c. Browser renderer modules     — fullscreen.js, zoom.js, ml-training.js, perceptual-hash.js,
//                                      main-thread-hash.js, hash-pool.js, hash-parity.js, … (ES modules the
//                                      renderer imports, directly or through another module)
//   2d. Core renderer code (v2)      — core/**
//   2e. Module UI code (v2)          — modules/*/ui/** (M-2 + mv/module-imports)
//   2f. Module workers (v2)          — modules/*/workers/** (M-2 + mv/module-imports)
//   3a. Web Workers                  — sorting-worker.js, ml-worker.js, feature-worker.js
//   3a-jxl. Module Web Workers       — jxl-decode-worker.js, hash-worker.js (ES module workers)
//   3b. Shared libs (worker+browser) — feature-extractor.js, ml-model.js, media-formats.js
//   4.  Unit tests (Vitest)          — tests/**/*.js (excl. e2e)
//   5a. E2E helpers (CJS)            — tests/e2e/**/*.cjs
//   5b. E2E tests (Playwright)       — tests/e2e/**/*.js, playwright.config.js
//   6.  Scripts + Claude Code hooks  — scripts/**/*.js, .claude/hooks/**/*.js (Node CJS)
//
// Renderer blocks (2a–2f, 3a-jxl, 3b) share the HTML sink guard (G1): no built string reaches the HTML parser.
// eslint-config-prettier applied last to suppress formatting rule conflicts.

import path from 'path';
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
const HTML_SINK_SELECTORS = [
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
const htmlSinkGuard = ['error', ...HTML_SINK_SELECTORS];

// G1 § 3.3: every privileged channel registers through ipc-guard's handle/on, which checks the sender frame and
// each argument. ipc-guard.js itself must call ipcMain, so no block that lints it carries this.
const IPC_MAIN_BAN = [
    {
        selector:
            "CallExpression[callee.object.name='ipcMain'][callee.property.name=/^(handle|handleOnce|on|once|addListener|prependListener|prependOnceListener)$/]",
        message: 'Register IPC through guard.handle / guard.on (ipc-guard.js), never on ipcMain directly (G1).',
    },
];

// v2 rule M-1 (spec § 6.2): main never loads code because a manifest named it. A computed require()/import() name
// is code no reviewer saw; a literal one is a file in the diff. module-boundary.test.js scans the literals.
const DYNAMIC_LOAD_MESSAGE = 'Main-process code loads only literal module names (v2 rule M-1).';
const DYNAMIC_LOAD_BAN = [
    { selector: "CallExpression[callee.name='require'][arguments.0.type!='Literal']", message: DYNAMIC_LOAD_MESSAGE },
    { selector: "ImportExpression[source.type!='Literal']", message: DYNAMIC_LOAD_MESSAGE },
];

// v2 rule M-2 (spec § 6.2): module code reaches the app only through `host`. No renderer global, no document-wide
// lookup (the host hands a module its root). Merged with the HTML sink guard, since flat config replaces options.
const M2_MESSAGE = 'Module code reaches the app only through `host` (v2 rule M-2).';
const MODULE_BOUNDARY_SELECTORS = [
    {
        selector:
            'MemberExpression[object.name=/^(window|globalThis|self)$/][property.name=/^(mediaViewer|electronAPI)$/]',
        message: M2_MESSAGE,
    },
    {
        selector:
            'MemberExpression[object.name=/^(window|globalThis|self)$/][computed=true][property.value=/^(mediaViewer|electronAPI)$/]',
        message: M2_MESSAGE,
    },
    {
        selector:
            "MemberExpression[object.name='document'][property.name=/^(querySelector|querySelectorAll|getElementById|getElementsByClassName|getElementsByTagName|getElementsByName|body)$/]",
        message: M2_MESSAGE,
    },
];

// mv/module-imports (v2 spec § 6.2): a module imports only files in its own folder (modules/<id>/…) and
// core/host-api.js (types). A bare package name, another module's file, app code and a computed import() name are
// refused. Paths resolve against the linted file's repo-relative folder.
const moduleImportsRule = {
    meta: {
        type: 'problem',
        schema: [],
        messages: {
            outside: "A module imports only its own files and core/host-api.js, not '{{spec}}' (v2 rule M-2).",
            computed: 'A module imports only literal paths (v2 rule M-2).',
        },
    },
    create(context) {
        const rel = path.relative(context.cwd, context.filename).split(path.sep).join('/');
        const [top, id] = rel.split('/');
        const own = `${top}/${id}/`;
        const dir = path.posix.dirname(rel);
        function check(source) {
            if (!source) {
                return;
            }
            if (source.type !== 'Literal' || typeof source.value !== 'string') {
                context.report({ node: source, messageId: 'computed' });
                return;
            }
            const spec = source.value;
            const relative = spec.startsWith('./') || spec.startsWith('../');
            const resolved = relative ? path.posix.normalize(path.posix.join(dir, spec)) : null;
            if (resolved !== null && (resolved.startsWith(own) || resolved === 'core/host-api.js')) {
                return;
            }
            context.report({ node: source, messageId: 'outside', data: { spec } });
        }
        return {
            ImportDeclaration: (node) => check(node.source),
            ExportAllDeclaration: (node) => check(node.source),
            ExportNamedDeclaration: (node) => check(node.source),
            ImportExpression: (node) => check(node.source),
        };
    },
};
const mvPlugin = { rules: { 'module-imports': moduleImportsRule } };

export default [
    // Global ignores
    {
        ignores: ['node_modules/**', 'docs/**', 'vendor/lucide/**'],
    },

    // 1. Node / Electron main process
    {
        files: [
            'main.js',
            'app-menu.js',
            'logger.js',
            'path-grants.js',
            'ipc-guard.js',
            'clip-image.js',
            'app-protocol.js',
            'storage-migration.js',
            'feature-cache-ledger.js',
            'atomic-write.js',
        ],
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
            'no-restricted-syntax': ['error', ...DYNAMIC_LOAD_BAN],
        },
    },

    // 1c. main.js — every privileged channel registers through ipc-guard's handle/on (G1 § 3.3),
    // which checks the sender frame and each argument. ipc-guard.js itself must call ipcMain, so
    // this object names main.js alone. Flat config replaces block 1's options here, so it carries
    // M-1 too. tests/lint-guard.test.js proves both fire.
    {
        files: ['main.js'],
        rules: {
            'no-restricted-syntax': ['error', ...IPC_MAIN_BAN, ...DYNAMIC_LOAD_BAN],
        },
    },

    // 1d. Main-process code in folders (v2): main/** and a module's main/ code. Node CJS, IPC through the guard
    // only, literal module names only (M-1). The app scheme never serves these folders (app-protocol.js).
    {
        files: ['main/**/*.js', 'modules/*/main/**/*.js'],
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
            'no-restricted-syntax': ['error', ...IPC_MAIN_BAN, ...DYNAMIC_LOAD_BAN],
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

    // 2c. Browser renderer modules (ES modules — imported by media-viewer.js, or by one of these)
    {
        files: [
            'fullscreen.js',
            'zoom.js',
            'tournament-engine.js',
            'tournament.js',
            'ml-training.js',
            'like-or-skip.js',
            'recent-folders.js',
            'similarity-sort.js',
            'media-url.js',
            'perceptual-hash.js',
            'main-thread-hash.js',
            'hash-pool.js',
            'hash-parity.js',
            'feature-cache-store.js',
            'coalescing-saver.js',
        ],
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

    // 2d. Core renderer code (v2): ES modules under core/. The page's own code, so document lookups are fine; the
    // HTML sink guard applies.
    {
        files: ['core/**/*.js'],
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

    // 2e. Module UI code (v2): ES modules the host imports. M-2 and the HTML sink guard in one array, and imports
    // stay inside the module (mv/module-imports).
    {
        files: ['modules/*/ui/**/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: {
                ...globals.browser,
            },
        },
        plugins: { mv: mvPlugin },
        rules: {
            ...sharedRules,
            'no-undef': 'error',
            'no-restricted-syntax': ['error', ...HTML_SINK_SELECTORS, ...MODULE_BOUNDARY_SELECTORS],
            'mv/module-imports': 'error',
        },
    },

    // 2f. Module worker code (v2): module workers a module starts. The same rules as 2e, with worker globals.
    {
        files: ['modules/*/workers/**/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: {
                ...globals.worker,
            },
        },
        plugins: { mv: mvPlugin },
        rules: {
            ...sharedRules,
            'no-undef': 'error',
            'no-restricted-syntax': ['error', ...HTML_SINK_SELECTORS, ...MODULE_BOUNDARY_SELECTORS],
            'mv/module-imports': 'error',
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

    // 3a-jxl. Module Web Workers (ES module workers — `new Worker(url, { type: 'module' })`). The HTML sink guard too:
    // the renderer page imports hash-worker.js as well (hash-parity.js takes isYuvFormat from it).
    {
        files: ['jxl-decode-worker.js', 'hash-worker.js'],
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
            'no-restricted-syntax': htmlSinkGuard,
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
