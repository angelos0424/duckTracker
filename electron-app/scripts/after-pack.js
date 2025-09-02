const fs = require('fs');
const path = require('path');

/**
 * After pack script for Electron Builder
 * This script runs after the app is packaged but before creating the installer
 */

module.exports = async function(context) {
  console.log('Running after-pack script...');
  
  const { electronPlatformName, appOutDir } = context;
  
  if (electronPlatformName === 'win32') {
    console.log('Post-processing Windows build...');
    
    // Ensure resources directory exists in the packaged app
    const resourcesDir = path.join(appOutDir, 'resources');
    if (!fs.existsSync(resourcesDir)) {
      fs.mkdirSync(resourcesDir, { recursive: true });
      console.log('Created resources directory in packaged app');
    }
    
    // Check if yt-dlp.exe exists in resources
    const ytDlpPath = path.join(resourcesDir, 'yt-dlp.exe');
    if (!fs.existsSync(ytDlpPath)) {
      console.log('Warning: yt-dlp.exe not found in resources directory');
      console.log('The application will attempt to download it on first run');
    } else {
      console.log('yt-dlp.exe found in resources directory');
    }
    
    // Create version info file
    const versionInfo = {
      version: context.packager.appInfo.version,
      buildTime: new Date().toISOString(),
      electronVersion: context.packager.config.electronVersion,
      platform: 'win32',
      arch: context.arch
    };
    
    const versionPath = path.join(appOutDir, 'resources', 'version.json');
    fs.writeFileSync(versionPath, JSON.stringify(versionInfo, null, 2));
    console.log('Created version info file');
  }
  
  console.log('After-pack script completed.');
};