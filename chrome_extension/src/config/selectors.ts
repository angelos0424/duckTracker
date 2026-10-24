export const SELECTORS = {
	// Page Manager
	PAGE_MANAGER: 'ytd-app > #content > ytd-page-manager#page-manager',

	// Common Elements
	THUMBNAIL_ANCHOR: 'ytd-thumbnail > a#thumbnail',
	SHORTS_LOCKUP_LINK: 'ytm-shorts-lockup-view-model > a',
	LOCKUP_VIEW_MODEL_LINK: 'yt-lockup-view-model > div > a',

	// Valid Containers (Tag Names)
	VALID_TAGS: [
		'YTD-RICH-ITEM-RENDERER',
		'YTD-RICH-SECTION-RENDERER',
		'YTD-VIDEO-RENDERER',
		'YTD-REEL-VIDEO-RENDERER',
		'YTD-WATCH-FLEXY',
		'YT-LOCKUP-VIEW-MODEL',
		'GRID-SHELF-VIEW-MODEL',
		'YTD-PLAYER',
		'YTM-SHORTS-LOCKUP-VIEW-MODEL-V2',
		'YTD-ITEM-SECTION-RENDERER',
	],

	// Specific Pages
	MAIN: {
		VIDEO_SELECTOR: 'ytd-rich-item-renderer ytd-thumbnail > a#thumbnail, ytd-rich-section-renderer ytd-rich-item-renderer ytm-shorts-lockup-view-model > a, ytd-rich-item-renderer > div#content > yt-lockup-view-model > div > a'
	},
	SEARCH: {
		VIDEO_SELECTOR: 'ytd-video-renderer > div#dismissible > ytd-thumbnail > a#thumbnail, ytm-shorts-lockup-view-model-v2 > ytm-shorts-lockup-view-model > a, yt-lockup-view-model > div > a'
	},
	WATCH: {
		VIDEO_PLAYER_SELECTOR: 'ytd-watch-flexy[video-id]:not([hidden])',
		TOOLBAR_SELECTOR: 'ytd-player > div.trackerToolbar',
		RELATED_SHORTS_SELECTOR: 'ytm-shorts-lockup-view-model > a',
		RELATED_VIDEO_SELECTOR: 'div > a'
	},
	SHORTS: {
		REEL_RENDERER: 'ytd-reel-video-renderer',
		REEL_RENDERER_ID: 'ytd-reel-video-renderer#reel-video-renderer',
		TITLE_LINK_SELECTOR: 'ytd-player div.ytp-chrome-top > div.ytp-title > div.ytp-title-text > a'
	},
	CHANNEL: {
		VIDEO_TAB: {
			THUMBNAIL_SELECTOR: 'ytd-thumbnail > a#thumbnail'
		},
		SHORTS_TAB: {
			LOCKUP_SELECTOR: 'ytm-shorts-lockup-view-model-v2 > ytm-shorts-lockup-view-model > a'
		},
		PLAYLIST_TAB: {
			LOCKUP_SELECTOR: 'yt-lockup-view-model > div > a'
		}
	},
	PLAYLIST_FEED: {
		SELECTOR: 'ytd-rich-item-renderer > div#content > yt-lockup-view-model > div > a'
	},
	SUBSCRIPTION_FEED: {
		SELECTOR: 'ytd-reel-shelf-renderer ytm-shorts-lockup-view-model-v2 > ytm-shorts-lockup-view-model > a, ytd-shelf-renderer ytd-video-renderer ytd-thumbnail > a#thumbnail'
	}
};

export const TOOLBAR_TARGETS = {
	VIDEO_RENDERER: 'ytd-video-renderer',
	RICH_ITEM_RENDERER: 'ytd-rich-item-renderer',
	SHORTS_LOCKUP_V2: 'ytm-shorts-lockup-view-model-v2',
	LOCKUP_VIEW_MODEL: 'yt-lockup-view-model',
	THUMBNAIL: 'ytd-thumbnail',
	PLAYER: 'ytd-player#ytd-player',
	REEL_RENDERER: 'ytd-reel-video-renderer#reel-video-renderer'
};
