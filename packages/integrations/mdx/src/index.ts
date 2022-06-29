import type { AstroIntegration } from 'astro';
import mdxPlugin from '@mdx-js/rollup';

export default function mdx(): AstroIntegration {
	return {
			name: '@astrojs/mdx',
			hooks: {
				'astro:config:setup': ({ updateConfig, addPageExtension, command }: any) => {
					addPageExtension('.mdx');
					updateConfig({
						vite: {
							plugins: [
								{ 	
									enforce: 'pre',
									...mdxPlugin({
										jsx: true,
										jsxImportSource: 'astro'
									})
								},
								command === 'dev' && {
									name: '@astrojs/mdx',
									transform(code: string, id: string) {
										if (!id.endsWith('.mdx')) return;
										return `${code}\nif (import.meta.hot) {
											import.meta.hot.decline();
										}`
									}
								}
							]
						}
					})
				}
			}
		}
}
