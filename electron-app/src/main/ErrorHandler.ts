import { app, dialog, BrowserWindow, Notification } from 'electron';
import * as fs from 'fs/promises';
import * as path from 'path';

export enum ErrorCategory {
  SYSTEM = 'system',
  DOWNLOAD = 'download',
  CONFIGURATION = 'configuration',
  DATABASE = 'database',
  NETWORK = 'network',
  FILE_SYSTEM = 'file_system'
}

export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export interface AppError {
  id: string;
  code: string;
  category: ErrorCategory;
  severity: ErrorSeverity;
  message: string;
  details?: any;
  timestamp: Date;
  recoverable: boolean;
  userMessage: string;
  actionableSteps: string[];
  context?: Record<string, any>;
}

export interface ErrorRecoveryAction {
  label: string;
  action: () => Promise<void>;
  primary?: boolean;
}

export interface ErrorHandlerOptions {
  logToFile?: boolean;
  showUserNotification?: boolean;
  showDialog?: boolean;
  autoRecover?: boolean;
}

export class ErrorHandler {
  private static instance: ErrorHandler;
  private logPath: string;
  private errorLog: AppError[] = [];
  private maxLogEntries = 1000;
  private recoveryActions = new Map<string, ErrorRecoveryAction[]>();

  private constructor() {
    const userDataPath = app.getPath('userData');
    const logsDir = path.join(userDataPath, 'logs');
    this.logPath = path.join(logsDir, 'errors.log');
    this.initializeLogging();
    this.setupRecoveryActions();
  }

  public static getInstance(): ErrorHandler {
    if (!ErrorHandler.instance) {
      ErrorHandler.instance = new ErrorHandler();
    }
    return ErrorHandler.instance;
  }

  private async initializeLogging(): Promise<void> {
    try {
      const logsDir = path.dirname(this.logPath);
      await fs.mkdir(logsDir, { recursive: true });
    } catch (error) {
      console.error('Failed to initialize error logging:', error);
    }
  }

  private setupRecoveryActions(): void {
    // Port conflict recovery
    this.recoveryActions.set('PORT_CONFLICT', [
      {
        label: 'Try Alternative Ports',
        action: async () => {
          // This will be handled by the caller
          console.log('Attempting to use alternative ports');
        },
        primary: true
      },
      {
        label: 'Open Settings',
        action: async () => {
          // Signal to open settings - will be handled by main process
          console.log('Opening settings to configure ports');
        }
      }
    ]);

    // Missing yt-dlp recovery
    this.recoveryActions.set('YTDLP_MISSING', [
      {
        label: 'Download yt-dlp',
        action: async () => {
          // Open download page
          const { shell } = require('electron');
          await shell.openExternal('https://github.com/yt-dlp/yt-dlp/releases');
        },
        primary: true
      }
    ]);

    // Missing ffmpeg recovery
    this.recoveryActions.set('FFMPEG_MISSING', [
      {
        label: 'Download ffmpeg',
        action: async () => {
          // Open download page
          const { shell } = require('electron');
          await shell.openExternal('https://ffmpeg.org/download.html');
        },
        primary: true
      }
    ]);

    // Directory access recovery
    this.recoveryActions.set('DIRECTORY_ACCESS', [
      {
        label: 'Select Different Directory',
        action: async () => {
          console.log('Opening directory selection dialog');
        },
        primary: true
      },
      {
        label: 'Create Directory',
        action: async () => {
          console.log('Attempting to create directory');
        }
      }
    ]);

    // Database corruption recovery
    this.recoveryActions.set('DATABASE_CORRUPTION', [
      {
        label: 'Recreate Database',
        action: async () => {
          console.log('Recreating database with fresh schema');
        },
        primary: true
      },
      {
        label: 'Backup and Reset',
        action: async () => {
          console.log('Creating backup and resetting database');
        }
      }
    ]);
  }

