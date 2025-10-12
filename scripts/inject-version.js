#!/usr/bin/env node

/**
 * Injects version from package.json into public/index.html
 * 
 * This script replaces any version string (v{{VERSION}} or v2.x.x) with the current version
 * from package.json, making it work on multiple runs.
 */

const fs = require('fs');
const path = require('path');

// Read package.json to get version
const packagePath = path.join(__dirname, '..', 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
const version = packageJson.version;

// Read index.html
const indexPath = path.join(__dirname, '..', 'public', 'index.html');
let indexHtml = fs.readFileSync(indexPath, 'utf8');

// Replace both placeholder {{VERSION}} and actual version numbers like v2.5.0
// This regex matches: v{{VERSION}} OR v followed by semantic version (e.g., v2.5.0, v10.20.30)
const versionPattern = /MEDIA STREAM API v(?:\{\{VERSION\}\}|\d+\.\d+\.\d+)/g;
const replacement = `MEDIA STREAM API v${version}`;

// Count matches before replacement
const matchesBefore = (indexHtml.match(versionPattern) || []).length;

if (matchesBefore === 0) {
  console.error('❌ ERROR: Could not find version pattern in index.html');
  console.error('   Expected: "MEDIA STREAM API v{{VERSION}}" or "MEDIA STREAM API v2.5.0"');
  process.exit(1);
}

// Replace version
indexHtml = indexHtml.replace(versionPattern, replacement);

// Write back to file
fs.writeFileSync(indexPath, indexHtml, 'utf8');

console.log(`✅ Injected version ${version} into public/index.html (${matchesBefore} replacement(s))`);
console.log(`   Pattern matched: ${(indexHtml.match(versionPattern) || []).join(', ')}`);

