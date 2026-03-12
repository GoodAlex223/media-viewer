// ESLint flat configuration for Electron media_viewer project.
//
// Four JS environments:
//   1. Node/Electron main process  — main.js
//   1b. Electron preload           — preload.js (Node + browser hybrid)
//   2a. Browser renderer (module)  — media-viewer.js (loaded as type="module")
//   2b. Browser renderer (script)  — face-detector.js (loaded as plain <script>)
//   3a. Web Workers                — sorting-worker.js, ml-worker.js, feature-worker.js
//   3b. Shared libs (worker-loaded) — feature-extractor.js, ml-model.js
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
        files: ['main.js'],
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

    // 3b. Shared libraries loaded via importScripts (have conditional CJS export pattern)
    {
        files: ['feature-extractor.js', 'ml-model.js'],
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

    // 4. Test files (Vitest)
    {
        files: ['tests/**/*.js', 'vitest.config.js'],
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

    // Disable ESLint rules that conflict with Prettier (must be last)
    eslintConfigPrettier,
];
