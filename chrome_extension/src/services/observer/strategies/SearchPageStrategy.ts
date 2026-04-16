import { BaseStrategy } from './BaseStrategy';
import { DownloadObject, ElementTypes, FromType } from '@types';
import { SELECTORS, TOOLBAR_TARGETS } from '../../../config/selectors';

export class SearchPageStrategy extends BaseStrategy {
	canHandle(url: string): boolean {
		return url.includes('/results?');
	}

	protected getContainer(trigger: Element, type: ElementTypes, from: string): Element | null {
		switch (type) {
			case ElementTypes.VIDEO:
				return trigger.closest(TOOLBAR_TARGETS.VIDEO_RENDERER);
			case ElementTypes.PLAYLIST:
				return trigger.closest(TOOLBAR_TARGETS.LOCKUP_VIEW_MODEL);
			case ElementTypes.SHORTS:
				return trigger.closest(TOOLBAR_TARGETS.SHORTS_LOCKUP_V2);
			default:
				return null;
		}
	}

	findTargets(node: Element, onFound: (element: Element, object: DownloadObject) => void): void {
		node.querySelectorAll(SELECTORS.SEARCH.VIDEO_SELECTOR)
			.forEach(el => {
				const els: DownloadObject = { type: ElementTypes.VIDEO, from: FromType.SEARCH, url: '', urlId: '' };
				this.processElement(el, els, onFound);
			});
	}
}

