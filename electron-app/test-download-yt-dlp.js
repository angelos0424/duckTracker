const fs = require('fs');
const path = require('path');
const https = require('https');

async function downloadYtDlp(platform = process.platform) {
  let ytDlpPath, ytDlpUrl, fileName;

  if (platform === 'win32') {
    fileName = 'yt-dlp.exe';
    ytDlpPath = path.join(__dirname, 'resources', 'yt-dlp.exe');
    ytDlpUrl = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe';
  } else if (platform === 'darwin') {
    fileName = 'yt-dlp';
    ytDlpPath = path.join(__dirname, 'resources', 'yt-dlp');
    ytDlpUrl = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos';
  } else {
    throw new Error(`Unsupported platform: ${platform}`);
  }

  return new Promise((resolve, reject) => {
    console.log(`Starting download of ${fileName} from ${ytDlpUrl} to ${ytDlpPath}...`);
    const file = fs.createWriteStream(ytDlpPath);
    
    https.get(ytDlpUrl, (response) => {
      console.log(`HTTP Status Code: ${response.statusCode}`);
      if (response.statusCode === 302 || response.statusCode === 301) {
        console.log(`Redirecting to: ${response.headers.location}`);
        https.get(response.headers.location, (redirectResponse) => {
          redirectResponse.pipe(file);
          redirectResponse.on('data', (chunk) => {
            console.log(`Received ${chunk.length} bytes of data.`);
          });
          file.on('finish', () => {
            file.close();
            const finalSize = fs.statSync(ytDlpPath).size;
            console.log(`File finished writing. Final size: ${finalSize} bytes.`);
            if (finalSize === 0) {
              console.error(`❌ Error: Downloaded file is 0 bytes. Rejecting promise.`);
              return reject(new Error(`Downloaded file is 0 bytes.`));
            }
            if (platform === 'darwin') {
              try {
                fs.chmodSync(ytDlpPath, '755');
                console.log(`✓ Made ${fileName} executable.`);
              } catch (error) {
                console.warn('Failed to make yt-dlp executable:', error.message);
              }
            }
            console.log(`✓ ${fileName} downloaded successfully`);
            resolve();
          });
          redirectResponse.on('error', (err) => {
            console.error(`Redirect response stream error:`, err);
            reject(err);
          });
        }).on('error', (err) => {
          console.error(`HTTP GET (redirect) error:`, err);
          reject(err);
        });
      } else if (response.statusCode === 200) {
        response.pipe(file);
        response.on('data', (chunk) => {
          console.log(`Received ${chunk.length} bytes of data.`);
        });
        file.on('finish', () => {
          file.close();
          const finalSize = fs.statSync(ytDlpPath).size;
          console.log(`File finished writing. Final size: ${finalSize} bytes.`);
          if (finalSize === 0) {
            console.error(`❌ Error: Downloaded file is 0 bytes. Rejecting promise.`);
            return reject(new Error(`Downloaded file is 0 bytes.`));
          }
          if (platform === 'darwin') {
            try {
              fs.chmodSync(ytDlpPath, '755');
              console.log(`✓ Made ${fileName} executable.`);
            } catch (error) {
              console.warn('Failed to make yt-dlp executable:', error.message);
            }
          }
          console.log(`✓ ${fileName} downloaded successfully`);
          resolve();
        });
        response.on('error', (err) => {
          console.error(`Response stream error:`, err);
          reject(err);
        });
      } else {
        reject(new Error(`Failed to download yt-dlp: HTTP ${response.statusCode}`));
      }
    }).on('error', (err) => {
      console.error(`HTTP GET error:`, err);
      reject(err);
    });
    
    file.on('error', (err) => {
      console.error(`File stream error for ${ytDlpPath}:`, err);
      fs.unlink(ytDlpPath, () => {});
      reject(err);
    });
  });
}

async function runTest() {
  try {
    // Ensure the resources directory exists
    const resourcesDir = path.join(__dirname, 'resources');
    if (!fs.existsSync(resourcesDir)) {
      fs.mkdirSync(resourcesDir, { recursive: true });
      console.log(`Created resources directory: ${resourcesDir}`);
    }

    await downloadYtDlp();
    console.log('Test download completed successfully.');
    const ytDlpPath = path.join(__dirname, 'resources', 'yt-dlp');
    const stats = fs.statSync(ytDlpPath);
    console.log(`Final yt-dlp file size: ${stats.size} bytes.`);
  } catch (error) {
    console.error('Test download failed:', error);
  }
}

runTest();
