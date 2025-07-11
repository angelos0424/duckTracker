// services/Observer.ts
export enum ElementTypes {
  VIDEO = 'VIDEO',
  SHORTS = 'SHORTS',
  PLAYLIST = 'PLAYLIST',
  SEARCH = 'SEARCH',
  MAIN = 'MAIN',
}

export class Observer {
  private observer: MutationObserver | null = null;

  constructor(private readonly onElementFound: (element: Element, elementType: ElementTypes) => void) {}

  public init(): void {
    const targetElement = document.querySelector('ytd-app > #content > ytd-page-manager#page-manager');

    if (!targetElement) {
      setTimeout(() => this.init(), 1000);
      return;
    }

    this.scanForExistingElements(targetElement);
    this.setupObserver(targetElement);
  }

  private scanForExistingElements(targetElement: Element): void {
    this.findElements(targetElement);
  }

  private setupObserver(targetElement: Element): void {
    this.observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach(node => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const tagName = (node as Element).tagName;
              const validName = ['YTD-RICH-ITEM-RENDERER', 'YTD-RICH-SECTION-RENDERER', 'YTD-VIDEO-RENDERER', 'YTD-REEL-SHELF-RENDERER', 'YTD-WATCH-FLEXY', 'YTD-SHORTS']
              if (!validName.includes(tagName)) return;
              this.findElements(node as Element);
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

  private findElements(node: Element): void {
    const url = window.location.href;
    // 1. 메인 페이지
    if (url === 'https://www.youtube.com/') {
        node.querySelectorAll('ytd-rich-item-renderer ytd-thumbnail > a#thumbnail, ytd-rich-section-renderer ytd-rich-item-renderer ytm-shorts-lockup-view-model > a, ytd-rich-item-renderer > div#content > yt-lockup-view-model > div > a')
            .forEach(el => this.onElementFound(el, ElementTypes.MAIN));
    }
    // 2. 검색 페이지
    else if (url.includes('/results?')) {
        node.querySelectorAll('ytd-video-renderer > div#dismissible > ytd-thumbnail > a#thumbnail, ytd-reel-shelf-renderer ytm-shorts-lockup-view-model-v2 > ytm-shorts-lockup-view-model > a, yt-lockup-view-model > div > a')
            .forEach(el => this.onElementFound(el, ElementTypes.SEARCH));
    }
    // 3. 동영상 단일 페이지
    else if (url.includes('/watch?')) {
      console.log('동영상 단일 페이지.')
        const videoElement = document.querySelector('ytd-watch-flexy[video-id]');
        if (videoElement) {
          console.log('videoElement', videoElement)
          this.onElementFound(videoElement, ElementTypes.VIDEO);
        } else {
          console.log('동영상 발견 못함.')
        }
    }
    // 4. 숏츠 단일 페이지
    else if (url.includes('/shorts/')) {
        const shortsElement = document.querySelector('ytd-shorts > div#shorts-container ytd-reel-video-renderer#reel-video-renderer ytd-player#player a.ytp-title-link');
        if (shortsElement) this.onElementFound(shortsElement, ElementTypes.SHORTS);
    }
    // 5. 재생목록 페이지
    else if (url.includes('/feed/playlists')) {
        node.querySelectorAll('ytd-rich-item-renderer > div#content > yt-lockup-view-model > div > a')
            .forEach(el => this.onElementFound(el, ElementTypes.PLAYLIST));
    }
  }

  public disconnect(): void {
    this.observer?.disconnect();
  }
}