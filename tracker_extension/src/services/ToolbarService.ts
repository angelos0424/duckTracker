// services/ToolbarService.ts
import { createRoot } from 'react-dom/client';
import { TrackToolbar } from '../component/TrackToolbar';
import React from 'react';

export class ToolbarService {
  private static readonly TOOLBAR_CLASS = 'trackerToolbar';

  public static removeAllToolbars(): void {
    const toolbars = document.querySelectorAll(`.${this.TOOLBAR_CLASS}`);
    toolbars.forEach(toolbar => toolbar.remove());
  }

  public static createToolbar(item: Element, urlId: string, isVideo: boolean): void {
    console.log('createToolbar called:', { item, urlId, isVideo });
    if (!urlId) {
      console.log('createToolbar - urlId is empty, returning.');
      return;
    }
    const parentSelector = isVideo ? '#player' : 'div#content';
    console.log('createToolbar - parentSelector:', parentSelector);
    const parent = item.closest(parentSelector);
    console.log('createToolbar - parent found:', parent);

    if (!parent) {
      console.log('createToolbar - Parent not found, returning.');
      return;
    }
    if (parent.querySelector(`.${this.TOOLBAR_CLASS}`)) {
      console.log('createToolbar - Toolbar already exists in parent, returning.');
      return;
    }

    const toolbar = this.createToolbarElement();
    this.renderToolbarContent(toolbar, urlId);
    parent.prepend(toolbar);
    console.log('Toolbar created and prepended.');
  }

  private static createToolbarElement(): HTMLDivElement {
    const div = document.createElement('div');
    div.className = this.TOOLBAR_CLASS;
    Object.assign(div.style, {
      position: 'absolute',
      top: '0',
      width: '50%',
      float: 'right',
      zIndex: '9999999',
      background: 'green'
    });

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

  private static renderToolbarContent(element: HTMLElement, urlId: string): void {
    const root = createRoot(element);
    root.render(React.createElement(TrackToolbar, { urlId }));
  }
}