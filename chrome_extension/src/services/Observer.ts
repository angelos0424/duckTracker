import { DownloadObject } from '../types';
import { SELECTORS } from '../config/selectors';
import { IObserverStrategy } from './observer/ObserverStrategy';
import { MainPageStrategy } from './observer/strategies/MainPageStrategy';
import { SearchPageStrategy } from './observer/strategies/SearchPageStrategy';
import { WatchPageStrategy } from './observer/strategies/WatchPageStrategy';
import { ShortsPageStrategy } from './observer/strategies/ShortsPageStrategy';
import { ChannelPageStrategy } from './observer/strategies/ChannelPageStrategy';
import { FeedPageStrategy } from './observer/strategies/FeedPageStrategy';

export class Observer {
  private observer: MutationObserver | null = null;
  private strategies: IObserverStrategy[];

  constructor(private readonly onElementFound: (element: Element, elementType: DownloadObject) => void) {
    this.strategies = [
      new MainPageStrategy(),
      new SearchPageStrategy(),
      new WatchPageStrategy(),
      new ShortsPageStrategy(),
      new ChannelPageStrategy(),
      new FeedPageStrategy()
    ];
  }

  public init(): void {
    const targetElement = document.querySelector(SELECTORS.PAGE_MANAGER);
    if (!targetElement) {
      setTimeout(() => this.init(), 100);
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
              const element = node as Element;
              const tagName = element.tagName;

              if (!SELECTORS.VALID_TAGS.includes(tagName)) {
                return;
              }
              this.findElements(element);
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
    const strategy = this.strategies.find(s => s.canHandle(url));

    if (strategy) {
      strategy.findTargets(node, this.onElementFound);
    }
  }

  public disconnect(): void {
    this.observer?.disconnect();
  }
}
