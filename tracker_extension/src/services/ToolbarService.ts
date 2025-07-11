// services/ToolbarService.ts
import { createRoot } from 'react-dom/client';
import { TrackToolbar } from '../component/TrackToolbar';
import React from 'react';

export class ToolbarService {
  public static readonly TOOLBAR_CLASS = 'trackerToolbar';

  public static removeAllToolbars(): void {
    const toolbars = document.querySelectorAll(`.${this.TOOLBAR_CLASS}`);
    toolbars.forEach(toolbar => toolbar.remove());
  }

  public static createToolbar(item: Element, urlId: string, isVideo: boolean, isPlayList: boolean): void {
    if (!urlId) {
      return;
    }

    let parent;
    if (!isPlayList) { // shorts 포함.
      const isSearch = window.location.href.startsWith('https://www.youtube.com/results?');
      const isShorts = urlId.includes('/shorts/');
      const parentSelector = isSearch ? 'ytd-video-renderer' : isVideo ? '#player' : isShorts ? 'ytm-shorts-lockup-view-model-v2' : 'div#content';

      console.log('createToolbar', urlId, isVideo, isPlayList, isSearch, isShorts, parentSelector)
      if (isVideo) {
        // 비디오 단일 페이지 일 경우, ytd-watch-flexy가 element로 넘어옴.
        parent = item.querySelector(parentSelector)
      } else {
        parent = item.closest(parentSelector); // main이 아니고 다른 경로, search 같은 경우는 parentSelecor
      }

      if (isShorts) {
        console.log('shorts parent', parent);
      }

    } else {
      parent = item.closest('yt-lockup-view-model > div');
    }

    if (!parent || parent.querySelector(`.${this.TOOLBAR_CLASS}`)) {
      return;
    }

    const toolbar = this.createToolbarElement();
    this.renderToolbarContent(toolbar, urlId, isPlayList);
    parent.prepend(toolbar);
    console.log('toolbar 추가 완료')
  }

  private static createToolbarElement(): HTMLDivElement {
    const div = document.createElement('div');
    div.className = this.TOOLBAR_CLASS;

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

  private static renderToolbarContent(element: HTMLElement, urlId: string, isPlayList: boolean): void {
    const root = createRoot(element);
    root.render(React.createElement(TrackToolbar, { urlId, isPlayList }));
  }
}