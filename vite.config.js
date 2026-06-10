const repo = process.env.GITHUB_REPOSITORY?.split('/')[1];

export default {
  base: repo ? `/${repo}/` : '/',
  esbuild: {
    jsxImportSource: 'react',
    jsx: 'automatic',
  },
}
