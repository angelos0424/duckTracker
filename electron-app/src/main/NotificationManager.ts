import { Notification, shell, BrowserWindow } from 'electron';
import * as path from 'path';
import { AppSettings, DownloadRecord } from '../shared/types';
import { ErrorHandler, AppError, ErrorSeverity } from './ErrorHandler';

export interface NotificationOptions {
  title: string;
  body: string;
  icon?: string;
  silent?: boolean;
  urgency?: 'normal' | 'critical' | 'low';
  actions?: NotificationAction[];
  tag?: string;
  timeoutType?: 'default' | 'never';
}

export interface NotificationAction {
  type: string;
  text: string;
  action: () => Promise<void>;
}

export enum NotificationType {
  DOWNLOAD_COMPLETED = 'download_completed',
  DOWNLOAD_FAILED = 'download_failed',
  DOWNLOAD_STARTED = 'download_started',
  ERROR = 'error',
  INFO = 'info',
  WARNING = 'warning'
}

export class NotificationManager {
  private static instance: NotificationManager;
  private settings: AppSettings | null = null;
  private errorHandler: ErrorHandler;
  private activeNotifications = new Map<string, Notification>();

  private constructor() {
    this.errorHandler = ErrorHandler.getInstance();
  }

  public static getInstance(): NotificationManager {
    if (!NotificationManager.instance) {
      NotificationManager.instance = new NotificationManager();
    }
    return NotificationManager.instance;
  }

  /**
   * Update settings for notification preferences
   */
  public updateSettings(settings: AppSettings): void {
    this.settings = settings;
  }

  /**
   * Check if notifications are supported and enabled
   */
  public isNotificationEnabled(type: NotificationType): boolean {
    const supported = Notification.isSupported();
    const enabledInSettings = this.settings?.showNotifications ?? false;
    
    console.log(`Notification check for type ${type}: Supported=${supported}, EnabledInSettings=${enabledInSettings}`);

    if (!supported) {
      console.log('Notifications not supported on this platform.');
      return false;
    }

    if (!enabledInSettings) {
      console.log('Notifications disabled in settings.');
      return false;
    }

    // Additional type-specific checks can be added here
    return true;
  }

  /**
   * Show download completion notification
   */
  public async showDownloadCompleted(record: DownloadRecord): Promise<void> {
    if (!this.isNotificationEnabled(NotificationType.DOWNLOAD_COMPLETED)) {
      return;
    }

    const title = 'Download Completed';
    const body = record.title 
      ? `Successfully downloaded: ${record.title}`
      : `Download completed: ${this.truncateUrl(record.url)}`;

    const actions: NotificationAction[] = [];

    // Add action to open file location if file path is available
    if (record.filePath) {
      actions.push({
        type: 'open_location',
        text: 'Open File Location',
        action: async () => {
          try {
            await shell.showItemInFolder(record.filePath!);
          } catch (error) {
            console.error('Failed to open file location from notification:', error);
          }
        }
      });
    }

    // Add action to show main window
    actions.push({
      type: 'show_app',
      text: 'Show App',
      action: async () => {
        this.showMainWindow();
      }
    });

    await this.showNotification({
      title,
      body,
      icon: this.getNotificationIcon(NotificationType.DOWNLOAD_COMPLETED),
      urgency: 'normal',
      actions,
      tag: `download_completed_${record.id}`,
      timeoutType: 'default'
    });
  }

  /**
   * Show download failed notification
   */
  public async showDownloadFailed(record: DownloadRecord, retryCallback?: () => Promise<void>): Promise<void> {
    if (!this.isNotificationEnabled(NotificationType.DOWNLOAD_FAILED)) {
      return;
    }

    const title = 'Download Failed';
    const body = record.title 
      ? `Failed to download: ${record.title} => ${record.errorMessage}`
      : `Download failed: ${this.truncateUrl(record.url)}`;

    const actions: NotificationAction[] = [];

    // Add retry action if callback is provided
    if (retryCallback) {
      actions.push({
        type: 'retry',
        text: 'Retry Download',
        action: retryCallback
      });
    }

    // Add action to show main window
    actions.push({
      type: 'show_app',
      text: 'Show Details',
      action: async () => {
        this.showMainWindow();
      }
    });

    await this.showNotification({
      title,
      body,
      icon: this.getNotificationIcon(NotificationType.DOWNLOAD_FAILED),
      urgency: 'critical',
      actions,
      tag: `download_failed_${record.id}`,
      timeoutType: 'never'
    });
  }

