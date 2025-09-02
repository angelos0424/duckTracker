// content.ts
import {DownloadObject, ElementTypes, Observer} from './services/Observer';
import {ToolbarService} from './services/ToolbarService';
import {createRoot, Root} from 'react-dom/client';
import useHistoryStore from './store/index';
import React from 'react';

interface IMsg {
  action: string;
  text: string | object;
}

class ContentScript {
  private observer: Observer;

  constructor() {
    this.observer = new Observer(this.handleElementFound.bind(this));
    this.initializeMessageListener();
  }

  private handleElementFound(element: Element, els : DownloadObject): void {
    if (els.url) {
      ToolbarService.createToolbar(element, els);
    }
    else {
      console.log("No url found in element: ", element, " - ", els);
      this.observeForTarget(element, els);
    }
  }

  private observeForTarget(element: Element, els: DownloadObject): void {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach(mutation => {
        // 이쪽으로 들어오는 애들 좀 봐야할거 같은데.
        if (mutation.type === 'attributes' && ((mutation.target as HTMLElement).hasAttribute('src') || (mutation.target as HTMLElement).hasAttribute('href')))  {
          console.log(`src :: ${(mutation.target as HTMLElement).getAttribute('src')}, href :: ${(mutation.target as HTMLElement).getAttribute('href')}`);
          this.handleElementFound(element, els);
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
      if (msg.action === 'url_changed' || msg.action === 'remove_toolbar') {
        ToolbarService.removeAllToolbars().then(() => {
          this.observer.init();
        });
      } else if (msg.action === 'toggle_toolbar_visibility') {
        const toolbars = document.querySelectorAll(`.${ToolbarService.TOOLBAR_CLASS}`);
        console.log('toolbars', toolbars);
        toolbars.forEach(toolbar => {
          const htmlToolbar = toolbar as HTMLElement;
          if (htmlToolbar.style.display === 'none') {
            htmlToolbar.style.display = 'flex';
          } else {
            htmlToolbar.style.display = 'none';
          }
        });
      } else if (msg.action === 'log') {
        console.log(msg.text);
      } else if (msg.action === 'error') {
        console.error(msg.text);
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
}

new ContentScript();
