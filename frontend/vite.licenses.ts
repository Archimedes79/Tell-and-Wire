import type { Plugin } from 'vite'
import { readFileSync, readdirSync } from 'fs'
import { createRequire } from 'module'
import path from 'path'

/**
 * `licenses.txt` beside the built page: every package it is made of, with its
 * licence text. Most of them (MIT, ISC, BSD) are given on condition that their
 * notice goes with every copy, and a minified build keeps hardly any of it.
 * Each page links the file (`rel="license"`), which is also how a deploy
 * bundle, carrying what `gui.html` references, comes to carry it.
 */
export function licenses(): Plugin {
  const folderOf = (name: string): string =>
    path.dirname(createRequire(import.meta.url).resolve(`${name}/package.json`)).replace(/\\/g, '/')
  return {
    name: 'licenses',
    apply: 'build',
    transformIndexHtml: () => [{ tag: 'link', attrs: { rel: 'license', href: '/licenses.txt' }, injectTo: 'head' }],
    generateBundle(_options, bundle) {
      // A package's folder, and the licence file that covers what of it is in
      // the page -- its own, unless named. Two reach the page without being
      // imported, so no module names them: the base stylesheet `@tailwind base`
      // writes in, under the licence of the stylesheets it was made from, and
      // the loader the bundler adds for the page's chunks.
      const packages = new Map([[folderOf('tailwindcss'), 'src/css/LICENSE'], [folderOf('vite'), '']])
      for (const file of Object.values(bundle)) {
        if (file.type !== 'chunk') continue
        for (const [id, module] of Object.entries(file.modules)) {
          const where = id.replace(/^\0/, '').replace(/\?.*$/, '').replace(/\\/g, '/')
          const at = where.lastIndexOf('/node_modules/')
          if (at < 0 || !module.renderedLength) continue
          const [first, second] = where.slice(at + '/node_modules/'.length).split('/')
          packages.set(`${where.slice(0, at)}/node_modules/${first.startsWith('@') ? `${first}/${second}` : first}`, '')
        }
      }
      const notices = [...packages].map(([folder, named]) => {
        const { name, version, license } = JSON.parse(readFileSync(`${folder}/package.json`, 'utf8'))
        const text = named || readdirSync(folder).find((entry) => /^licen[cs]e/i.test(entry))
        return {
          name,
          // A licence file that goes on to list what its package bundles is cut
          // there: that code is not in this page.
          notice: `${name} ${version} (${license})\n\n${text
            ? readFileSync(`${folder}/${text}`, 'utf8').split(/^#+ Licenses of bundled dependencies/m)[0].trim()
            : 'The package carries no licence text of its own.'}`,
        }
      }).sort((a, b) => a.name.localeCompare(b.name))
      this.emitFile({
        type: 'asset',
        fileName: 'licenses.txt',
        source: ['The packages this page is built from, and the terms each comes under.', ...notices.map((each) => each.notice)]
          .join(`\n\n${'-'.repeat(72)}\n\n`) + '\n',
      })
    },
  }
}
