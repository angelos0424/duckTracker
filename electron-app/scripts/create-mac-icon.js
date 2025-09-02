const fs = require('fs');
const path = require('path');

// Mac용 ICNS 아이콘 생성을 위한 스크립트
// 실제 프로덕션에서는 iconutil이나 다른 도구를 사용해야 합니다.

const iconPath = path.join(__dirname, '../assets/icon.png');
const icnsPath = path.join(__dirname, '../assets/icon.icns');

if (fs.existsSync(iconPath)) {
  console.log('PNG 아이콘이 존재합니다. ICNS 변환이 필요합니다.');
  console.log('Mac에서 다음 명령어를 실행하여 ICNS 파일을 생성하세요:');
  console.log('1. mkdir icon.iconset');
  console.log('2. sips -z 16 16 icon.png --out icon.iconset/icon_16x16.png');
  console.log('3. sips -z 32 32 icon.png --out icon.iconset/icon_16x16@2x.png');
  console.log('4. sips -z 32 32 icon.png --out icon.iconset/icon_32x32.png');
  console.log('5. sips -z 64 64 icon.png --out icon.iconset/icon_32x32@2x.png');
  console.log('6. sips -z 128 128 icon.png --out icon.iconset/icon_128x128.png');
  console.log('7. sips -z 256 256 icon.png --out icon.iconset/icon_128x128@2x.png');
  console.log('8. sips -z 256 256 icon.png --out icon.iconset/icon_256x256.png');
  console.log('9. sips -z 512 512 icon.png --out icon.iconset/icon_256x256@2x.png');
  console.log('10. sips -z 512 512 icon.png --out icon.iconset/icon_512x512.png');
  console.log('11. sips -z 1024 1024 icon.png --out icon.iconset/icon_512x512@2x.png');
  console.log('12. iconutil -c icns icon.iconset');
  
  // 임시로 PNG 파일을 ICNS로 복사 (실제로는 변환이 필요)
  if (!fs.existsSync(icnsPath)) {
    fs.copyFileSync(iconPath, icnsPath);
    console.log('임시로 PNG 파일을 ICNS로 복사했습니다. 실제 빌드 시에는 적절한 ICNS 파일이 필요합니다.');
  }
} else {
  console.log('아이콘 파일이 없습니다:', iconPath);
}