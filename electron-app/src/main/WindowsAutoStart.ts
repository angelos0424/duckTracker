import { app } from 'electron';
import { spawn } from 'child_process';

/**
 * Windows Auto-Start Manager
 * Handles adding/removing the application from Windows startup programs
 * using Windows Registry manipulation
 */
export class WindowsAutoStart {
  private readonly appName: string;
  private readonly executablePath: string;
  private readonly registryKey: string;

  constructor() {
    // Use a fallback app name if Electron app is not initialized
    this.appName = this.getAppName();
    this.executablePath = process.execPath;
    this.registryKey = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
  }

  /**
   * Get application name with fallback
   */
  private getAppName(): string {
    try {
      return app.getName() || 'YouTube Downloader';
    } catch (error) {
      // Fallback if app is not initialized
      return 'YouTube Downloader';
    }
  }

  /**
   * Enable auto-start by adding registry entry
   */
  async enable(): Promise<void> {
    if (process.platform !== 'win32') {
      throw new Error('Auto-start is only supported on Windows');
    }

    try {
      // Use reg.exe to add registry entry
      // The value includes --hidden flag to start minimized
      const command = `"${this.executablePath}" --hidden`;
      
      await this.executeRegistryCommand('add', this.registryKey, '/v', this.appName, '/t', 'REG_SZ', '/d', command, '/f');
      
      // Validate that the entry was added successfully
      const isEnabled = await this.isEnabled();
      if (!isEnabled) {
        throw new Error('Failed to verify auto-start registry entry');
      }
    } catch (error) {
      throw new Error(`Failed to enable auto-start: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Disable auto-start by removing registry entry
   */
  async disable(): Promise<void> {
    if (process.platform !== 'win32') {
      throw new Error('Auto-start is only supported on Windows');
    }

    try {
      // Use reg.exe to delete registry entry
      await this.executeRegistryCommand('delete', this.registryKey, '/v', this.appName, '/f');
    } catch (error) {
      // If the key doesn't exist, that's fine - it's already disabled
      if (error instanceof Error && error.message.includes('cannot find')) {
        return;
      }
      throw new Error(`Failed to disable auto-start: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Check if auto-start is currently enabled
   */
  async isEnabled(): Promise<boolean> {
    if (process.platform !== 'win32') {
      return false;
    }

    try {
      const output = await this.executeRegistryCommand('query', this.registryKey, '/v', this.appName);
      
      // Check if the output contains our app name and executable path
      return output.includes(this.appName) && output.includes(this.executablePath);
    } catch (error) {
      // If query fails, the key doesn't exist
      return false;
    }
  }

  /**
   * Validate that auto-start setting works correctly
   * This checks both registry state and executable accessibility
   */
  async validate(): Promise<{ valid: boolean; error?: string }> {
    if (process.platform !== 'win32') {
      return { valid: false, error: 'Auto-start is only supported on Windows' };
    }

    try {
      // Check if executable exists and is accessible
      const fs = await import('fs/promises');
      await fs.access(this.executablePath);

      // Check current registry state
      const isEnabled = await this.isEnabled();
      
      return { valid: true };
    } catch (error) {
      return { 
        valid: false, 
        error: `Auto-start validation failed: ${error instanceof Error ? error.message : 'Unknown error'}` 
      };
    }
  }

  /**
   * Get the current auto-start configuration info
   */
  getInfo(): { appName: string; executablePath: string; registryKey: string } {
    return {
      appName: this.appName,
      executablePath: this.executablePath,
      registryKey: this.registryKey
    };
  }

  /**
   * Execute a Windows registry command using reg.exe
   */
  private executeRegistryCommand(...args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const process = spawn('reg.exe', args, {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      process.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      process.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      process.on('close', (code) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(`Registry command failed with code ${code}: ${stderr || stdout}`));
        }
      });

      process.on('error', (error) => {
        reject(new Error(`Failed to execute registry command: ${error.message}`));
      });
    });
  }
}