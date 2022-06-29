import { AstroJSX, isVNode } from '../../jsx-runtime/index.js';
import {
	escapeHTML,
	Fragment,
	HTMLString,
	markHTMLString,
	renderComponent,
	renderToString,
	spreadAttributes,
	voidElementNames,
} from './index.js';

export async function renderJSX(result: any, vnode: any): Promise<any> {
	switch (true) {
		case vnode instanceof HTMLString:
			return vnode;
		case typeof vnode === 'string':
			return markHTMLString(escapeHTML(vnode));
		case !vnode && vnode !== 0:
			return '';
		case vnode.type === Fragment:
			return renderJSX(result, vnode.props.children);
		case Array.isArray(vnode):
			return markHTMLString(
				(await Promise.all(vnode.map((v: any) => renderJSX(result, v)))).join('')
			);
		case vnode.type.isAstroComponentFactory: {
			let props: Record<string, any> = {};
			let slots: Record<string, any> = {};
			for (const [key, value] of Object.entries(vnode.props ?? {})) {
				if (key === 'children' || value && typeof value === 'object' && (value as any)['$$slot']) {
					slots[key === 'children' ? 'default' : key] = () => renderJSX(result, value);
				} else {
					props[key] = value;
				}
			}
			return await renderToString(result, vnode.type, props, slots)	
		}
	}
	if (vnode[AstroJSX]) {
		if (!vnode.type && vnode.type !== 0) return '';
		if (typeof vnode.type === 'string') {
			return await renderElement(result, vnode.type, vnode.props ?? {});
		}
		if (!!vnode.type) {
			try {
				// TODO: silence Invalid hook call warning from React
				const output = await vnode.type(vnode.props ?? {});
				if (output && output[AstroJSX]) {
					return await renderJSX(result, output);
				} else if (!output) {
					return await renderJSX(result, output);
				}
			} catch (e) {}

			const { children = null, ...props } = vnode.props ?? {};
			const slots: Record<string, any> = {
				default: [],
			};
			function extractSlots(child: any): any {
				if (Array.isArray(child)) {
					return child.map((c) => extractSlots(c));
				}
				if (!isVNode(child)) {
					return slots.default.push(child);
				}
				if ('slot' in child.props) {
					slots[child.props.slot] = [...(slots[child.props.slot] ?? []), child];
					delete child.props.slot;
					return;
				}
				slots.default.push(child);
			}
			extractSlots(children);
			for (const [key, value] of Object.entries(slots)) {
				slots[key] = () => renderJSX(result, value);
			}
			return markHTMLString(
				await renderComponent(result, vnode.type.name, vnode.type, props, slots)
			);
		}
	}
	// numbers, plain objects, etc
	return markHTMLString(`${vnode}`);
}

async function renderElement(
	result: any,
	tag: string,
	{ children, ...props }: Record<string, any>
) {
	return markHTMLString(
		`<${tag}${spreadAttributes(props)}${markHTMLString(
			(children == null || children == '') && voidElementNames.test(tag)
				? `/>`
				: `>${children == null ? '' : await renderJSX(result, children)}</${tag}>`
		)}`
	);
}
