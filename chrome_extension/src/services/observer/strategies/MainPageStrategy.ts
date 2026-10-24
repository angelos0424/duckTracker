import { BaseStrategy } from './BaseStrategy';
import { DownloadObject, ElementTypes, FromType } from '@types';
import { SELECTORS, TOOLBAR_TARGETS } from '../../../config/selectors';

export class MainPageStrategy extends BaseStrategy {
	canHandle(url: string): boolean {
		return url === 'https://www.youtube.com/';
	}

	protected getContainer(trigger: Element, type: ElementTypes, from: string): Element | null {
		switch (type) {
			case ElementTypes.VIDEO:
			case ElementTypes.PLAYLIST:
				return trigger.closest(TOOLBAR_TARGETS.RICH_ITEM_RENDERER);
			case ElementTypes.SHORTS:
				return trigger.closest(TOOLBAR_TARGETS.SHORTS_LOCKUP_V2);
			default:
				return null; // Should not happen for Main Page logic usually
		}
	}

	findTargets(node: Element, onFound: (element: Element, object: DownloadObject) => void): void {
		const list = node.querySelectorAll(SELECTORS.MAIN.VIDEO_SELECTOR);
		list.forEach(el => {
			const els: DownloadObject = { type: ElementTypes.VIDEO, from: FromType.MAIN, url: '', urlId: '' };
			this.processElement(el, els, onFound);
		});
	}
}