  /**
   * Show download started notification (optional, for user feedback)
   */
  public async showDownloadStarted(record: DownloadRecord): Promise<void> {
    if (!this.isNotificationEnabled(NotificationType.DOWNLOAD_STARTED)) {
      return;
    }

    const title = 'Download Started';
    const body = record.title 
      ? `Started downloading: ${record.title}`
      : `Download started: ${this.truncateUrl(record.url)}`;

    await this.showNotification({
      title,
      body,
      icon: this.getNotificationIcon(NotificationType.DOWNLOAD_STARTED),
      urgency: 'low',
      silent: true,
      tag: `download_started_${record.id}`,
      timeoutType: 'default'
    });
  }

  /**
   * Show error notification
   */
  public async showError(error: AppError, retryCallback?: () => Promise<void>): Promise<void> {
    if (!this.isNotificationEnabled(NotificationType.ERROR)) {
      return;
    }

    // Only show notifications for medium+ severity errors
    if (error.severity === ErrorSeverity.LOW) {
      return;
    }

    const title = this.getErrorNotificationTitle(error.severity);
    const body = error.userMessage;

    const actions: NotificationAction[] = [];

    // Add retry action if callback is provided and error is recoverable
    if (retryCallback && error.recoverable) {
      actions.push({
        type: 'retry',
        text: 'Try Again',
        action: retryCallback
      });
    }

    // Add action to show main window for more details
    actions.push({
      type: 'show_details',
      text: 'Show Details',
      action: async () => {
        this.showMainWindow();
      }
    });

    await this.showNotification({
      title,
      body,
      icon: this.getNotificationIcon(NotificationType.ERROR),
      urgency: this.getNotificationUrgency(error.severity),
      actions,
      tag: `error_${error.id}`,
      timeoutType: error.severity === ErrorSeverity.CRITICAL ? 'never' : 'default'
    });
  }

  /**
   * Show info notification
   */
  public async showInfo(title: string, message: string, actions?: NotificationAction[]): Promise<void> {
    if (!this.isNotificationEnabled(NotificationType.INFO)) {
      return;
    }

    await this.showNotification({
      title,
      body: message,
      icon: this.getNotificationIcon(NotificationType.INFO),
      urgency: 'normal',
      actions: actions || [],
      timeoutType: 'default'
    });
  }

  /**
   * Show warning notification
   */
  public async showWarning(title: string, message: string, actions?: NotificationAction[]): Promise<void> {
    if (!this.isNotificationEnabled(NotificationType.WARNING)) {
      return;
    }

    await this.showNotification({
      title,
      body: message,
      icon: this.getNotificationIcon(NotificationType.WARNING),
      urgency: 'normal',
      actions: actions || [],
      timeoutType: 'default'
    });
  }

  /**
   * Show server status notification
   */
  public async showServerStatus(isRunning: boolean, port?: number): Promise<void> {
    if (!this.isNotificationEnabled(NotificationType.INFO)) {
      return;
    }

    const title = isRunning ? 'Server Started' : 'Server Stopped';
    const body = isRunning 
      ? `Download server is running${port ? ` on port ${port}` : ''}`
      : 'Download server has been stopped';

    await this.showNotification({
      title,
      body,
      icon: this.getNotificationIcon(NotificationType.INFO),
      urgency: 'low',
      silent: true,
      timeoutType: 'default'
    });
  }

  /**
   * Clear all notifications with a specific tag
   */
  public clearNotificationsByTag(tag: string): void {
    const notification = this.activeNotifications.get(tag);
    if (notification) {
      notification.close();
      this.activeNotifications.delete(tag);
    }
  }

  /**
   * Clear all active notifications
   */
  public clearAllNotifications(): void {
    for (const [tag, notification] of this.activeNotifications) {
      notification.close();
    }
    this.activeNotifications.clear();
  }

