import { DownloadObject } from '../../types';

export interface IObserverStrategy {
	canHandle(url: string): boolean;
	findTargets(node: Element, onFound: (element: Element, object: DownloadObject) => void): void;
}
