const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

module.exports = async function(context) {
  console.log('Running before-pack script...');
  
  try {
    const requiredDirs = [
      path.join(__dirname, '../build'),
      path.join(__dirname, '../resources'),
      path.join(__dirname, '../dist'),
    ];
    requiredDirs.forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`Created directory: ${dir}`);
      }
    });

    await checkAndDownloadYtDlp(context);
    await acquireFfmpeg(context);
    await createBuildInfo(context);
    
    console.log('✓ Before-pack script completed successfully.');
  } catch (error) {
    console.error('Error in before-pack script:', error);
    throw error;
  }
}

async function downloadFile(url, dest) {
    console.log(`Starting download from ${url} to ${dest}...`);
    try {
        execSync(`curl -L -o "${dest}" -f --retry 3 --progress-bar "${url}"`, { stdio: 'inherit' });
        if (!fs.existsSync(dest) || fs.statSync(dest).size === 0) {
            throw new Error(`Downloaded file is 0 bytes.`);
        }
        console.log(`✓ File downloaded successfully to ${dest}`);
    } catch (error) {
        console.error(`❌ Curl download failed:`, error.message);
        if (fs.existsSync(dest)) fs.unlinkSync(dest);
        throw new Error(`Failed to download file using curl: ${error.message}`);
    }
}

async function checkAndDownloadYtDlp(context) {
  const platform = context.electronPlatformName;
  const fileName = platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
  const ytDlpPath = path.join(__dirname, '../resources', fileName);

  if (!fs.existsSync(ytDlpPath) || fs.statSync(ytDlpPath).size === 0) {
    console.log(`${fileName} not found or is empty. Downloading...`);
    const downloadUrl = platform === 'win32'
        ? 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe'
        : 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos';
    await downloadFile(downloadUrl, ytDlpPath);
    if (platform === 'darwin') {
      fs.chmodSync(ytDlpPath, '755');
      console.log(`✓ Made ${fileName} executable.`);
    }
  } else {
    console.log(`✓ ${fileName} found in resources directory.`);
  }
}

async function acquireFfmpeg(context) {
  console.log('Acquiring ffmpeg binaries for target platform...');
  const platform = context.electronPlatformName;
  const resourcesDir = path.join(__dirname, '../resources');
  const ffmpegBinaryName = platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
  const ffmpegDestPath = path.join(resourcesDir, ffmpegBinaryName);

  // For Windows, we check for all DLLs as well, but ffmpeg.exe is the main one.
  if (fs.existsSync(ffmpegDestPath)) {
    console.log('✓ ffmpeg binary already exists in resources.');
    return;
  }

  let downloadUrl, zipPathInArchive;
  if (platform === 'win32') {
    downloadUrl = 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-full.zip';
    zipPathInArchive = '*/bin/*'; // Get all files from the bin directory
  } else if (platform === 'darwin') {
    downloadUrl = 'https://evermeet.cx/ffmpeg/getrelease/zip';
    zipPathInArchive = 'ffmpeg'; // Only ffmpeg is needed for mac
  } else {
    console.warn(`ffmpeg download not configured for platform: ${platform}. Skipping.`);
    return;
  }

  console.log(`ffmpeg binaries not found. Attempting to download from ${downloadUrl}...`);

  const tempDir = path.join(__dirname, '../build');
  const zipPath = path.join(tempDir, 'ffmpeg-download.zip');

  try {
    await downloadFile(downloadUrl, zipPath);

    console.log(`Unzipping ${zipPath}...`);
    execSync(`unzip -jo "${zipPath}" "${zipPathInArchive}" -d "${resourcesDir}"`, { stdio: 'inherit' });
    console.log(`✓ Extracted ffmpeg assets to ${resourcesDir}`);

    if (platform === 'darwin') {
        fs.chmodSync(ffmpegDestPath, '755');
        console.log(`✓ Made ffmpeg binary executable.`);
    }

  } catch (error) {
    console.error(`❌ Failed to download or extract ffmpeg.`);
    console.error('Please ensure you have an internet connection and the "unzip" command is available in your system\'s PATH.');
    throw error; // Rethrow to fail the build
  } finally {
      if (fs.existsSync(zipPath)) {
          fs.unlinkSync(zipPath);
          console.log(`✓ Cleaned up downloaded zip file.`);
      }
  }
}

async function createBuildInfo(context) {
  const buildInfo = {
    buildTime: new Date().toISOString(),
    nodeVersion: process.version,
    platform: context.electronPlatformName,
    arch: context.arch,
    electronVersion: context.packager.config.electronVersion,
  };
  const buildInfoPath = path.join(__dirname, '../resources/build-info.json');
  fs.writeFileSync(buildInfoPath, JSON.stringify(buildInfo, null, 2));
  console.log('✓ Created build info file');
}