  /**
   * Handle an error with comprehensive logging and recovery options
   */
  public async handle(
    error: Error | AppError,
    options: ErrorHandlerOptions = {}
  ): Promise<void> {
    const appError = this.normalizeError(error);
    
    // Add to in-memory log
    this.errorLog.unshift(appError);
    if (this.errorLog.length > this.maxLogEntries) {
      this.errorLog = this.errorLog.slice(0, this.maxLogEntries);
    }

    // Log to file if enabled
    if (options.logToFile !== false) {
      await this.logToFile(appError);
    }

    // Show user notification for medium+ severity errors
    if (options.showUserNotification !== false && 
        appError.severity !== ErrorSeverity.LOW) {
      this.showNotification(appError);
    }

    // Show dialog for high+ severity errors
    if (options.showDialog !== false && 
        (appError.severity === ErrorSeverity.HIGH || appError.severity === ErrorSeverity.CRITICAL)) {
      await this.showErrorDialog(appError);
    }

    // Attempt auto-recovery for recoverable errors
    if (options.autoRecover !== false && appError.recoverable) {
      await this.attemptRecovery(appError);
    }

    // Log to console for development
    console.error(`[${appError.category.toUpperCase()}] ${appError.message}`, {
      code: appError.code,
      severity: appError.severity,
      details: appError.details,
      context: appError.context
    });
  }

  /**
   * Create a standardized error from various input types
   */
  public createError(
    code: string,
    category: ErrorCategory,
    severity: ErrorSeverity,
    message: string,
    userMessage: string,
    actionableSteps: string[],
    details?: any,
    context?: Record<string, any>
  ): AppError {
    const error: AppError = {
      id: this.generateErrorId(),
      code,
      category,
      severity,
      message,
      details,
      timestamp: new Date(),
      recoverable: this.isRecoverable(code),
      userMessage,
      actionableSteps
    };
    
    if (context) {
      error.context = context;
    }
    
    return error;
  }

  /**
   * Get predefined error templates for common scenarios
   */
  public getErrorTemplate(errorType: string, details?: any): AppError {
    const templates: Record<string, Partial<AppError>> = {
      PORT_CONFLICT: {
        code: 'PORT_CONFLICT',
        category: ErrorCategory.SYSTEM,
        severity: ErrorSeverity.HIGH,
        message: 'Server ports are already in use',
        userMessage: 'The download server cannot start because the required ports are already being used by another application.',
        actionableSteps: [
          'Close other applications that might be using these ports',
          'Try different port numbers in Settings',
          'Restart your computer to free up ports'
        ],
        recoverable: true
      },
      YTDLP_MISSING: {
        code: 'YTDLP_MISSING',
        category: ErrorCategory.SYSTEM,
        severity: ErrorSeverity.CRITICAL,
        message: 'yt-dlp executable not found',
        userMessage: 'The yt-dlp program required for downloading videos is not installed or cannot be found.',
        actionableSteps: [
          'Download yt-dlp from the official GitHub releases page',
          'Place the yt-dlp.exe file in the application directory',
          'Ensure yt-dlp is in your system PATH'
        ],
        recoverable: true
      },
      FFMPEG_MISSING: {
        code: 'FFMPEG_MISSING',
        category: ErrorCategory.SYSTEM,
        severity: ErrorSeverity.CRITICAL,
        message: 'ffmpeg executable not found',
        userMessage: 'The ffmpeg program required for processing video and audio is not installed or cannot be found.',
        actionableSteps: [
          'Download ffmpeg from the official website (ffmpeg.org)',
          'Ensure the ffmpeg executable is in your system\'s PATH',
          'Restart the application after installation'
        ],
        recoverable: true
      },
      DIRECTORY_ACCESS: {
        code: 'DIRECTORY_ACCESS',
        category: ErrorCategory.FILE_SYSTEM,
        severity: ErrorSeverity.MEDIUM,
        message: 'Cannot access download directory',
        userMessage: 'The application cannot access the configured download directory.',
        actionableSteps: [
          'Check if the directory exists and you have write permissions',
          'Select a different download directory in Settings',
          'Create the directory manually if it doesn\'t exist'
        ],
        recoverable: true
      },
      DATABASE_CORRUPTION: {
        code: 'DATABASE_CORRUPTION',
        category: ErrorCategory.DATABASE,
        severity: ErrorSeverity.HIGH,
        message: 'Database file is corrupted',
        userMessage: 'The download history database has become corrupted and needs to be repaired.',
        actionableSteps: [
          'Allow the application to recreate the database (download history will be lost)',
          'Restart the application to attempt automatic repair',
          'Contact support if the problem persists'
        ],
        recoverable: true
      },
      DOWNLOAD_FAILED: {
        code: 'DOWNLOAD_FAILED',
        category: ErrorCategory.DOWNLOAD,
        severity: ErrorSeverity.MEDIUM,
        message: 'Download failed',
        userMessage: 'The video download could not be completed.',
        actionableSteps: [
          'Check your internet connection',
          'Verify the video URL is still valid',
          'Try downloading again',
          'Check if the video is region-restricted'
        ],
        recoverable: true
      },
      NETWORK_ERROR: {
        code: 'NETWORK_ERROR',
        category: ErrorCategory.NETWORK,
        severity: ErrorSeverity.MEDIUM,
        message: 'Network connection error',
        userMessage: 'A network error occurred while communicating with the server.',
        actionableSteps: [
          'Check your internet connection',
          'Verify firewall settings allow the application',
          'Try again in a few moments',
          'Restart the application if the problem persists'
        ],
        recoverable: true
      },
      CONFIG_INVALID: {
        code: 'CONFIG_INVALID',
        category: ErrorCategory.CONFIGURATION,
        severity: ErrorSeverity.MEDIUM,
        message: 'Invalid configuration detected',
        userMessage: 'The application settings contain invalid values.',
        actionableSteps: [
          'Reset settings to default values',
          'Check individual settings for valid ranges',
          'Ensure all required fields are filled'
        ],
        recoverable: true
      }
    };

    const template = templates[errorType];
    if (!template) {
      throw new Error(`Unknown error template: ${errorType}`);
    }

    return {
      id: this.generateErrorId(),
      timestamp: new Date(),
      details,
      ...template
    } as AppError;
  }

