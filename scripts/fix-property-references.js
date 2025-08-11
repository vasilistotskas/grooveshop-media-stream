#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Get all TypeScript files in src directory
function getAllTsFiles(dir, files = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    
    if (entry.isDirectory() && !['node_modules', 'build', 'dist', '.git'].includes(entry.name)) {
      getAllTsFiles(fullPath, files);
    } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')) {
      files.push(fullPath);
    }
  }
  
  return files;
}

// Fix property references that were renamed with underscores
function fixPropertyReferences(content) {
  // Fix common property references
  const patterns = [
    { from: /\bthis\.correlationService\b/g, to: 'this._correlationService' },
    { from: /\bthis\.configService\b/g, to: 'this._configService' },
    { from: /\bthis\.httpService\b/g, to: 'this._httpService' },
    { from: /\bthis\.logger\b/g, to: 'this._logger' },
    { from: /\bthis\.warningThreshold\b/g, to: 'this._warningThreshold' },
    { from: /\bthis\.criticalThreshold\b/g, to: 'this._criticalThreshold' }
  ];
  
  patterns.forEach(pattern => {
    content = content.replace(pattern.from, pattern.to);
  });
  
  return content;
}

// Fix remaining error type issues
function fixRemainingErrors(content) {
  // Fix parameter types
  content = content.replace(/\(error\) =>/g, '(error: unknown) =>');
  content = content.replace(/\(err\) =>/g, '(err: unknown) =>');
  content = content.replace(/catch \(error\)/g, 'catch (error: unknown)');
  content = content.replace(/catch \(err\)/g, 'catch (err: unknown)');
  
  return content;
}

// Main processing function
function processFile(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    const originalContent = content;
    
    content = fixPropertyReferences(content);
    content = fixRemainingErrors(content);
    
    if (content !== originalContent) {
      fs.writeFileSync(filePath, content);
      console.log(`✅ Fixed: ${filePath}`);
      return true;
    }
    
    return false;
  } catch (error) {
    console.error(`❌ Error processing ${filePath}:`, error.message);
    return false;
  }
}

// Main execution
function main() {
  console.log('🔧 Fixing property references and remaining errors...\n');
  
  const files = getAllTsFiles('src');
  let fixedCount = 0;
  
  files.forEach(file => {
    if (processFile(file)) {
      fixedCount++;
    }
  });
  
  console.log(`\n📊 Summary: Fixed ${fixedCount} out of ${files.length} files`);
}

main();