#!/usr/bin/env node
/**
 * Automatically fixes import patterns
 * 
 * Converts internal module imports from #microservice alias to relative paths
 */

const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '../src/MediaStream');

function getModuleFromPath(filePath) {
  const relativePath = path.relative(srcDir, filePath);
  const parts = relativePath.split(path.sep);
  return parts[0];
}

function getRelativePath(fromFile, toModule, toPath) {
  const fromDir = path.dirname(fromFile);
  const toFile = path.join(srcDir, toModule, toPath);
  
  let relative = path.relative(fromDir, toFile);
  
  // Convert Windows paths to Unix-style
  relative = relative.replace(/\\/g, '/');
  
  // Ensure it starts with ./  or ../
  if (!relative.startsWith('.')) {
    relative = './' + relative;
  }
  
  // Add .js extension
  if (!relative.endsWith('.js')) {
    relative += '.js';
  }
  
  return relative;
}

function fixFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const module = getModuleFromPath(filePath);
  
  let modified = false;
  const newLines = lines.map(line => {
    const importMatch = line.match(/^(.*from\s+['"])#microservice\/([^'"]+)(['"].*)/);
    if (importMatch) {
      const [, prefix, importPath, suffix] = importMatch;
      const importModule = importPath.split('/')[0];
      
      // Only fix if importing from same module
      if (importModule === module) {
        const restOfPath = importPath.substring(importModule.length + 1);
        const relativePath = getRelativePath(filePath, module, restOfPath);
        modified = true;
        return `${prefix}${relativePath}${suffix}`;
      }
    }
    return line;
  });
  
  if (modified) {
    fs.writeFileSync(filePath, newLines.join('\n'), 'utf-8');
    return true;
  }
  
  return false;
}

function scanAndFix(dir) {
  let fixedCount = 0;
  
  function scan(currentDir) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      
      if (entry.isDirectory()) {
        scan(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
        if (fixFile(fullPath)) {
          fixedCount++;
          console.log(`✅ Fixed: ${path.relative(srcDir, fullPath)}`);
        }
      }
    }
  }
  
  scan(dir);
  return fixedCount;
}

// Run fix
console.log('🔧 Fixing import patterns...\n');

const fixedCount = scanAndFix(srcDir);

console.log(`\n✨ Fixed ${fixedCount} files!`);
console.log('\n📝 Next steps:');
console.log('   1. Run: pnpm run lint');
console.log('   2. Run: pnpm run type-check');
console.log('   3. Run: pnpm run test');
