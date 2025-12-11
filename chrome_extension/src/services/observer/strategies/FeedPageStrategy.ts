import { BaseStrategy } from './BaseStrategy';
import { DownloadObject, ElementTypes, FromType } from '@types';
import { SELECTORS, TOOLBAR_TARGETS } from '../../../config/selectors';

export class FeedPageStrategy extends BaseStrategy {
	canHandle(url: string): boolean {
		return url.includes('/feed/playlists') || url.includes('/feed/subscriptions');
	}

	protected getContainer(trigger: Element, type: ElementTypes, from: string): Element | null {
		if (from === FromType.PLAYLIST) {
			return trigger.closest(TOOLBAR_TARGETS.RICH_ITEM_RENDERER);
		}

		// Subscription Feed
		switch (type) {
			case ElementTypes.VIDEO:
			case ElementTypes.PLAYLIST:
				return trigger.closest(TOOLBAR_TARGETS.VIDEO_RENDERER);
			case ElementTypes.SHORTS:
				return trigger.closest(TOOLBAR_TARGETS.SHORTS_LOCKUP_V2);
			default:
				return null;
		}
	}

	findTargets(node: Element, onFound: (element: Element, object: DownloadObject) => void): void {
		const url = window.location.href;

		if (url.includes('/feed/playlists')) {
			node.querySelectorAll(SELECTORS.PLAYLIST_FEED.SELECTOR)
				.forEach(el => {
					const els: DownloadObject = { type: ElementTypes.PLAYLIST, from: FromType.PLAYLIST, url: '', urlId: '' };
					this.processElement(el, els, onFound);
				});
		} else if (url.includes('/feed/subscriptions')) {
			node.querySelectorAll(SELECTORS.SUBSCRIPTION_FEED.SELECTOR)
				.forEach(el => {
					const els: DownloadObject = { type: ElementTypes.VIDEO, from: FromType.SUBSCRIPT, url: '', urlId: '' };
					this.processElement(el, els, onFound);
				})
		}
	}
}
