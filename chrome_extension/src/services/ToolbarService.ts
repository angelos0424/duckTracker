import { createRoot } from 'react-dom/client';
import { TrackToolbar } from '../component/TrackToolbar';
import { ErrorBoundary } from '../component/ErrorBoundary';
import React from 'react';
import { DownloadObject, ElementTypes, FromType } from "../types";
import { TOOLBAR_TARGETS } from '../config/selectors';

export class ToolbarService {
  public static readonly TOOLBAR_CLASS = 'trackerToolbar';

  public static async removeAllToolbars(): Promise<void> {
    const toolbars = document.querySelectorAll(`.${this.TOOLBAR_CLASS}`);
    toolbars.forEach(toolbar => toolbar.remove());

    // 모든 data-tracker-processed 값을 초기화해서 재탐색이 가능하도록 함
    document.querySelectorAll('[data-tracker-processed]').forEach(el => {
      delete (el as HTMLElement).dataset.trackerProcessed;
    });

    return Promise.resolve();
  }

  public static createToolbar(container: Element, els: DownloadObject): void {
    if (!els.urlId) {
      console.log('No urlId found in element:', els);
      return;
    }

    // Phase 3: 'container' is now passed directly from Strategy.
    // No need to switch-case on FromType to find parent.

    // Safety check just in case strategy passed something wrong? 
    // Or we trust the strategy. Let's assume strategy is correct.
    const parent = container;

    const existingToolbar = document.querySelector(`.${this.TOOLBAR_CLASS}.url-${els.urlId}`) as HTMLElement | null;

    if (existingToolbar) {
      if (existingToolbar.parentElement === parent) {
        return;
      }
      existingToolbar.remove();
    }

    if (parent.querySelector(`div.${this.TOOLBAR_CLASS}.url-${els.urlId}`)) {
      return;
    }

    const isPlayList = els.type === ElementTypes.PLAYLIST;
    const toolbar = this.createToolbarElement(els.urlId);
    this.renderToolbarContent(toolbar, els, isPlayList);
    parent.prepend(toolbar);
  }

  private static createToolbarElement(urlId: string): HTMLDivElement {
    const div = document.createElement('div');
    div.classList.add(this.TOOLBAR_CLASS, "url-" + urlId);

    this.attachEventHandlers(div);
    return div;
  }

  private static attachEventHandlers(element: HTMLElement): void {
    const preventDefault = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
    };

    element.onclick = preventDefault;
    element.onmouseover = preventDefault;
  }

  private static renderToolbarContent(element: HTMLElement, els: DownloadObject, isPlayList: boolean): void {
    const root = createRoot(element);
    root.render(
      React.createElement(ErrorBoundary, null,
        React.createElement(TrackToolbar, { els, isPlayList })
      )
    );
  }
}
