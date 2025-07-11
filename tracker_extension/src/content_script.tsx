// content.ts
import {ElementTypes, Observer} from './services/Observer'
import {ToolbarService} from './services/ToolbarService';
import {createRoot, Root} from 'react-dom/client';
import {SidePanel} from './component/SidePanel';
import React from 'react';

interface IMsg {
  action: string;
  text: string | object;
}

class ContentScript {
  private observer: Observer;
  private sidePanelRoot: Root | null = null;
  private sidePanelContainer: HTMLDivElement | null = null;
  private isSidePanelOpen: boolean = false;

  constructor() {
    this.observer = new Observer(this.handleElementFound.bind(this));
    this.initializeMessageListener();
    this.initializeObserver();
    this.initializeSidePanel();
  }

  private initializeSidePanel(): void {
    this.sidePanelContainer = document.createElement('div');
    this.sidePanelContainer.id = 'tracker-side-panel-container';
    document.body.appendChild(this.sidePanelContainer);
    this.sidePanelRoot = createRoot(this.sidePanelContainer);
    this.renderSidePanel();
  }

  private renderSidePanel(): void {
    if (this.sidePanelRoot && this.sidePanelContainer) {
      this.sidePanelRoot.render(
        <SidePanel isOpen={this.isSidePanelOpen} onClose={this.toggleSidePanel.bind(this)} />
      );
    }
  }

  private toggleSidePanel(): void {
    this.isSidePanelOpen = !this.isSidePanelOpen;
    this.renderSidePanel();
  }

  private handleElementFound(element: Element, elementType : ElementTypes): void {
    const isVideoPlayer = element.tagName.toLowerCase() === 'ytd-watch-flexy'; // 동영상 단일페이지일 때.
    const isPlayList = element.closest('yt-lockup-view-model') !== null;

    // url은 그냥 url인데
    const url = elementType === ElementTypes.VIDEO ? element.getAttribute('video-id') : (element as HTMLAnchorElement).href || (element as HTMLImageElement).src;
    console.log('url111', url);

    if (url) {
      const urlId = isPlayList || elementType === ElementTypes.VIDEO ? url : this.extractUrlId(url, isVideoPlayer);
      if (url.includes('shorts')) {
        console.log('url222', urlId, isVideoPlayer, isPlayList);
      }
      ToolbarService.createToolbar(element, url.includes('shorts') ? url:urlId, isVideoPlayer, isPlayList);
    } else {
      console.log('url333', element);
      this.observeForTarget(element);
    }
  }

  private observeForTarget(element: Element): void {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach(mutation => {
        // 이쪽으로 들어오는 애들 좀 봐야할거 같은데.
        if (mutation.type === 'attributes' && ((mutation.target as HTMLElement).hasAttribute('src') || (mutation.target as HTMLElement).hasAttribute('href')))  {
          console.log(`src :: ${(mutation.target as HTMLElement).getAttribute('src')}, href :: ${(mutation.target as HTMLElement).getAttribute('href')}`);
          this.handleElementFound(element, ElementTypes.VIDEO);
          observer.disconnect();
        }
      });
    });

    observer.observe(element, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['src'],
    });

    setTimeout(() => observer.disconnect(), 50000);
  }

  private initializeMessageListener(): void {
    chrome.runtime.onMessage.addListener((msg:IMsg) => {
      if (msg.action === 'url_changed') {
        ToolbarService.removeAllToolbars();
        this.observer.init();
      } else if (msg.action === 'toggle_toolbar_visibility') {
        const toolbars = document.querySelectorAll(`.${ToolbarService.TOOLBAR_CLASS}`);
        toolbars.forEach(toolbar => {
          const htmlToolbar = toolbar as HTMLElement;
          if (htmlToolbar.style.display === 'none') {
            htmlToolbar.style.display = 'flex';
          } else {
            htmlToolbar.style.display = 'none';
          }
        });
      } else if (msg.action === 'toggle_side_panel_visibility') {
        this.toggleSidePanel();
      }
    });
  }

  private initializeObserver(): void {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        this.observer.init();
      });
    } else {
      this.observer.init();
    }
  }

  private extractUrlId(src: string, isVideo: boolean): string {
    try {
      const urlObj = new URL(src);
      if (src.includes('shorts')) {
        return urlObj.pathname.split('/')[2];
      }

      const urlId = urlObj.searchParams.get('v');
      return urlId || '';
    } catch (e) {
      console.error('Error extracting URL ID:', e, src, isVideo);
      return src;
    }
  }
}

new ContentScript();