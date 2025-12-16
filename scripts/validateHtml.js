/**
 * HTML Security Validator
 * Scans markdown/HTML content for potential XSS and injection attacks
 * Used by GitHub Actions to validate pull requests
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Security patterns to detect
const SECURITY_PATTERNS = {
  // Script injection
  scriptTags: {
    pattern: /<script[\s>]/gi,
    severity: 'critical',
    message: 'Script tag detected - potential XSS attack'
  },

  // Event handlers (only checked in markdown files, not React JSX)
  eventHandlers: {
    pattern: /\s(on\w+)\s*=/gi,
    severity: 'critical',
    message: 'Event handler attribute detected (onclick, onerror, etc.) - potential XSS attack (only in HTML/markdown, not React JSX)'
  },

  // JavaScript URLs
  javascriptUrls: {
    pattern: /(?:href|src|action)\s*=\s*["']?\s*javascript:/gi,
    severity: 'critical',
    message: 'JavaScript URL detected - potential XSS attack'
  },

  // Data URIs with HTML/JavaScript
  dataUriHtml: {
    pattern: /data:text\/html/gi,
    severity: 'high',
    message: 'Data URI with HTML detected - potential XSS attack'
  },

  dataUriScript: {
    pattern: /data:.*?script/gi,
    severity: 'critical',
    message: 'Data URI with script detected - potential XSS attack'
  },

  // Iframe injection
  iframeTags: {
    pattern: /<iframe[\s>]/gi,
    severity: 'high',
    message: 'Iframe tag detected - potential content injection'
  },

  // Object/Embed injection
  objectTags: {
    pattern: /<(object|embed)[\s>]/gi,
    severity: 'high',
    message: 'Object/Embed tag detected - potential content injection'
  },

  // Form injection
  formTags: {
    pattern: /<form[\s>]/gi,
    severity: 'medium',
    message: 'Form tag detected - may be blocked by sanitizer'
  },

  // Base tag manipulation
  baseTags: {
    pattern: /<base[\s>]/gi,
    severity: 'high',
    message: 'Base tag detected - potential URL hijacking'
  },

  // Meta refresh
  metaRefresh: {
    pattern: /<meta[^>]*http-equiv\s*=\s*["']?refresh/gi,
    severity: 'medium',
    message: 'Meta refresh detected - potential redirect attack'
  },

  // Style with expression (IE)
  styleExpression: {
    pattern: /style\s*=\s*["'][^"']*expression\s*\(/gi,
    severity: 'high',
    message: 'CSS expression detected - potential XSS (legacy IE)'
  },

  // Import statements in style
  styleImport: {
    pattern: /style\s*=\s*["'][^"']*@import/gi,
    severity: 'medium',
    message: 'CSS @import detected in style attribute'
  },

  // Suspicious class names (not Tailwind pattern)
  suspiciousClasses: {
    pattern: /<span[^>]*class\s*=\s*["'](?!text-)[^"']*["'][^>]*>/gi,
    severity: 'low',
    message: 'Suspicious class name on span - only text-* classes are allowed'
  },

  // SVG with script
  svgScript: {
    pattern: /<svg[^>]*>[\s\S]*?<script/gi,
    severity: 'critical',
    message: 'SVG with embedded script detected - potential XSS'
  },
};

// Directories to scan
const CONTENT_DIRS = [
  'public/content',
  'src',
];

// Files to exclude
const EXCLUDE_PATTERNS = [
  'node_modules',
  'dist',
  'build',
  '.git',
];

/**
 * Remove markdown code blocks from content
 * @param {string} content - Markdown content
 * @returns {string} Content without code blocks
 */
function stripMarkdownCodeBlocks(content) {
  // Remove fenced code blocks (```...```)
  return content.replace(/```[\s\S]*?```/g, '');
}

/**
 * Remove JSDoc and block comments from JavaScript content
 * @param {string} content - JavaScript content
 * @returns {string} Content without comments
 */
