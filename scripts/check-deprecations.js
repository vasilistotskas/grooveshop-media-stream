#!/usr/bin/env node

/**
 * Script to check for deprecation warnings in the project
 * Usage: node scripts/check-deprecations.js
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🔍 Checking for deprecation warnings...\n');

// Known deprecated patterns to search for
const deprecatedPatterns = [
  // RxJS deprecations
  { pattern: 'retryWhen', replacement: 'retry with delay option', file: '**/*.ts' },
  { pattern: 'switchMap.*from.*rxjs/operators', replacement: 'import from rxjs directly', file: '**/*.ts' },
  { pattern: 'mergeMap.*from.*rxjs/operators', replacement: 'import from rxjs directly', file: '**/*.ts' },
  { pattern: 'concatMap.*from.*rxjs/operators', replacement: 'import from rxjs directly', file: '**/*.ts' },
  { pattern: 'exhaustMap.*from.*rxjs/operators', replacement: 'import from rxjs directly', file: '**/*.ts' },
  
  // Node.js deprecations
  { pattern: 'new Buffer\\(', replacement: 'Buffer.from() or Buffer.alloc()', file: '**/*.ts' },
  { pattern: 'require\\(.*crypto.*\\)\\.createHash', replacement: 'import crypto from "crypto"', file: '**/*.ts' },
  
  // NestJS deprecations (check for older patterns)
  { pattern: '@nestjs/common.*HttpException', replacement: 'specific HTTP exceptions', file: '**/*.ts' },
];

let foundIssues = 0;

// Function to run TypeScript compiler and capture deprecation warnings
function checkTypeScriptDeprecations() {
  console.log('📝 Running TypeScript compiler for deprecation warnings...');
  
  try {
    // Run tsc with specific flags to catch deprecations
    const result = execSync('npx tsc --noEmit --skipLibCheck false --strict', { 
      encoding: 'utf8',
      stdio: 'pipe'
    });
    console.log('✅ No TypeScript deprecation warnings found');
  } catch (error) {
    const output = error.stdout + error.stderr;
    
    // Look for deprecation-related messages
    const deprecationLines = output.split('\n').filter(line => 
      line.toLowerCase().includes('deprecat') || 
      line.includes('TS6385') || // Deprecated symbol used
      line.includes('TS6133')    // Unused parameter (often related to deprecated APIs)
    );
    
    if (deprecationLines.length > 0) {
      console.log('⚠️  TypeScript deprecation warnings found:');
      deprecationLines.forEach(line => console.log(`   ${line}`));
      foundIssues += deprecationLines.length;
    }
  }
}

// Function to recursively get all TypeScript files
function getAllTsFiles(dir, files = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    
    if (entry.isDirectory() && !['node_modules', 'build', 'dist', '.git'].includes(entry.name)) {
      getAllTsFiles(fullPath, files);
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      files.push(fullPath);
    }
  }
  
  return files;
}

// Function to search for known deprecated patterns
function searchDeprecatedPatterns() {
  console.log('\n🔎 Searching for known deprecated patterns...');
  
  // Get all TypeScript files
  const files = getAllTsFiles('src');
  
  deprecatedPatterns.forEach(({ pattern, replacement }) => {
    let found = false;
    const regex = new RegExp(pattern, 'gi');
    
    files.forEach(file => {
      try {
        const content = fs.readFileSync(file, 'utf8');
        const lines = content.split('\n');
        
        lines.forEach((line, index) => {
          if (regex.test(line)) {
            if (!found) {
              console.log(`\n⚠️  Found deprecated pattern: ${pattern}`);
              console.log(`   Replacement: ${replacement}`);
              console.log(`   Occurrences:`);
              found = true;
            }
            console.log(`     ${file}:${index + 1}: ${line.trim()}`);
          }
        });
      } catch (error) {
        // Skip files that can't be read
      }
    });
    
    if (found) {
      foundIssues++;
    }
  });
}

// Function to check package.json for deprecated dependencies
function checkDependencyDeprecations() {
  console.log('\n📦 Checking for deprecated dependencies...');
  
  try {
    const result = execSync('npm audit --audit-level=moderate --json', {
      encoding: 'utf8',
      stdio: 'pipe'
    });
    
    const auditData = JSON.parse(result);
    if (auditData.vulnerabilities && Object.keys(auditData.vulnerabilities).length > 0) {
      console.log('⚠️  Found dependency issues (may include deprecations):');
      Object.entries(auditData.vulnerabilities).forEach(([pkg, info]) => {
        if (info.severity === 'info' && info.title?.toLowerCase().includes('deprecat')) {
          console.log(`   ${pkg}: ${info.title}`);
          foundIssues++;
        }
      });
    }
  } catch (error) {
    console.log('ℹ️  Could not run npm audit (this is normal with pnpm)');
  }
}

// Main execution
async function main() {
  checkTypeScriptDeprecations();
  searchDeprecatedPatterns();
  checkDependencyDeprecations();
  
  console.log(`\n📊 Summary:`);
  if (foundIssues === 0) {
    console.log('✅ No deprecation warnings found!');
  } else {
    console.log(`⚠️  Found ${foundIssues} potential deprecation issues`);
    console.log('\n💡 Tips:');
    console.log('   - Check your IDE for strikethrough text indicating deprecations');
    console.log('   - Run your build process to catch build-time deprecations');
    console.log('   - Update dependencies regularly to avoid deprecated APIs');
    console.log('   - Use ESLint rules like @typescript-eslint/no-deprecated');
  }
}

main().catch(console.error);