  private normalizeError(error: Error | AppError): AppError {
    if (this.isAppError(error)) {
      return error;
    }

    // Convert regular Error to AppError
    return {
      id: this.generateErrorId(),
      code: 'UNKNOWN_ERROR',
      category: ErrorCategory.SYSTEM,
      severity: ErrorSeverity.MEDIUM,
      message: error.message || 'An unknown error occurred',
      timestamp: new Date(),
      recoverable: false,
      userMessage: 'An unexpected error occurred. Please try again or contact support if the problem persists.',
      actionableSteps: [
        'Try the operation again',
        'Restart the application',
        'Check the error logs for more details'
      ],
      details: {
        stack: error.stack,
        name: error.name
      }
    };
  }

  private isAppError(error: any): error is AppError {
    return error && typeof error === 'object' && 'code' in error && 'category' in error;
  }

  private generateErrorId(): string {
    return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private isRecoverable(code: string): boolean {
    const recoverableCodes = [
      'PORT_CONFLICT',
      'YTDLP_MISSING',
      'FFMPEG_MISSING',
      'DIRECTORY_ACCESS',
      'DATABASE_CORRUPTION',
      'DOWNLOAD_FAILED',
      'NETWORK_ERROR',
      'CONFIG_INVALID'
    ];
    return recoverableCodes.includes(code);
  }

  private async logToFile(error: AppError): Promise<void> {
    try {
      const logEntry = {
        timestamp: error.timestamp.toISOString(),
        id: error.id,
        code: error.code,
        category: error.category,
        severity: error.severity,
        message: error.message,
        userMessage: error.userMessage,
        details: error.details,
        context: error.context,
        recoverable: error.recoverable
      };

      const logLine = JSON.stringify(logEntry) + '\n';
      await fs.appendFile(this.logPath, logLine, 'utf-8');
    } catch (logError) {
      console.error('Failed to write error to log file:', logError);
    }
  }

  private showNotification(error: AppError): void {
    try {
      if (Notification.isSupported()) {
        const notification = new Notification({
          title: 'YouTube Download Tracker',
          body: error.userMessage,
          icon: this.getNotificationIcon(error.severity),
          urgency: this.getNotificationUrgency(error.severity)
        });

        notification.show();
      }
    } catch (notificationError) {
      console.error('Failed to show notification:', notificationError);
    }
  }

  private async showErrorDialog(error: AppError): Promise<void> {
    try {
      const mainWindow = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
      
      if (!mainWindow) {
        return;
      }

      const recoveryActions = this.recoveryActions.get(error.code) || [];
      const buttons = ['OK'];
      
      if (recoveryActions.length > 0) {
        buttons.unshift(...recoveryActions.map(action => action.label));
      }

      const result = await dialog.showMessageBox(mainWindow, {
        type: this.getDialogType(error.severity),
        title: 'YouTube Download Tracker - Error',
        message: error.userMessage,
        detail: this.formatActionableSteps(error.actionableSteps),
        buttons,
        defaultId: 0,
        cancelId: buttons.length - 1
      });

      // Execute recovery action if selected
      if (result.response < recoveryActions.length) {
        const selectedAction = recoveryActions[result.response];
        if (selectedAction) {
          await selectedAction.action();
        }
      }
    } catch (dialogError) {
      console.error('Failed to show error dialog:', dialogError);
    }
  }

  private async attemptRecovery(error: AppError): Promise<void> {
    const recoveryActions = this.recoveryActions.get(error.code);
    
    if (!recoveryActions || recoveryActions.length === 0) {
      return;
    }

    // Try the primary recovery action automatically
    const primaryAction = recoveryActions.find(action => action.primary);
    if (primaryAction) {
      try {
        await primaryAction.action();
        console.log(`Auto-recovery attempted for error: ${error.code}`);
      } catch (recoveryError) {
        console.error(`Auto-recovery failed for error ${error.code}:`, recoveryError);
      }
    }
  }

  private getNotificationIcon(severity: ErrorSeverity): string {
    // Return appropriate icon path based on severity
    // For now, return empty string - icons will be added in later tasks
    return '';
  }

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

  private getDialogType(severity: ErrorSeverity): 'error' | 'warning' | 'info' {
    switch (severity) {
      case ErrorSeverity.CRITICAL:
      case ErrorSeverity.HIGH:
        return 'error';
      case ErrorSeverity.MEDIUM:
        return 'warning';
      case ErrorSeverity.LOW:
        return 'info';
      default:
        return 'error';
    }
  }

  private formatActionableSteps(steps: string[]): string {
    if (steps.length === 0) {
      return '';
    }

    return 'Suggested actions:\n' + steps.map((step, index) => `${index + 1}. ${step}`).join('\n');
  }

  /**
   * Get recent errors from memory
   */
  public getRecentErrors(limit: number = 50): AppError[] {
    return this.errorLog.slice(0, limit);
  }

  /**
   * Get errors by category
   */
  public getErrorsByCategory(category: ErrorCategory, limit: number = 50): AppError[] {
    return this.errorLog
      .filter(error => error.category === category)
      .slice(0, limit);
  }

  /**
   * Get errors by severity
   */
  public getErrorsBySeverity(severity: ErrorSeverity, limit: number = 50): AppError[] {
    return this.errorLog
      .filter(error => error.severity === severity)
      .slice(0, limit);
  }

  /**
   * Clear error log
   */
  public clearErrorLog(): void {
    this.errorLog = [];
  }

  /**
   * Get error statistics
   */
  public getErrorStatistics(): {
    total: number;
    byCategory: Record<ErrorCategory, number>;
    bySeverity: Record<ErrorSeverity, number>;
    recoverable: number;
    recent24h: number;
  } {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const stats = {
      total: this.errorLog.length,
      byCategory: {} as Record<ErrorCategory, number>,
      bySeverity: {} as Record<ErrorSeverity, number>,
      recoverable: 0,
      recent24h: 0
    };

    // Initialize counters
    Object.values(ErrorCategory).forEach(category => {
      stats.byCategory[category] = 0;
    });
    Object.values(ErrorSeverity).forEach(severity => {
      stats.bySeverity[severity] = 0;
    });

    // Count errors
    this.errorLog.forEach(error => {
      stats.byCategory[error.category]++;
      stats.bySeverity[error.severity]++;
      
      if (error.recoverable) {
        stats.recoverable++;
      }
      
      if (error.timestamp > yesterday) {
        stats.recent24h++;
      }
    });

    return stats;
  }

  /**
   * Export error log to file
   */
  public async exportErrorLog(filePath?: string): Promise<string> {
    const exportPath = filePath || path.join(
      app.getPath('downloads'),
      `error-log-${new Date().toISOString().split('T')[0]}.json`
    );

    try {
      const exportData = {
        exportDate: new Date().toISOString(),
        applicationVersion: app.getVersion(),
        platform: process.platform,
        errors: this.errorLog,
        statistics: this.getErrorStatistics()
      };

      await fs.writeFile(exportPath, JSON.stringify(exportData, null, 2), 'utf-8');
      return exportPath;
    } catch (error) {
      throw new Error(`Failed to export error log: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}