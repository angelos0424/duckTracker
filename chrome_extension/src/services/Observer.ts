// services/Observer.ts
export enum ElementTypes {
  VIDEO = 'VIDEO',
  SHORTS = 'SHORTS',
  PLAYLIST = 'PLAYLIST',
  VIDEOPLAYER = 'VIDEOPLAYER',
}

export enum FromType {
  MAIN = 'MAIN',
  SEARCH = 'SEARCH',
  PLAYLIST = 'PLAYLIST',
  CHANNEL = 'CHANNEL',
  SUBSCRIPT = 'SUBSCRIPT',
  VIDEO = 'VIDEO',
  SHORTS = 'SHORTS',
}

export interface DownloadObject {
  type: ElementTypes;
  from: FromType;
  url: string;
  urlId?: string | null;
}

export class Observer {
  private observer: MutationObserver | null = null;

  constructor(private readonly onElementFound: (element: Element, elementType: DownloadObject) => void) {}

  public init(): void {
    const targetElement = document.querySelector('ytd-app > #content > ytd-page-manager#page-manager');
    if (!targetElement) {
      setTimeout(() => this.init(), 100);
      return;
    }

    this.scanForExistingElements(targetElement);
    this.setupObserver(targetElement);
  }

  private scanForExistingElements(targetElement: Element): void {
    this.findElements(targetElement, 'scanForExistingElements');
  }

