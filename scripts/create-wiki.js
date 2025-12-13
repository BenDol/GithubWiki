#!/usr/bin/env node

/**
 * create-wiki.js
 * Script to create a new wiki project using the framework as a submodule
 *
 * Usage: node scripts/create-wiki.js <wiki-name> [options]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const __dirname = dirname(fileURLToPath(import.meta.url));
const frameworkRoot = path.resolve(__dirname, '..');

// Parse command line arguments
const args = process.argv.slice(2);
const wikiName = args[0];

if (!wikiName) {
  console.error('❌ Error: Please provide a wiki name');
  console.log('Usage: node scripts/create-wiki.js <wiki-name>');
  console.log('Example: node scripts/create-wiki.js my-awesome-wiki');
  process.exit(1);
}

const wikiPath = path.resolve(process.cwd(), wikiName);

console.log('🚀 Creating new wiki project...');
console.log(`📁 Location: ${wikiPath}`);
console.log('');

async function createWiki() {
  // 1. Create project directory
  if (fs.existsSync(wikiPath)) {
    console.error(`❌ Error: Directory '${wikiName}' already exists`);
    process.exit(1);
  }

  fs.mkdirSync(wikiPath, { recursive: true });
  console.log('✅ Created project directory');

  // 2. Initialize git
  await execAsync('git init', { cwd: wikiPath });
  console.log('✅ Initialized git repository');

  // 3. Add framework as submodule
  console.log('📦 Adding wiki framework as submodule...');
  try {
    // Use relative path if creating from within framework repo
    await execAsync(`git submodule add ${frameworkRoot} wiki-framework`, { cwd: wikiPath });
    console.log('✅ Added wiki framework submodule');
  } catch (error) {
    console.warn('⚠️  Could not add as submodule (you may need to add manually)');
    console.log('   Run this after pushing framework to GitHub:');
    console.log(`   git submodule add <framework-repo-url> wiki-framework`);
  }

  // 4. Copy template files from example-parent-wiki
  const templatePath = path.join(frameworkRoot, 'example-parent-wiki');

  const filesToCopy = [
    'package.json',
    'vite.config.js',
    'tailwind.config.js',
    'postcss.config.js',
    'wiki-config.json',
    '.env.example',
    'index.html',
    'main.jsx',
    'README.md',
  ];

  for (const file of filesToCopy) {
    const src = path.join(templatePath, file);
    const dest = path.join(wikiPath, file);

    if (fs.existsSync(src)) {
      let content = fs.readFileSync(src, 'utf-8');

      // Replace template values
      content = content.replace(/my-wiki/g, wikiName);
      content = content.replace(/My Wiki/g, toTitleCase(wikiName));
      content = content.replace(/My Custom Wiki/g, `${toTitleCase(wikiName)} Documentation`);

      fs.writeFileSync(dest, content);
      console.log(`✅ Created ${file}`);
    }
  }

  // 5. Create directory structure
  const directories = [
    'content/getting-started',
    'content/guides',
    'content/reference',
    'public',
  ];

  for (const dir of directories) {
    fs.mkdirSync(path.join(wikiPath, dir), { recursive: true });
  }
  console.log('✅ Created content directories');

  // 6. Create example content
  const exampleContent = `---
title: Welcome
description: Getting started with your wiki
tags: [introduction]
category: Documentation
date: ${new Date().toISOString().split('T')[0]}
---

# Welcome to ${toTitleCase(wikiName)}

This is your wiki homepage. Edit this file at \`content/getting-started/index.md\`.

## Quick Links

- [Guides](/guides)
- [Reference](/reference)

## Getting Started

1. Edit \`wiki-config.json\` to customize your wiki
2. Add content to the \`content/\` directory
3. Run \`npm run dev\` to see your changes

## Features

- 📝 Markdown-powered content
- 🔍 Full-text search
- 🎨 Dark mode support
- ✏️ GitHub-based editing
- 📜 Version history
- 🚀 Easy deployment

Happy wiki building! 🎉
`;

  fs.writeFileSync(path.join(wikiPath, 'content/getting-started/index.md'), exampleContent);
  console.log('✅ Created example content');

  // 7. Create .gitignore
  const gitignore = `# Dependencies
node_modules
dist
*.local

# Logs
logs
*.log

# Environment variables
.env
.env.local

# Editor
.vscode/*
!.vscode/extensions.json
.idea

# OS
.DS_Store
Thumbs.db

# Build output
dist
build

# Search index (generated)
public/search-index.json
`;

  fs.writeFileSync(path.join(wikiPath, '.gitignore'), gitignore);
  console.log('✅ Created .gitignore');

  // 8. Print next steps
  console.log('');
  console.log('🎉 Wiki project created successfully!');
  console.log('');
  console.log('📝 Next steps:');
  console.log('');
  console.log(`   cd ${wikiName}`);
  console.log('   npm install');
  console.log('   npm run dev');
  console.log('');
  console.log('🔧 Configuration:');
  console.log('');
  console.log('   1. Edit wiki-config.json to customize your wiki');
  console.log('   2. Copy .env.example to .env.local and add your GitHub OAuth Client ID');
  console.log('   3. Add content to the content/ directory');
  console.log('');
  console.log('📚 Documentation:');
  console.log('');
  console.log('   - README.md in your project');
  console.log('   - wiki-framework/README.md for framework docs');
  console.log('   - wiki-framework/DEPLOYMENT.md for deployment guide');
  console.log('');
}

function toTitleCase(str) {
  return str
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// Run the script
createWiki().catch((error) => {
  console.error('❌ Error creating wiki:', error);
  process.exit(1);
});
