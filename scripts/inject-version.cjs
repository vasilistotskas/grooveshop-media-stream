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
// Pattern 1: MEDIA STREAM API version
const apiVersionPattern = /MEDIA STREAM API v(?:\{\{VERSION\}\}|\d+\.\d+\.\d+)/g;
const apiReplacement = `MEDIA STREAM API v${version}`;

// Pattern 2: Terminal title version (grooveshop-media-stream@v2.5.0)
const terminalTitlePattern = /grooveshop-media-stream@v(?:\{\{VERSION\}\}|\d+\.\d+\.\d+)/g;
const terminalReplacement = `grooveshop-media-stream@v${version}`;

// Pattern 3: Version badge (v{{VERSION}} or v2.5.0) - standalone version
const versionBadgePattern = /<span class="version">v(?:\{\{VERSION\}\}|\d+\.\d+\.\d+)<\/span>/g;
const versionBadgeReplacement = `<span class="version">v${version}</span>`;

// Count matches before replacement
const apiMatches = (indexHtml.match(apiVersionPattern) || []).length;
const terminalMatches = (indexHtml.match(terminalTitlePattern) || []).length;
const badgeMatches = (indexHtml.match(versionBadgePattern) || []).length;
const totalMatches = apiMatches + terminalMatches + badgeMatches;

if (totalMatches === 0) {
  console.error('❌ ERROR: Could not find version pattern in index.html');
  console.error('   Expected patterns:');
  console.error('   - "MEDIA STREAM API v{{VERSION}}" or "MEDIA STREAM API v2.5.0"');
  console.error('   - "grooveshop-media-stream@v{{VERSION}}" or "grooveshop-media-stream@v2.5.0"');
  console.error('   - "<span class="version">v{{VERSION}}</span>" or "<span class="version">v2.5.0</span>"');
  process.exit(1);
}

// Replace versions
indexHtml = indexHtml.replace(apiVersionPattern, apiReplacement);
indexHtml = indexHtml.replace(terminalTitlePattern, terminalReplacement);
indexHtml = indexHtml.replace(versionBadgePattern, versionBadgeReplacement);

// Write back to file
fs.writeFileSync(indexPath, indexHtml, 'utf8');

console.log(`✅ Injected version ${version} into public/index.html (${totalMatches} replacement(s))`);
console.log(`   - API version: ${apiMatches} replacement(s)`);
console.log(`   - Terminal title: ${terminalMatches} replacement(s)`);
console.log(`   - Version badge: ${badgeMatches} replacement(s)`);

