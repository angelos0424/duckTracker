// services/Observer.ts
export class Observer {
  private observer: MutationObserver | null = null;
  private readonly MAIN_PAGE_URL = 'https://www.youtube.com/';

  constructor(private readonly onElementFound: (element: Element, isShorts: boolean, isVideoPlayer: boolean) => void) {}

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
    targetElement.querySelectorAll('yt-image, ytd-player, ytm-shorts-lockup-view-model-v2').forEach(element => {
      this.processElement(element);
    });
  }

  private setupObserver(targetElement: Element): void {
    this.observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach(node => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              this.processNode(node as Element);
            }
          });
        } else if (mutation.type === 'attributes') {
          this.processElement(mutation.target as Element);
        }
      });
    });

    this.observer.observe(targetElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['src', 'href', 'style'],
    });

    setTimeout(() => this.disconnect(), 50000);
  }

  private processNode(node: Element): void {
    // Check the node itself and its descendants
    const elements = [node, ...Array.from(node.querySelectorAll('yt-image, ytd-player, ytm-shorts-lockup-view-model-v2'))];
    elements.forEach(element => this.processElement(element));
  }

  private processElement(element: Element): void {
    const tagName = element.tagName.toLowerCase();
    switch (tagName) {
      case 'yt-image':
        this.onElementFound(element, false, false);
        break;
      case 'ytm-shorts-lockup-view-model-v2':
        if (window.location.href === this.MAIN_PAGE_URL) {
          const child = element.querySelector('div');
          if (child) this.onElementFound(child, true, false);
        }
        break;
      case 'ytd-player':
        if (window.location.href !== this.MAIN_PAGE_URL) {
            this.onElementFound(element, false, true);
        }
        break;
    }
  }

  public disconnect(): void {
    this.observer?.disconnect();
  }
}