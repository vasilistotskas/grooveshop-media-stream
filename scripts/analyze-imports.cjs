#!/usr/bin/env node
/**
 * Analyzes import patterns to identify files that need refactoring
 * 
 * Rules:
 * - Internal imports (same module) should use relative paths
 * - External imports (different modules) should use #microservice alias
 */

const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '../src/MediaStream');

// Module directories
const modules = [
  'API',
  'Cache',
  'Config',
  'Correlation',
  'Health',
  'HTTP',
  'Metrics',
  'Monitoring',
  'Queue',
  'RateLimit',
  'Storage',
  'Tasks',
  'Validation',
  'common'
];

function getModuleFromPath(filePath) {
  const relativePath = path.relative(srcDir, filePath);
  const parts = relativePath.split(path.sep);
  return parts[0];
}

function analyzeFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const module = getModuleFromPath(filePath);
  
  const issues = [];
  
  lines.forEach((line, index) => {
    const importMatch = line.match(/import.*from\s+['"]#microservice\/([^'"]+)['"]/);
    if (importMatch) {
      const importPath = importMatch[1];
      const importModule = importPath.split('/')[0];
      
      // Check if importing from same module (should use relative path)
      if (importModule === module) {
        issues.push({
          line: index + 1,
          text: line.trim(),
          type: 'internal-using-alias',
          suggestion: 'Should use relative path instead of #microservice alias'
        });
      }
    }
  });
  
  return issues;
}

function scanDirectory(dir) {
  const results = [];
  
  function scan(currentDir) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      
      if (entry.isDirectory()) {
        scan(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
        const issues = analyzeFile(fullPath);
        if (issues.length > 0) {
          results.push({
            file: path.relative(srcDir, fullPath),
            issues
          });
        }
      }
    }
  }
  
  scan(dir);
  return results;
}

// Run analysis
console.log('🔍 Analyzing import patterns...\n');

const results = scanDirectory(srcDir);

if (results.length === 0) {
  console.log('✅ All imports follow the correct pattern!');
} else {
  console.log(`❌ Found ${results.length} files with incorrect import patterns:\n`);
  
  results.forEach(({ file, issues }) => {
    console.log(`📄 ${file}`);
    issues.forEach(issue => {
      console.log(`   Line ${issue.line}: ${issue.suggestion}`);
      console.log(`   ${issue.text}`);
    });
    console.log('');
  });
  
  console.log(`\n📊 Summary:`);
  console.log(`   Files to fix: ${results.length}`);
  console.log(`   Total issues: ${results.reduce((sum, r) => sum + r.issues.length, 0)}`);
}