function stripJSDocComments(content) {
  // Remove JSDoc comments (/** ... */)
  content = content.replace(/\/\*\*[\s\S]*?\*\//g, '');
  // Remove block comments (/* ... */)
  content = content.replace(/\/\*[\s\S]*?\*\//g, '');
  return content;
}

/**
 * Scan a file for security issues
 * @param {string} filePath - Path to file
 * @returns {Array} Array of findings
 */
function scanFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf-8');
  const findings = [];
  const ext = path.extname(filePath);

  // Skip JSX/JS files for event handler checks (React props, not HTML attributes)
  const isReactFile = ['.jsx', '.js', '.tsx', '.ts'].includes(ext);

  // Preprocess content to remove safe code/comment blocks
  if (ext === '.md') {
    // Remove code blocks from markdown files (code examples are not executable)
    content = stripMarkdownCodeBlocks(content);
  } else if (isReactFile) {
    // Remove JSDoc comments from JavaScript files (type annotations are not executable)
    content = stripJSDocComments(content);
  }

  for (const [name, rule] of Object.entries(SECURITY_PATTERNS)) {
    // Skip event handler checks in React files
    if (isReactFile && name === 'eventHandlers') {
      continue;
    }

    const matches = content.matchAll(rule.pattern);

    for (const match of matches) {
      const lineNumber = content.substring(0, match.index).split('\n').length;
      const line = content.split('\n')[lineNumber - 1];

      findings.push({
        file: filePath,
        line: lineNumber,
        column: match.index - content.lastIndexOf('\n', match.index),
        severity: rule.severity,
        rule: name,
        message: rule.message,
        matched: match[0],
        context: line.trim(),
      });
    }
  }

  return findings;
}

/**
 * Recursively get all files in a directory
 * @param {string} dir - Directory to scan
 * @param {Array} fileList - Accumulated file list
 * @returns {Array} Array of file paths
 */
function getAllFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);

  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    // Skip excluded directories
    if (EXCLUDE_PATTERNS.some(pattern => filePath.includes(pattern))) {
      return;
    }

    if (stat.isDirectory()) {
      getAllFiles(filePath, fileList);
    } else {
      const ext = path.extname(file);
      if (['.md', '.jsx', '.js', '.html'].includes(ext)) {
        fileList.push(filePath);
      }
    }
  });

  return fileList;
}

/**
 * Get changed files from git diff
 * @returns {Array} Array of changed file paths
 */
function getChangedFiles() {
  try {
    // Get changed files from PR
    const baseSha = process.env.GITHUB_BASE_REF || 'main';
    const headSha = process.env.GITHUB_SHA || 'HEAD';

    const output = execSync(
      `git diff --name-only ${baseSha}...${headSha}`,
      { encoding: 'utf-8' }
    );

    return output.trim().split('\n').filter(Boolean);
  } catch (error) {
    console.error('Failed to get changed files:', error.message);
    // Fallback to scanning all files
    return [];
  }
}

/**
 * Main validation function
 */
async function validate() {
  console.log('🔍 Starting HTML security validation...\n');

  // Get files to scan
  let filesToScan = getChangedFiles();

  // If no changed files (local run), scan all content
  if (filesToScan.length === 0) {
    console.log('No changed files detected, scanning all content files...\n');
    filesToScan = [];
    for (const dir of CONTENT_DIRS) {
      const dirPath = path.join(process.cwd(), dir);
      if (fs.existsSync(dirPath)) {
        filesToScan = filesToScan.concat(getAllFiles(dirPath));
      }
    }
  } else {
    console.log(`Scanning ${filesToScan.length} changed files...\n`);
    // Filter to only scan relevant files
    filesToScan = filesToScan.filter(file => {
      const ext = path.extname(file);
      return ['.md', '.jsx', '.js', '.html'].includes(ext) &&
             !EXCLUDE_PATTERNS.some(pattern => file.includes(pattern));
    });
  }

  if (filesToScan.length === 0) {
    console.log('✅ No files to scan');
    return { findings: [], summary: { critical: 0, high: 0, medium: 0, low: 0 } };
  }

  // Scan files
  let allFindings = [];
  for (const file of filesToScan) {
    if (!fs.existsSync(file)) continue;

    const findings = scanFile(file);
    allFindings = allFindings.concat(findings);
  }

  // Summarize findings
  const summary = {
    critical: allFindings.filter(f => f.severity === 'critical').length,
    high: allFindings.filter(f => f.severity === 'high').length,
    medium: allFindings.filter(f => f.severity === 'medium').length,
    low: allFindings.filter(f => f.severity === 'low').length,
  };

  // Print results
  console.log('📊 Validation Results:\n');
  console.log(`   Critical: ${summary.critical}`);
  console.log(`   High:     ${summary.high}`);
  console.log(`   Medium:   ${summary.medium}`);
  console.log(`   Low:      ${summary.low}`);
  console.log(`   Total:    ${allFindings.length}\n`);

  if (allFindings.length > 0) {
    console.log('⚠️  Security Issues Found:\n');

    // Group by severity
    for (const severity of ['critical', 'high', 'medium', 'low']) {
      const findings = allFindings.filter(f => f.severity === severity);
      if (findings.length === 0) continue;

      console.log(`\n${severity.toUpperCase()}:`);
      for (const finding of findings) {
        console.log(`  ${finding.file}:${finding.line}:${finding.column}`);
        console.log(`    ${finding.message}`);
        console.log(`    Matched: ${finding.matched}`);
        console.log(`    Context: ${finding.context}\n`);
      }
    }
  } else {
    console.log('✅ No security issues detected!\n');
  }

  return { findings: allFindings, summary };
}

