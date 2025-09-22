import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

const LOG_FILE_NAME = 'app_debug.log';
let logFilePath: string | null = null;
let logStream: fs.WriteStream | null = null;

function getLogFilePath(): string {
    if (logFilePath === null) {
        const userDataPath = app.getPath('userData');
        logFilePath = path.join(userDataPath, LOG_FILE_NAME);
    }
    return logFilePath;
}

function initializeLogger(): void {
    if (logStream === null) {
        const filePath = getLogFilePath();
        // Ensure the directory exists
        const logDir = path.dirname(filePath);
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }

        // Create a write stream, append if file exists
        logStream = fs.createWriteStream(filePath, { flags: 'a' });

        // Override console methods
        const originalConsoleLog = console.log;
        const originalConsoleError = console.error;
        const originalConsoleDebug = console.debug;

        const writeToLog = (level: string, ...args: any[]) => {
            const timestamp = new Date().toISOString();
            const message = args.map(arg => {
                if (typeof arg === 'object' && arg !== null) {
                    return JSON.stringify(arg);
                }
                return String(arg);
            }).join(' ');
            logStream?.write(`[${timestamp}] [${level.toUpperCase()}] ${message}\n`);
        };

        console.log = (...args: any[]) => {
            originalConsoleLog(...args);
            writeToLog('info', ...args);
        };

        console.error = (...args: any[]) => {
            originalConsoleError(...args);
            writeToLog('error', ...args);
        };

        console.debug = (...args: any[]) => {
            originalConsoleDebug(...args);
            writeToLog('debug', ...args);
        };

        console.log(`Logger initialized. Logs will be written to: ${filePath}`);
    }
}

export { initializeLogger };
