// content.ts
import { Observer } from './services/Observer'
import { ToolbarService } from './services/ToolbarService';

interface IMsg {
  action: string;
  text: string | object;
}

class ContentScript {
  private observer: Observer;

  constructor() {
    this.observer = new Observer(this.handleElementFound.bind(this));
    this.initializeMessageListener();
    this.initializeObserver();
  }

  private handleElementFound(element: Element, isShorts: boolean, isVideoPlayer: boolean): void {
    console.log('handleElementFound called:', { element, isShorts, isVideoPlayer });
    const target = isVideoPlayer ? null : element.querySelector('img.yt-core-image') as HTMLImageElement;
    console.log('handleElementFound - target (img.yt-core-image):', target);
    if (target || isVideoPlayer) {
      const url = isVideoPlayer ? window.location.href : target?.src;
      console.log('handleElementFound - url:', url);
      if (!url) {
        console.log('handleElementFound - URL is null or undefined, returning.');
        return;
      }
      const urlId = this.extractUrlId(url, isVideoPlayer);
      console.log('handleElementFound - extracted urlId:', urlId);

      ToolbarService.createToolbar(element, urlId, isVideoPlayer);
      console.log('ToolbarService.createToolbar called.');
    } else {
      console.log('handleElementFound - No target or not a video player, observing for target.');
      this.observeForTarget(element, isVideoPlayer);
    }
  }

  private observeForTarget(element: Element, isVideo: boolean): void {
    console.log('observeForTarget called:', { element, isVideo });
    const observer = new MutationObserver((mutations) => {
      mutations.forEach(mutation => {
        console.log('observeForTarget - Mutation type:', mutation.type);
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach(node => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const targetElement = node as Element;
              // Check if the added node itself is an image/video or contains one
              const imgOrVideo = targetElement.querySelector('img.yt-core-image') || targetElement.querySelector('video');
              if (imgOrVideo instanceof HTMLImageElement || imgOrVideo instanceof HTMLVideoElement) {
                console.log('observeForTarget - Added node contains img or video:', imgOrVideo);
                const urlId = this.extractUrlIdForObserver(imgOrVideo.src, isVideo);
                ToolbarService.createToolbar(element, urlId, isVideo);
                observer.disconnect();
              }
            }
          });
        } else if (mutation.type === 'attributes') {
          const target = mutation.target as HTMLImageElement | HTMLVideoElement;
          console.log('observeForTarget - Attribute changed on:', target);
          // Check if the attribute change is on an image or video element and it has a src
          if ((target instanceof HTMLImageElement || target instanceof HTMLVideoElement) && target.src) {
            console.log('observeForTarget - Target src found on attribute change:', target.src);
            const urlId = this.extractUrlIdForObserver(target.src, isVideo);
            ToolbarService.createToolbar(element, urlId, isVideo);
            observer.disconnect();
          }
        }
      });
    });

    observer.observe(element, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['src'], // Only observe src attribute changes
    });

    setTimeout(() => observer.disconnect(), 50000);
  }

  private initializeMessageListener(): void {
    chrome.runtime.onMessage.addListener((msg:IMsg) => {
      if (msg.action === 'url_changed') {
        ToolbarService.removeAllToolbars();
        this.observer.init();
      }
    });
  }

  private initializeObserver(): void {
    console.log('initializeObserver called. document.readyState:', document.readyState);
    if (document.readyState === 'loading') {
      console.log('Document is loading, adding DOMContentLoaded listener.');
      document.addEventListener('DOMContentLoaded', () => {
        console.log('DOMContentLoaded fired, initializing observer.');
        this.observer.init();
      });
    } else {
      console.log('Document already loaded, initializing observer.');
      this.observer.init();
    }
  }

  private extractUrlId(src: string, isVideo: boolean): string {
    try {
      const urlObj = new URL(src.replace('blob:', ''));
      const urlId = isVideo && !urlObj.pathname.startsWith('/shorts/') ? urlObj.search.split('=')[1].split('&')[0] : urlObj.pathname.split('/')[2];
      return urlId || '';
    } catch (e) {
      console.error('Error extracting URL ID:', e, src, isVideo);
      return '';
    }
  }

  private extractUrlIdForObserver(src: string, isVideo: boolean): string {
    try {
      const urlObj = new URL(src.replace('blob:', ''));
      const urlId = isVideo ? urlObj.search.split('=')[1].split('&')[0] : urlObj.pathname.split('/')[2];
      return urlId || '';
    } catch (e) {
      console.error('Error extracting URL ID:', e, src);
      return '';
    }
  }
}

new ContentScript();