  /**
   * Core notification display method
   */
  private async showNotification(options: NotificationOptions): Promise<void> {
    try {
      // Clear existing notification with same tag
      if (options.tag) {
        this.clearNotificationsByTag(options.tag);
      }

      const notificationOptions: any = {
        title: options.title,
        body: options.body,
        silent: options.silent || false,
        urgency: options.urgency || 'normal',
        timeoutType: options.timeoutType || 'default'
      };

      if (options.icon) {
        notificationOptions.icon = options.icon;
      }

      const notification = new Notification(notificationOptions);

      // Handle notification click
      notification.on('click', () => {
        console.log(`Notification clicked: ${options.title}`);
        this.showMainWindow();
        if (options.tag) {
          this.activeNotifications.delete(options.tag);
        }
      });

      // Handle notification close
      notification.on('close', () => {
        console.log(`Notification closed: ${options.title}`);
        if (options.tag) {
          this.activeNotifications.delete(options.tag);
        }
      });

      // Handle notification actions (if supported by platform)
      if (options.actions && options.actions.length > 0) {
        // Note: Electron's Notification doesn't support action events in the same way
        // This would need to be implemented differently for cross-platform support
        console.log('Notification actions configured but not yet implemented for this platform. Actions will not be clickable.');
        // For now, we'll just log the actions, but they won't be interactive
        options.actions.forEach(action => {
          console.log(`  Action: ${action.text} (Type: ${action.type})`);
        });
      }

      // Store active notification
      if (options.tag) {
        this.activeNotifications.set(options.tag, notification);
      }

      // Show the notification
      notification.show();
      console.log(`Notification shown: ${options.title} - ${options.body}`);

    } catch (error) {
      console.error('Failed to show notification:', error);
      // Don't throw error to avoid breaking the main flow
    }
  }

  /**
   * Get appropriate icon for notification type
   */
  private getNotificationIcon(type: NotificationType): string {
    // Use the main application icon as a generic notification icon for now
    // In a real implementation, you would return paths to appropriate icons
    // if specific ones exist.
    return path.join(__dirname, '../../assets/icon.png'); // Use the main app icon
  }

  /**
   * Get notification urgency based on error severity
   */
  private getNotificationUrgency(severity: ErrorSeverity): 'normal' | 'critical' | 'low' {
    switch (severity) {
      case ErrorSeverity.CRITICAL:
        return 'critical';
      case ErrorSeverity.HIGH:
        return 'critical';
      case ErrorSeverity.MEDIUM:
        return 'normal';
      case ErrorSeverity.LOW:
        return 'low';
      default:
        return 'normal';
    }
  }

  /**
   * Get error notification title based on severity
   */
  private getErrorNotificationTitle(severity: ErrorSeverity): string {
    switch (severity) {
      case ErrorSeverity.CRITICAL:
        return 'Critical Error';
      case ErrorSeverity.HIGH:
        return 'Error';
      case ErrorSeverity.MEDIUM:
        return 'Warning';
      case ErrorSeverity.LOW:
        return 'Notice';
      default:
        return 'Error';
    }
  }

  /**
   * Truncate URL for display in notifications
   */
  private truncateUrl(url: string, maxLength: number = 50): string {
    if (url.length <= maxLength) {
      return url;
    }
    return url.substring(0, maxLength - 3) + '...';
  }

  /**
   * Show main application window
   */
  private showMainWindow(): void {
    const windows = BrowserWindow.getAllWindows();
    if (windows.length > 0) {
      const mainWindow = windows[0];
      if (mainWindow && mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      if (mainWindow) {
        mainWindow.show();
        mainWindow.focus();
      }
    }
  }

  /**
   * Get notification statistics
   */
  public getNotificationStats(): {
    active: number;
    byType: Record<string, number>;
    supported: boolean;
    enabled: boolean;
  } {
    const stats = {
      active: this.activeNotifications.size,
      byType: {} as Record<string, number>,
      supported: Notification.isSupported(),
      enabled: this.settings?.showNotifications || false
    };

    // Count notifications by tag prefix (type)
    for (const tag of this.activeNotifications.keys()) {
      const type = tag.split('_')[0];
      if (type) {
        stats.byType[type] = (stats.byType[type] || 0) + 1;
      }
    }

    return stats;
  }
}