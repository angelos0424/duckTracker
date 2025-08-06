declare namespace Neutralino {
  enum OperatingSystem {
    Linux = "Linux",
    Windows = "Windows",
    Darwin = "Darwin",
    FreeBSD = "FreeBSD",
    Unknown = "Unknown"
  }

  namespace os {
    function showOpenDialog(title: string, options: { filters?: any[]; multiSelections?: boolean; openLabel?: string; defaultPath?: string; dialogType?: 'FILE' | 'DIRECTORY' }): Promise<string[]>;
    function execCommand(command: string): Promise<any>; // Added execCommand
    function open(url: string): Promise<void>; // Added open
  }
  namespace window {
    function minimize(): Promise<void>;
  }
  namespace app {
    function exit(): Promise<void>;
  }
  namespace extensions {
    function dispatch(extensionId: string, data?: any): Promise<void>;
  }
  namespace events {
    function on(eventName: string, handler: (data: any) => void): void;
    function off(eventName: string, handler: (data: any) => void): void;
    function dispatch(eventName: string, data?: any): Promise<void>;
  }
  namespace clipboard {
    function readText(): Promise<string>;
  }
}

declare global {
  interface Window {
    NL_OS: Neutralino.OperatingSystem;
  }
}