/**
 * Generate markdown report for PR comment
 */
function generateMarkdownReport(results) {
  const { findings, summary } = results;

  if (findings.length === 0) {
    return `## ✅ HTML Security Validation Passed

No security issues detected in this pull request.

All HTML content has been validated and appears safe.`;
  }

  const hasCritical = summary.critical > 0 || summary.high > 0;
  const emoji = hasCritical ? '🚨' : '⚠️';

  let report = `## ${emoji} HTML Security Validation Results

`;

  if (hasCritical) {
    report += `**⚠️ CRITICAL SECURITY ISSUES DETECTED**

This pull request contains potentially dangerous HTML/JavaScript that could lead to XSS attacks or content injection.

`;
  }

  report += `### Summary

| Severity | Count |
|----------|-------|
| 🔴 Critical | ${summary.critical} |
| 🟠 High | ${summary.high} |
| 🟡 Medium | ${summary.medium} |
| 🔵 Low | ${summary.low} |
| **Total** | **${findings.length}** |

`;

  // Group findings by severity
  for (const severity of ['critical', 'high', 'medium', 'low']) {
    const severityFindings = findings.filter(f => f.severity === severity);
    if (severityFindings.length === 0) continue;

    const emoji = {
      critical: '🔴',
      high: '🟠',
      medium: '🟡',
      low: '🔵'
    }[severity];

    report += `### ${emoji} ${severity.charAt(0).toUpperCase() + severity.slice(1)} Severity Issues\n\n`;

    for (const finding of severityFindings) {
      report += `**\`${finding.file}:${finding.line}\`**\n`;
      report += `- ${finding.message}\n`;
      report += `- Matched: \`${finding.matched}\`\n`;
      report += `- Context: \`${finding.context}\`\n\n`;
    }
  }

  report += `### What This Means

`;

  if (summary.critical > 0) {
    report += `🔴 **Critical issues** are dangerous patterns that will be blocked by the sanitizer and may indicate a malicious attempt to inject scripts or exploit XSS vulnerabilities.

`;
  }

  if (summary.high > 0) {
    report += `🟠 **High severity issues** are potentially dangerous patterns that could be used for content injection or clickjacking attacks.

`;
  }

  if (summary.medium > 0 || summary.low > 0) {
    report += `🟡 **Medium/Low issues** may be blocked by the sanitizer but are less likely to be security concerns.

`;
  }

  report += `### Sanitization

All HTML content is automatically sanitized by \`rehype-sanitize\` before being rendered. Dangerous elements and attributes are stripped.

**Allowed HTML:**
- \`<span class="text-*">\` for text colors
- \`<img src="...">\` for images (safe protocols only)
- \`<div align="...">\` for text alignment
- Standard markdown elements

**Blocked:**
- Scripts, event handlers, javascript: URLs
- Iframes, objects, embeds
- Forms and inputs
- Inline styles with JavaScript

See [\`wiki-framework/SECURITY.md\`](../wiki-framework/SECURITY.md) for complete documentation.

---

**Note:** If you believe these are false positives, please explain the legitimate use case in a comment.
`;

  return report;
}

// Run validation if called directly
const isMainModule = process.argv[1] && import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`;

if (isMainModule || process.argv[1]?.includes('validateHtml.js')) {
  validate()
    .then(results => {
      // Write results to file for GitHub Actions
      const outputFile = process.env.GITHUB_OUTPUT;
      if (outputFile) {
        const report = generateMarkdownReport(results);
        fs.writeFileSync('validation-report.md', report);

        // Set outputs for GitHub Actions
        const hasIssues = results.findings.length > 0;
        const hasCritical = results.summary.critical > 0 || results.summary.high > 0;

        fs.appendFileSync(outputFile, `has_issues=${hasIssues}\n`);
        fs.appendFileSync(outputFile, `has_critical=${hasCritical}\n`);
        fs.appendFileSync(outputFile, `total_issues=${results.findings.length}\n`);
      }

      // Exit with error if critical issues found
      if (results.summary.critical > 0) {
        console.log('\n❌ Validation failed due to critical issues.');
        process.exit(1);
      }

      console.log('\n✅ Validation completed successfully.');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n❌ Validation failed:', error);
      process.exit(1);
    });
}

export { validate, generateMarkdownReport, scanFile };