  private setupObserver(targetElement: Element): void {
    this.observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach(node => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const tagName = (node as Element).tagName;
              // yt-lockup-view-model -> 검색 : PlayList
              // ytd-video-renderer -> 검색 : 영상
              // GRID-SHELF-VIEW-MODEL -> 검색 : 숏츠목록
              const validName = [
                'YTD-RICH-ITEM-RENDERER',
                'YTD-RICH-SECTION-RENDERER',
                'YTD-VIDEO-RENDERER',
                'YTD-REEL-VIDEO-RENDERER', // Shorts 페이지
                'YTD-WATCH-FLEXY',
                // 'YTD-SHORTS',
                'YT-LOCKUP-VIEW-MODEL',
                'GRID-SHELF-VIEW-MODEL',
                'YTD-PLAYER',
                'YTM-SHORTS-LOCKUP-VIEW-MODEL-V2',
                'YTD-ITEM-SECTION-RENDERER', // 구독 페이지 , 채널 - 홈
                // 'YTD-GRID-VIDEO-RENDERER' // 채널 - 홈
              ];

              if (!validName.includes(tagName)) {
                return;
              }
              this.findElements(node as Element, 'setupObserver'); // 전부 위 태그로 분류가 가능.
            }
          });
        }
      });
    });

    this.observer.observe(targetElement, {
      childList: true,
      subtree: true,
    });
  }

  private getElementsInfo = (el : Element, els: DownloadObject)=> {
    try {
      const isVideoPlayer = els.type === ElementTypes.VIDEOPLAYER;

      const url = isVideoPlayer ? window.location.href : (el as HTMLAnchorElement).href;

      if (!url) return;

      const list = url.indexOf('&list=') > 0
      const shorts = url.indexOf('/shorts/') > 0;
      els.type = isVideoPlayer ? els.type : list ? ElementTypes.PLAYLIST : shorts ? ElementTypes.SHORTS : ElementTypes.VIDEO;
      els.url = url;
      els.urlId = this.extractUrlId(url, els.type);

      return els;
    } catch (e) {
      console.error('Error extracting URL ID:', e, el);
    }
  }

  private extractUrlId(src: string, type: ElementTypes): string | null {
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
  private findElements(node: Element, origin:string): void {
    const url = window.location.href;

    // 1. 메인 페이지
    if (url === 'https://www.youtube.com/') {
      node.querySelectorAll('ytd-rich-item-renderer ytd-thumbnail > a#thumbnail, ytd-rich-section-renderer ytd-rich-item-renderer ytm-shorts-lockup-view-model > a, ytd-rich-item-renderer > div#content > yt-lockup-view-model > div > a')
        .forEach(el => {
          if ((el as HTMLElement).dataset.trackerProcessed) return;
          const els: DownloadObject = { type: ElementTypes.VIDEO, from: FromType.MAIN, url: '', urlId: '' };
          this.getElementsInfo(el, els);
          this.onElementFound(el, els);
          (el as HTMLElement).dataset.trackerProcessed = 'true';
        });
    }
    // 2. 검색 페이지
    else if (url.includes('/results?')) {
      console.log('검색페이지')
      node.querySelectorAll('ytd-video-renderer > div#dismissible > ytd-thumbnail > a#thumbnail, ytm-shorts-lockup-view-model-v2 > ytm-shorts-lockup-view-model > a, yt-lockup-view-model > div > a')
        .forEach(el => {
          if ((el as HTMLElement).dataset.trackerProcessed) return;
          const els: DownloadObject = { type: ElementTypes.VIDEO, from: FromType.SEARCH, url: '', urlId: '' };
          this.getElementsInfo(el, els);
          this.onElementFound(el, els);
          (el as HTMLElement).dataset.trackerProcessed = 'true';
        });
    }
    // 3. 동영상 단일 페이지
    else if (url.includes('/watch?')) {
      console.log('동영상 단일 페이지')
      switch (node.tagName) {
        case 'YTD-PAGE-MANAGER':
        case 'YTD-WATCH-FLEXY':
          const videoElement = document.querySelector('ytd-watch-flexy[video-id]:not([hidden])');
          if (videoElement) {
            if ((videoElement as HTMLElement).dataset.trackerProcessed) return;
            const hasToolbar = videoElement.querySelector('ytd-player > div.trackerToolbar');
            if (hasToolbar) return;
            // toolbar 달렸는지 확인 후 없으면.
            const els: DownloadObject = { type: ElementTypes.VIDEOPLAYER, from: FromType.VIDEO, url: '', urlId: '' };
            this.getElementsInfo(videoElement, els);
            this.onElementFound(videoElement, els);
            (videoElement as HTMLElement).dataset.trackerProcessed = 'true';
          }
          break;
        case 'YTM-SHORTS-LOCKUP-VIEW-MODEL-V2':
          node.querySelectorAll('ytm-shorts-lockup-view-model > a').forEach(el => {
            if ((el as HTMLElement).dataset.trackerProcessed) return;
            const els: DownloadObject = { type: ElementTypes.VIDEO, from: FromType.VIDEO, url: '', urlId: '' };
            this.getElementsInfo(el, els);
            this.onElementFound(el, els);
            (el as HTMLElement).dataset.trackerProcessed = 'true';
          });
          break;
        case 'YT-LOCKUP-VIEW-MODEL':
          const el = node.querySelector('div > a');
          if (!el) return;
          if ((el as HTMLElement).dataset.trackerProcessed) return;
          const els: DownloadObject = { type: ElementTypes.VIDEO, from: FromType.VIDEO, url: '', urlId: '' };
          this.getElementsInfo(el, els);
          this.onElementFound(el, els);
          (el as HTMLElement).dataset.trackerProcessed = 'true';
          break;
      }

      const videoElement = document.querySelector('ytd-watch-flexy[video-id]:not([hidden])');
      if (videoElement) {
        if ((videoElement as HTMLElement).dataset.trackerProcessed) return;
        const els: DownloadObject = { type: ElementTypes.VIDEOPLAYER, from: FromType.VIDEO, url: '', urlId: '' };
        this.getElementsInfo(videoElement, els);
        this.onElementFound(videoElement, els);
        (videoElement as HTMLElement).dataset.trackerProcessed = 'true';
      }
    }
    // 4. 숏츠 단일 페이지
    else if (url.includes('/shorts/')) {
      console.log('숏츠 단일 페이지')
      if (node.tagName !== 'YTD-REEL-VIDEO-RENDERER') return;

      const selector = 'ytd-player div.ytp-chrome-top > div.ytp-title > div.ytp-title-text > a';

      const findAndProcessShortsTarget = (targetNode: Element) => {
        const target = targetNode.querySelector(selector) as HTMLAnchorElement;
        if (target) {
          const targetHref = target?.href;
          if (!targetHref) return false;

          const urlId = new URL(targetHref).pathname.split('/')[2];
          if ((target as HTMLAnchorElement).dataset.trackerProcessed === urlId) return false;

          const els: DownloadObject = { type: ElementTypes.SHORTS, from: FromType.SHORTS, url: '', urlId: '' };
          this.getElementsInfo(target, els);
          this.onElementFound(target, els);
          (target as HTMLElement).dataset.trackerProcessed = urlId;
          return true;
        }
        return false;
      };

      // Try to find immediately
      if (findAndProcessShortsTarget(node)) {
        return;
      }

      // If not found, set up a temporary observer
      const tempObserver = new MutationObserver((mutations, observer) => {
        for (const mutation of mutations) {
          if (mutation.type === 'childList' || mutation.type === 'attributes') {
            if (findAndProcessShortsTarget(node)) {
              observer.disconnect();
              return;
            }
          }
        }
      });

      tempObserver.observe(node, {
        childList: true,
        subtree: true,
      });

      // Set a timeout to disconnect the observer if the element doesn't appear
      setTimeout(() => {
        if (tempObserver) {
          tempObserver.disconnect();
        }
      }, 2000); // 5 seconds timeout
    } else if (url.startsWith('https://www.youtube.com/@')) {
      // 채널 들어옴.
      console.log('채널 페이지', url);
      if (url.split('/')[4] === 'playlists') {
        if (node.tagName !== 'YT-LOCKUP-VIEW-MODEL') return;
        node.querySelectorAll('yt-lockup-view-model > div > a')
          .forEach(el => {
            if ((el as HTMLElement).dataset.trackerProcessed) return;
            const els: DownloadObject = { type: ElementTypes.PLAYLIST, from: FromType.CHANNEL, url: '', urlId: '' };
            this.getElementsInfo(el, els);
            this.onElementFound(el, els);
            (el as HTMLElement).dataset.trackerProcessed = 'true';
          })
      } else if (url.split('/')[4] === 'videos') {
        console.log('채널 -> 비디오', node)
        if (node.tagName !== 'YTD-RICH-ITEM-RENDERER') return;

        const selector = 'ytd-thumbnail > a#thumbnail';

        const findAndProcessChannelVideoTarget = (targetNode: Element) => {
          const target = targetNode.querySelector(selector) as HTMLAnchorElement;
          console.log('find target', target)
          if (target) {
            const targetHref = target?.href;
            if (!targetHref) return false;

            const urlId = new URL(targetHref).searchParams.get('v') || 'checked';
            if ((target as HTMLAnchorElement).dataset.trackerProcessed === urlId) return false;

            const els: DownloadObject = { type: ElementTypes.VIDEO, from: FromType.CHANNEL, url: '', urlId: '' };
            this.getElementsInfo(target, els);
            this.onElementFound(target, els);
            (target as HTMLElement).dataset.trackerProcessed = urlId;
            return true;
          }
          return false;
        };

        // Try to find immediately
        if (findAndProcessChannelVideoTarget(node)) {
          return;
        }

        // If not found, set up a temporary observer
        const tempObserver = new MutationObserver((mutations, observer) => {
          for (const mutation of mutations) {
            if (mutation.type === 'childList' || mutation.type === 'attributes') {
              if (findAndProcessChannelVideoTarget(node)) {
                observer.disconnect();
                return;
              }
            }
          }
        });

        tempObserver.observe(node, {
          childList: true,
          subtree: true,
        });

        // Set a timeout to disconnect the observer if the element doesn't appear
        setTimeout(() => {
          if (tempObserver) {
            tempObserver.disconnect();
          }
        }, 2000); // 5 seconds timeout

        node.querySelectorAll('ytd-thumbnail > a#thumbnail')
          .forEach(el => {
            console.log(el);
            if ((el as HTMLElement).dataset.trackerProcessed) return;
            const els: DownloadObject = { type: ElementTypes.VIDEO, from: FromType.CHANNEL, url: '', urlId: '' };
            this.getElementsInfo(el, els);
            this.onElementFound(el, els);
            console.log(els);
            (el as HTMLElement).dataset.trackerProcessed = 'true';
          })
      } else if (url.split('/')[4] === 'shorts') {
        if (node.tagName !== 'YTD-RICH-ITEM-RENDERER') return;

        node.querySelectorAll('ytm-shorts-lockup-view-model-v2 > ytm-shorts-lockup-view-model > a').forEach(el => {
          if ((el as HTMLElement).dataset.trackerProcessed) return;
          const els: DownloadObject = { type: ElementTypes.SHORTS, from: FromType.CHANNEL, url: '', urlId: '' };
          this.getElementsInfo(el, els);
          this.onElementFound(el, els);
          (el as HTMLElement).dataset.trackerProcessed = 'true';
        });

      }
    }
    // 5. 재생목록 페이지
    else if (url.includes('/feed/playlists')) {
      console.log('재생목록 페이지')
      node.querySelectorAll('ytd-rich-item-renderer > div#content > yt-lockup-view-model > div > a')
        .forEach(el => {
          if ((el as HTMLElement).dataset.trackerProcessed) return;
          const els: DownloadObject = { type: ElementTypes.PLAYLIST, from: FromType.PLAYLIST, url: '', urlId: '' };
          this.getElementsInfo(el, els);
          this.onElementFound(el, els);
          (el as HTMLElement).dataset.trackerProcessed = 'true';
        });
    }
    else if (url.includes('/feed/subscriptions')) {
      node.querySelectorAll('ytd-reel-shelf-renderer ytm-shorts-lockup-view-model-v2 > ytm-shorts-lockup-view-model > a, ytd-shelf-renderer ytd-video-renderer ytd-thumbnail > a#thumbnail')
        .forEach(el => {
          if ((el as HTMLElement).dataset.trackerProcessed) return;
          const els: DownloadObject = { type: ElementTypes.VIDEO, from: FromType.SUBSCRIPT, url: '', urlId: '' };
          this.getElementsInfo(el, els);
          this.onElementFound(el, els);
          (el as HTMLElement).dataset.trackerProcessed = 'true';
        })
    }
  }

  public disconnect(): void {
    this.observer?.disconnect();
  }
}
