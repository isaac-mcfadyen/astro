import fs from 'fs/promises';
import path from 'path';
import sharp from './loaders/sharp.js';
import { ensureDir, isRemoteImage, loadImage, propsToFilename } from './utils.js';
import { createPlugin } from './vite-plugin-astro-image.js';
import type { AstroConfig, AstroIntegration } from 'astro';
import type { ImageAttributes, ImageProps, IntegrationOptions, SSRImageService } from './types.js';

const PKG_NAME = '@astrojs/image';
const ROUTE_PATTERN = '/_image';
const OUTPUT_DIR = '/_image';

/**
 * Gets the HTML attributes required to build an `<img />` for the transformed image.
 * 
 * @param loader @type {ImageService} The image service used for transforming images.
 * @param props @type {ImageProps} The transformations requested for the optimized image.
 * @returns @type {ImageAttributes} The HTML attributes to be included on the built `<img />` element.
 */
export async function getImage(loader: SSRImageService, props: ImageProps): Promise<ImageAttributes> {
	(globalThis as any).loader = loader;

  const attributes = await loader.getImageAttributes(props);
	const { searchParams } = loader.serializeImageProps(props);

	if (globalThis && (globalThis as any).addStaticImage) {
		(globalThis as any)?.addStaticImage(props);
	}
	const src = globalThis && (globalThis as any).filenameFormat
		? (globalThis as any).filenameFormat(props, searchParams)
		: `${ROUTE_PATTERN}?${searchParams.toString()}`;

	return {
		...attributes,
		src
	}
}

const createIntegration = (options: IntegrationOptions = {}): AstroIntegration => {
	const resolvedOptions = {
		serviceEntryPoint: '@astrojs/image/sharp',
		...options
	};

	// During SSG builds, this is used to track all transformed images required.
	const staticImages = new Map<string, ImageProps>();

	let _config: AstroConfig;

	function getViteConfiguration() {
		return {
			plugins: [
				createPlugin(_config, resolvedOptions)
			]
		}
	}

	return {
		name: PKG_NAME,
		hooks: {
			'astro:config:setup': ({ command, config, injectRoute, updateConfig }) => {
				_config = config;
				const mode = command === 'dev' || config.adapter ? 'ssr' : 'ssg';

				updateConfig({ vite: getViteConfiguration() });

				(globalThis as any).addStaticImage = (props: ImageProps) => {
					staticImages.set(propsToFilename(props), props);
				}

				(globalThis as any).filenameFormat = (props: ImageProps, searchParams: URLSearchParams) => {
					if (mode === 'ssg') {
						return path.join(OUTPUT_DIR, path.dirname(props.src), path.basename(propsToFilename(props)));
					} else {
						return `${ROUTE_PATTERN}?${searchParams.toString()}`;
					}
				}

				if (mode === 'ssr') {
					injectRoute({
						pattern: ROUTE_PATTERN,
						entryPoint: command === 'dev' ? '@astrojs/image/endpoints/dev' : '@astrojs/image/endpoints/prod'
					});
				}
			},
			'astro:build:done': async ({ dir }) => {
				for await (const [_, props] of staticImages) {
					// load and transform the input file
					const src = isRemoteImage(props.src)
						? props.src
						: path.join(_config.srcDir.pathname, props.src.replace(/^\/image/, ''));
					const inputBuffer = await loadImage(src);

					if (!inputBuffer) {
						console.warn(`"${props.src}" image not found`);
						continue;
					}
					const { data } = await sharp.toBuffer(inputBuffer, props);

					// output to dist folder
					const outputFile = path.join(dir.pathname, OUTPUT_DIR, propsToFilename(props));
					ensureDir(path.dirname(outputFile));
					await fs.writeFile(outputFile, data);
				}
			}
		}
	}
}

export default createIntegration;