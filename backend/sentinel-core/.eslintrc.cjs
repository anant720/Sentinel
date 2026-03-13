module.exports = {
    root: true,
    parser: '@typescript-eslint/parser',
    plugins: ['@typescript-eslint'],
    parserOptions: {
        project: ['./tsconfig.json'],
        sourceType: 'module',
    },
    extends: [
        'eslint:recommended',
        'plugin:@typescript-eslint/recommended'
    ],
    rules: {
        '@typescript-eslint/no-floating-promises': 'warn',
        '@typescript-eslint/no-explicit-any': 'warn',
        '@typescript-eslint/no-unsafe-assignment': 'warn',
        '@typescript-eslint/no-unused-vars': 'warn',
        'no-unused-vars': 'warn',
        'no-useless-catch': 'warn'
    },
    ignorePatterns: [
        'dist',
        'node_modules',
        '*.js',
        '*.cjs',
        'tests/**/*.ts',
        'scripts/**/*.ts',
        'modules/**/*.ts'
    ]
};
