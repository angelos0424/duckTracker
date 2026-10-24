import { DownloadObject, ElementTypes, FromType } from '@types';
import { IObserverStrategy } from '../ObserverStrategy';

export abstract class BaseStrategy implements IObserverStrategy {
	abstract canHandle(url: string): boolean;
	abstract findTargets(node: Element, onFound: (element: Element, object: DownloadObject) => void): void;

	/**
	 * Defines how to find the container for the toolbar relative to the detected target element.
	 * Can be overridden by strategies if complex logic is needed.
	 */
	protected getContainer(trigger: Element, type: ElementTypes, from: string): Element | null {
		// Default implementation might return null or handle common cases if we want.
		// For now, let's force specific strategies to implement it if they don't use this default.
		// OR, we can implement the common logic here if we pass the selector targets.
		return null;
	}

	protected getElementsInfo(el: Element, els: DownloadObject): DownloadObject | undefined {
		try {
			const isVideoPlayer = els.type === ElementTypes.VIDEOPLAYER;
			const url = isVideoPlayer ? window.location.href : (el as HTMLAnchorElement).href;

			if (!url) return;

			const list = url.indexOf('&list=') > 0;
			const shorts = url.indexOf('/shorts/') > 0;

			// Override type if detected
			els.type = isVideoPlayer ? els.type : list ? ElementTypes.PLAYLIST : shorts ? ElementTypes.SHORTS : ElementTypes.VIDEO;
			els.url = url;
			els.urlId = this.extractUrlId(url, els.type);

			return els;
		} catch (e) {
			console.error('Error extracting URL ID:', e, el);
		}
	}

	protected extractUrlId(src: string, type: ElementTypes): string | null {
		try {
			const urlObj = new URL(src);

			switch (type) {
				case ElementTypes.VIDEO:
					return urlObj.searchParams.get('v');
				case ElementTypes.PLAYLIST:
					return urlObj.searchParams.get('list');
				case ElementTypes.SHORTS:
					return urlObj.pathname.split('/')[2];
				case ElementTypes.VIDEOPLAYER:
					return urlObj.searchParams.get('v');
				default:
					return null;
			}
		} catch (e) {
			console.error('Error extracting URL ID:', e, src);
			return null;
		}
	}

	protected processElement(el: Element, els: DownloadObject, onFound: (element: Element, object: DownloadObject) => void): void {
		if ((el as HTMLElement).dataset.trackerProcessed) return;

		// Additional check for processed with specific ID if applicable (handled in logic or here)
		// For now simple boolean check or ID check. 
		// Ideally we should track *what* execution processed it. 

		// In original code: (el as HTMLElement).dataset.trackerProcessed = 'true' or urlId;

		this.getElementsInfo(el, els);
		if (!els.urlId) return;

		if ((el as HTMLElement).dataset.trackerProcessed === els.urlId) return;

		const container = this.getContainer(el, els.type, els.from);
		if (!container) {
			// Ideally log this if verbose
			return;
		}

		onFound(container, els);
		(el as HTMLElement).dataset.trackerProcessed = els.urlId || 'true';
	}
}
