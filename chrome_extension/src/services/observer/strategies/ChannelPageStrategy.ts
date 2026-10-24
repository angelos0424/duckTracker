import { BaseStrategy } from './BaseStrategy';
import { DownloadObject, ElementTypes, FromType } from '@types';
import { SELECTORS, TOOLBAR_TARGETS } from '../../../config/selectors';

export class ChannelPageStrategy extends BaseStrategy {
	canHandle(url: string): boolean {
		return url.startsWith('https://www.youtube.com/@');
	}

	protected getContainer(trigger: Element, type: ElementTypes, from: string): Element | null {
		switch (type) {
			case ElementTypes.VIDEO:
				return trigger.closest(TOOLBAR_TARGETS.THUMBNAIL);
			case ElementTypes.SHORTS:
				return trigger.closest(TOOLBAR_TARGETS.SHORTS_LOCKUP_V2);
			case ElementTypes.PLAYLIST:
				return trigger;
			default:
				return null;
		}
	}

	findTargets(node: Element, onFound: (element: Element, object: DownloadObject) => void): void {
		const url = window.location.href;
		const channelPath = url.split('/')[4]?.split('?')[0] ?? '';


		if (channelPath === 'playlists') {
			const processPlaylist = (n: Element) => {
				n.querySelectorAll(SELECTORS.CHANNEL.PLAYLIST_TAB.LOCKUP_SELECTOR)
					.forEach(el => {
						const els: DownloadObject = { type: ElementTypes.PLAYLIST, from: FromType.CHANNEL, url: '', urlId: '' };
						this.processElement(el, els, onFound);
					});
			};

			if (node.tagName === 'YT-LOCKUP-VIEW-MODEL') {
				processPlaylist(node);
			} else {
				node.querySelectorAll('yt-lockup-view-model').forEach(processPlaylist);
			}

		} else if (channelPath === 'videos') {
			const targetTag = TOOLBAR_TARGETS.RICH_ITEM_RENDERER.toUpperCase(); // YTD-RICH-ITEM-RENDERER

			if (node.tagName === targetTag) {
				this.processChannelVideo(node, onFound);
			} else {
				node.querySelectorAll(TOOLBAR_TARGETS.RICH_ITEM_RENDERER).forEach((el) => {
					this.processChannelVideo(el, onFound);
				});
			}

		} else if (channelPath === 'shorts') {
			const processShorts = (n: Element) => {
				n.querySelectorAll(SELECTORS.CHANNEL.SHORTS_TAB.LOCKUP_SELECTOR).forEach(el => {
					const els: DownloadObject = { type: ElementTypes.SHORTS, from: FromType.CHANNEL, url: '', urlId: '' };
					this.processElement(el, els, onFound);
				});
			}

			const targetTag = TOOLBAR_TARGETS.RICH_ITEM_RENDERER.toUpperCase();

			if (node.tagName === targetTag) {
				processShorts(node);
			} else {
				node.querySelectorAll(TOOLBAR_TARGETS.RICH_ITEM_RENDERER).forEach(processShorts);
			}
		}
	}

	private processChannelVideo(node: Element, onFound: (element: Element, object: DownloadObject) => void) {
		const selector = SELECTORS.CHANNEL.VIDEO_TAB.THUMBNAIL_SELECTOR;

		const findAndProcess = () => {
			const target = node.querySelector(selector) as HTMLAnchorElement;
			if (target && target.href) {
				const urlId = new URL(target.href).searchParams.get('v') || 'checked';
				if ((target as HTMLElement).dataset.trackerProcessed === urlId) return true;

				const els: DownloadObject = { type: ElementTypes.VIDEO, from: FromType.CHANNEL, url: '', urlId: '' };
				this.processElement(target, els, onFound);
				// Override processed value to be urlId if processElement set it to true/urlId
				// But BaseStrategy sets it. 
				return true;
			}
			return false;
		}

		if (findAndProcess()) return;

		const tempObserver = new MutationObserver((mutations, obs) => {
			if (findAndProcess()) obs.disconnect();
		});

		tempObserver.observe(node, { childList: true, subtree: true, attributes: true });
		setTimeout(() => tempObserver.disconnect(), 2000);
	}
}
