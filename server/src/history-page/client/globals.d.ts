declare const React: typeof import('react');
declare const ReactDOM: typeof import('react-dom/client');

declare global {
    interface Window {
        React: typeof import('react');
        ReactDOM: typeof import('react-dom/client');
    }
}

export {};
