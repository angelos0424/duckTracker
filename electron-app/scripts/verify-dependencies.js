const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * Dependency verification script for Electron Builder
 * Verifies all required dependencies and native modules are properly installed
 */

console.log('Verifying dependencies...');

// Check package.json exists and is valid
const packageJsonPath = path.join(__dirname, '../package.json');
if (!fs.existsSync(packageJsonPath)) {
  console.error('Error: package.json not found');
  process.exit(1);
}

let packageJson;
try {
  packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
} catch (error) {
  console.error('Error: Invalid package.json:', error.message);
  process.exit(1);
}

console.log(`Verifying dependencies for ${packageJson.name} v${packageJson.version}`);

// Check required dependencies
const requiredDeps = {
  'better-sqlite3': 'SQLite database support',
  'express': 'HTTP server framework',
  'ws': 'WebSocket server',
  'yt-dlp-wrap': 'YouTube download functionality',
  'react': 'UI framework',
  'react-dom': 'React DOM rendering',
  'cors': 'Cross-origin resource sharing',
  'uuid': 'UUID generation'
};

const requiredDevDeps = {
  'electron': 'Electron framework',
  'electron-builder': 'Application packaging',
  'typescript': 'TypeScript compiler',
  'webpack': 'Module bundler',
  'concurrently': 'Concurrent script execution'
};

let missingDeps = [];
let missingDevDeps = [];

// Check production dependencies
Object.keys(requiredDeps).forEach(dep => {
  if (!packageJson.dependencies || !packageJson.dependencies[dep]) {
    missingDeps.push(`${dep} (${requiredDeps[dep]})`);
  }
});

// Check development dependencies
Object.keys(requiredDevDeps).forEach(dep => {
  if (!packageJson.devDependencies || !packageJson.devDependencies[dep]) {
    missingDevDeps.push(`${dep} (${requiredDevDeps[dep]})`);
  }
});

if (missingDeps.length > 0) {
  console.error('Missing production dependencies:');
  missingDeps.forEach(dep => console.error(`  - ${dep}`));
}

if (missingDevDeps.length > 0) {
  console.error('Missing development dependencies:');
  missingDevDeps.forEach(dep => console.error(`  - ${dep}`));
}

if (missingDeps.length > 0 || missingDevDeps.length > 0) {
  console.error('\nRun "npm install" to install missing dependencies');
  process.exit(1);
}

// Check if node_modules exists
const nodeModulesPath = path.join(__dirname, '../node_modules');
if (!fs.existsSync(nodeModulesPath)) {
  console.error('Error: node_modules directory not found. Run "npm install" first.');
  process.exit(1);
}

// Check native dependencies
console.log('Checking native dependencies...');
const nativeDeps = ['better-sqlite3'];

nativeDeps.forEach(dep => {
  const depPath = path.join(nodeModulesPath, dep);
  if (fs.existsSync(depPath)) {
    console.log(`✓ ${dep} found`);
    
    // Check if native module is built for Electron
    const buildPath = path.join(depPath, 'build');
    if (fs.existsSync(buildPath)) {
      console.log(`✓ ${dep} native module built`);
    } else {
      console.warn(`⚠ ${dep} may need rebuilding for Electron`);
      console.log(`  Run "npm run rebuild" to rebuild native modules`);
    }
  } else {
    console.error(`✗ ${dep} not found`);
  }
});

// Check TypeScript configuration
const tsConfigPaths = [
  '../tsconfig.json',
  '../tsconfig.main.json',
  '../tsconfig.renderer.json'
];

tsConfigPaths.forEach(configPath => {
  const fullPath = path.join(__dirname, configPath);
  if (fs.existsSync(fullPath)) {
    try {
      JSON.parse(fs.readFileSync(fullPath, 'utf8'));
      console.log(`✓ ${path.basename(configPath)} is valid`);
    } catch (error) {
      console.error(`✗ ${path.basename(configPath)} is invalid:`, error.message);
    }
  } else {
    console.warn(`⚠ ${path.basename(configPath)} not found`);
  }
});

// Check Webpack configuration
const webpackConfigPath = path.join(__dirname, '../webpack.renderer.js');
if (fs.existsSync(webpackConfigPath)) {
  console.log('✓ Webpack configuration found');
} else {
  console.error('✗ Webpack configuration not found');
}

// Check Electron Builder configuration
const builderConfigPath = path.join(__dirname, '../electron-builder.json');
if (fs.existsSync(builderConfigPath)) {
  try {
    JSON.parse(fs.readFileSync(builderConfigPath, 'utf8'));
    console.log('✓ Electron Builder configuration is valid');
  } catch (error) {
    console.error('✗ Electron Builder configuration is invalid:', error.message);
  }
} else {
  console.error('✗ Electron Builder configuration not found');
}

// Check required directories
const requiredDirs = ['src', 'src/main', 'src/renderer', 'assets'];
requiredDirs.forEach(dir => {
  const dirPath = path.join(__dirname, '..', dir);
  if (fs.existsSync(dirPath)) {
    console.log(`✓ ${dir}/ directory exists`);
  } else {
    console.error(`✗ ${dir}/ directory missing`);
  }
});

// Check for icon files
const iconPath = path.join(__dirname, '../assets/icon.png');
if (fs.existsSync(iconPath)) {
  console.log('✓ Application icon found');
} else {
  console.warn('⚠ Application icon (assets/icon.png) not found');
}

console.log('\nDependency verification completed.');
console.log('If any issues were found, please resolve them before building.');