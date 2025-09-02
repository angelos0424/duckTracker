// services/ToolbarService.ts
import {createRoot} from 'react-dom/client';
import {TrackToolbar} from '../component/TrackToolbar';
import React from 'react';
import {DownloadObject, ElementTypes, FromType} from "./Observer";

export class ToolbarService {
  public static readonly TOOLBAR_CLASS = 'trackerToolbar';

  public static async removeAllToolbars(): Promise<void> {
    const toolbars = document.querySelectorAll(`.${this.TOOLBAR_CLASS}`);
    toolbars.forEach(toolbar => toolbar.remove());

    // 모든 dataset.trackerProcessed를 가진 요소를 찾아서 초기화
    document.querySelectorAll('[data-tracker-processed="true"]').forEach(el => {
      delete (el as HTMLElement).dataset.trackerProcessed;
    });

    return Promise.resolve();
  }

  public static createToolbar(item: Element, els: DownloadObject): void {
    const isPlayList = els.type === ElementTypes.PLAYLIST; // element.closest('yt-lockup-view-model') !== null;
    if (!els.urlId) {
      console.log('No urlId found in element:', els);
      return;
    }

    let parent;

    // from에 따라 다르게 처리
    // Main
    // Video
    // Shorts

    switch (els.from) {
      case FromType.VIDEO:
        switch (els.type) {
          case ElementTypes.VIDEO:
          case ElementTypes.PLAYLIST:
            parent = item.closest('div');
            break;
          case ElementTypes.SHORTS:
            parent = item.closest('ytm-shorts-lockup-view-model-v2');
            break;
          case ElementTypes.VIDEOPLAYER:
            parent = item.querySelector('ytd-player#ytd-player');
            break;
        }
        break;
      case FromType.SEARCH:
        switch (els.type) {
          case ElementTypes.VIDEO:
            parent = item.closest('ytd-video-renderer');
            break;
          case ElementTypes.PLAYLIST:
            parent = item.closest('yt-lockup-view-model');
            break;
          case ElementTypes.SHORTS:
            parent = item.closest('ytm-shorts-lockup-view-model-v2');
            break;
        }
        break;
      case FromType.PLAYLIST:
        parent = item.closest('ytd-rich-item-renderer');
        break;
      case FromType.SHORTS:
        parent = item.closest('ytd-reel-video-renderer#reel-video-renderer');
        break;
      case FromType.CHANNEL:
        switch (els.type) {
          case ElementTypes.VIDEO:
            parent = item.closest('ytd-thumbnail');
            break;
          case ElementTypes.SHORTS:
            parent = item.closest('ytm-shorts-lockup-view-model-v2');
            break;
          case ElementTypes.PLAYLIST:
            parent = item;
            break;
        }
        break;
      case FromType.SUBSCRIPT:
        switch (els.type) {
          case ElementTypes.VIDEO:
          case ElementTypes.PLAYLIST:
            parent = item.closest('ytd-video-renderer');
            break;
          case ElementTypes.SHORTS:
            parent = item.closest('ytm-shorts-lockup-view-model-v2');
        }
        break;
      default: // FromType.MAIN
        switch (els.type) {
          case ElementTypes.VIDEO:
          case ElementTypes.PLAYLIST:
            parent = item.closest('ytd-rich-item-renderer');
            break;
          case ElementTypes.SHORTS:
            parent = item.closest('ytm-shorts-lockup-view-model-v2'); // item.parentElement?.parentElement;
            break;
        }
        break;
    }

    if (!parent || parent.querySelector(`div.${this.TOOLBAR_CLASS}.${'url-'+els.urlId}`)) {
      if (!parent) {
        console.log('No parent found:', els);
      } else {
        console.log('Toolbar already exists:', parent);
      }
      return;
    }

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
    root.render(React.createElement(TrackToolbar, { els, isPlayList }));
  }
}