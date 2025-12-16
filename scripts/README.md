# Framework Scripts

This directory contains utility scripts used by the wiki framework.

## Scripts

### validateHtml.js
**Purpose**: HTML security validation for pull requests

Scans markdown and JavaScript files for potential XSS and injection attacks.

**Usage:**
```bash
# From parent project
npm run validate:html

# Direct invocation
node wiki-framework/scripts/validateHtml.js

# In GitHub Actions context
GITHUB_BASE_REF=origin/main GITHUB_SHA=HEAD node wiki-framework/scripts/validateHtml.js
```

**Detects:**
- Script injection (`<script>` tags)
- Event handlers (`onclick`, `onerror`, etc.)
- JavaScript URLs (`javascript:`)
- Data URIs with HTML/JavaScript
- Iframe/object/embed injection
- Form elements
- Base tag manipulation
- Meta refresh redirects
- CSS expressions
- SVG with scripts

**Smart Filtering (Prevents False Positives):**
- **Markdown files**: Strips code blocks (``` ... ```) before scanning - code examples are not executable
- **JavaScript files**: Strips JSDoc comments (/** ... */) before scanning - type annotations are not executable
- **React files**: Skips event handler pattern matching in `.jsx`/`.js`/`.tsx`/`.ts` files - React props are not HTML attributes

**Severity Levels:**
- **Critical**: Blocks merge, adds security label
- **High**: Warning, adds security label
- **Medium**: Warning only
- **Low**: Informational

**Configuration:**
Edit `SECURITY_PATTERNS` object in the script to add/modify patterns.

**Output:**
- Console summary of findings
- `validation-report.md` for GitHub Actions
- GitHub Action outputs: `has_issues`, `has_critical`, `total_issues`

**Integration:**
Used by `.github/workflows/html-security-validation.yml` in parent projects.

See `wiki-framework/SECURITY.md` for sanitization details.

## Adding New Scripts

When adding scripts to the framework:
1. Make them generic and reusable
2. Document usage in this README
3. Add to appropriate workflow if needed
4. Test in isolation before integration
5. Keep framework-specific, not game-specific

## Testing

Test scripts locally before committing:

```bash
# Test validation script
cd wiki-framework
node scripts/validateHtml.js

# Or from parent project
npm run validate:html
```

## Dependencies

Scripts use ES modules (`type: "module"` in package.json). Ensure:
- Node.js 18+ for native ES module support
- Import statements instead of require()
- `.js` extension in imports when needed
