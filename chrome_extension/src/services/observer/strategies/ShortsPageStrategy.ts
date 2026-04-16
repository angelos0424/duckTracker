import { BaseStrategy } from './BaseStrategy';
import { DownloadObject, ElementTypes, FromType } from '@types';
import { SELECTORS, TOOLBAR_TARGETS } from '../../../config/selectors';

export class ShortsPageStrategy extends BaseStrategy {
	canHandle(url: string): boolean {
		return url.includes('/shorts/');
	}

	protected getContainer(trigger: Element, type: ElementTypes, from: string): Element | null {
		return trigger.closest(TOOLBAR_TARGETS.REEL_RENDERER);
	}

	findTargets(node: Element, onFound: (element: Element, object: DownloadObject) => void): void {
		const reelNode = node.tagName === 'YTD-REEL-VIDEO-RENDERER'
			? node
			: node.closest(SELECTORS.SHORTS.REEL_RENDERER_ID);

		if (!reelNode) return;

		// Use the logic from original Observer to observe title link
		this.processShortsTarget(reelNode as Element, onFound);
	}

	private processShortsTarget(reelNode: Element, onFound: (element: Element, object: DownloadObject) => void) {
		const selector = SELECTORS.SHORTS.TITLE_LINK_SELECTOR;

		const findAndProcess = () => {
			const target = reelNode.querySelector(selector) as HTMLAnchorElement;
			if (target && target.href) {
				const urlId = new URL(target.href).pathname.split('/')[2];

				// Check processed on target
				if ((target as HTMLElement).dataset.trackerProcessed === urlId) return true;

				const els: DownloadObject = { type: ElementTypes.SHORTS, from: FromType.SHORTS, url: '', urlId: '' };
				// Manually setting url/urlId since getElementsInfo relies on href which we have
				els.url = target.href;
				els.urlId = urlId;

				this.processElement(target, els, onFound);
				return true;
			}
			return false;
		};

		if (findAndProcess()) return;

		// Observer for async loading of title
		const tempObserver = new MutationObserver((mutations, obs) => {
			if (findAndProcess()) {
				obs.disconnect();
			}
		});

		tempObserver.observe(reelNode, { childList: true, subtree: true, attributes: true });
		setTimeout(() => tempObserver.disconnect(), 2000);
	}
}
