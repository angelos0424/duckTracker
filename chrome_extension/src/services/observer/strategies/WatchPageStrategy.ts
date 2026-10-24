import { BaseStrategy } from './BaseStrategy';
import { DownloadObject, ElementTypes, FromType } from '@types';
import { SELECTORS, TOOLBAR_TARGETS } from '../../../config/selectors';

export class WatchPageStrategy extends BaseStrategy {
	canHandle(url: string): boolean {
		return url.includes('/watch?');
	}

	protected getContainer(trigger: Element, type: ElementTypes, from: string): Element | null {
		switch (type) {
			case ElementTypes.VIDEO:
			case ElementTypes.PLAYLIST:
				return trigger.closest('div');
			case ElementTypes.SHORTS:
				return trigger.closest(TOOLBAR_TARGETS.SHORTS_LOCKUP_V2);
			case ElementTypes.VIDEOPLAYER:
				return trigger.querySelector(TOOLBAR_TARGETS.PLAYER);
			default:
				return null;
		}
	}

	findTargets(node: Element, onFound: (element: Element, object: DownloadObject) => void): void {
		// 1. Check for specific containers to narrow down
		switch (node.tagName) {
			case 'YTD-PAGE-MANAGER':
			case 'YTD-WATCH-FLEXY':
			case 'YTD-PLAYER': // Added YTD-PLAYER just in case
				this.processMainVideo(onFound);
				break;

			case 'YTM-SHORTS-LOCKUP-VIEW-MODEL-V2':
				node.querySelectorAll(SELECTORS.WATCH.RELATED_SHORTS_SELECTOR).forEach(el => {
					const els: DownloadObject = { type: ElementTypes.VIDEO, from: FromType.VIDEO, url: '', urlId: '' };
					this.processElement(el, els, onFound);
				});
				break;

			case 'YT-LOCKUP-VIEW-MODEL':
				const el = node.querySelector(SELECTORS.WATCH.RELATED_VIDEO_SELECTOR);
				if (el) {
					const els: DownloadObject = { type: ElementTypes.VIDEO, from: FromType.VIDEO, url: '', urlId: '' };
					this.processElement(el, els, onFound);
				}
				break;
		}

		// Always check for main video existence in case it wasn't caught by the specific cases above
		// This replicates the original logic that checks 'ytd-watch-flexy' at the end of the block
		this.processMainVideo(onFound);
	}

	private processMainVideo(onFound: (element: Element, object: DownloadObject) => void): void {
		const videoElement = document.querySelector(SELECTORS.WATCH.VIDEO_PLAYER_SELECTOR);
		if (!videoElement) return;

		if ((videoElement as HTMLElement).dataset.trackerProcessed) return;

		const hasToolbar = videoElement.querySelector(SELECTORS.WATCH.TOOLBAR_SELECTOR);
		if (hasToolbar) return;

		const els: DownloadObject = { type: ElementTypes.VIDEOPLAYER, from: FromType.VIDEO, url: '', urlId: '' };
		this.processElement(videoElement, els, onFound);
	}
}
