// content.ts
import { Observer } from './services/Observer';
import { DownloadObject } from './types';
import { ToolbarService } from './services/ToolbarService';
import { createRoot, Root } from 'react-dom/client';
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

  private handleElementFound(element: Element, els: DownloadObject): void {
    if (els.url && els.urlId) {
      ToolbarService.createToolbar(element, els);
    }
    // If no URL/ID, strategies usually won't call onElementFound, 
    // or they handle async loading internally (like ShortsPageStrategy).
    // So distinct observeForTarget might be redundant or needs to be specific.
    // Legacy logic had else { observeForTarget } but BaseStrategy checks for urlId before calling onFound.
  }

  private initializeMessageListener(): void {
    chrome.runtime.onMessage.addListener((msg: IMsg) => {
      if (msg.action === 'url_changed' || msg.action === 'remove_toolbar') {
        ToolbarService.removeAllToolbars().then(() => {
          this.observer.init();
        });
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
