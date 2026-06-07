import antfu from '@antfu/eslint-config'

export default antfu({
  type: 'lib',

  stylistic: {
    indent: 2,
    quotes: 'single',
    semi: false,
  },

  vue: true,
  typescript: true,

  ignores: [
    'dist/',
    'demo-dist/',
    'server/dist/',
    'public/',
  ],

  gitignore: true,
})
