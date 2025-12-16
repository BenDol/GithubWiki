# Security Measures

## HTML Sanitization

### Overview
The wiki uses `rehype-sanitize` to protect against XSS (Cross-Site Scripting) and HTML injection attacks while allowing safe HTML elements needed for wiki features.

### Protection Against
- ✅ Script injection (`<script>` tags)
- ✅ Event handler injection (`onclick`, `onerror`, `onload`, etc.)
- ✅ JavaScript URLs (`javascript:` protocol)
- ✅ Data URI attacks (except safe image data URLs)
- ✅ iframe/object/embed injection
- ✅ Form injection
- ✅ Meta tag manipulation
- ✅ Style injection with malicious CSS

### Allowed HTML Elements

The sanitization schema allows only these safe HTML elements with specific attributes:

#### Text Colors
```html
<span class="text-red-500">Colored text</span>
<span class="text-blue-600">Blue text</span>
```
- **Element**: `<span>`
- **Allowed attributes**: `class` (only classes starting with `text-`)
- **Use case**: Text color formatting via Tailwind CSS classes

#### Images
```html
<img src="/path/to/image.png" alt="Description" />
<img src="https://example.com/image.jpg" alt="External image" />
```
- **Element**: `<img>`
- **Allowed attributes**: `src`, `alt`, `title`, `width`, `height`
- **Allowed protocols**: `http`, `https`, `/` (relative paths)
- **Blocked**: `javascript:`, `data:`, `blob:` schemes

#### Text Alignment
```html
<div align="center">Centered text</div>
<div align="right">Right-aligned text</div>
```
- **Element**: `<div>`
- **Allowed attributes**: `align` (values: `left`, `center`, `right`)
- **Use case**: Text alignment

#### Headings with Anchors
```html
<h1 id="section-name">Section Title</h1>
<h2 id="subsection">Subsection</h2>
```
- **Elements**: `<h1>` through `<h6>`
- **Allowed attributes**: `id` (for anchor links)
- **Use case**: Table of contents navigation

### Blocked Elements

All HTML elements not explicitly allowed are stripped, including:
- `<script>` - JavaScript execution
- `<iframe>` - Embedding external content
- `<object>` - Plugin content
- `<embed>` - Embedded content
- `<form>` - Form submission
- `<input>` - User input
- `<button>` - Interactive elements
- `<link>` - External resources
- `<style>` - Inline styles
- `<meta>` - Metadata manipulation
- `<base>` - Base URL manipulation

### Blocked Attributes

All event handlers and dangerous attributes are stripped:
- `onclick`, `onmouseover`, `onerror`, `onload` (all `on*` attributes)
- `style` (inline styles that could contain `javascript:`)
- `formaction`, `action` (form submission)
- Any attributes not explicitly allowed

### Custom Syntax

The sanitization does not affect custom markdown comment syntax:
```markdown
<!-- skill:Fire Slash -->
<!-- equipment:Legendary Sword -->
```

These are processed before HTML rendering and converted to React components, bypassing HTML parsing entirely.

## Implementation Details

### Sanitization Pipeline

1. **Content Processing** - Custom syntax (`<!-- skill:X -->`) is processed first
2. **Markdown Parsing** - `remark-gfm` parses markdown to HTML
3. **HTML Parsing** - `rehype-raw` allows raw HTML in markdown
4. **Sanitization** - `rehype-sanitize` filters dangerous HTML ⚠️ **CRITICAL**
5. **Syntax Highlighting** - `rehype-highlight` adds code syntax highlighting
6. **Anchor Links** - `rehype-slug` and `rehype-autolink-headings` add navigation

**Order matters**: Sanitization must come after `rehype-raw` to properly sanitize the parsed HTML.

### Configuration Location

**File**: `wiki-framework/src/components/wiki/PageViewer.jsx`

```javascript
const sanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    span: [...(defaultSchema.attributes.span || []), 'className', ['className', /^text-/]],
    img: ['src', 'alt', 'title', 'width', 'height'],
    div: [...(defaultSchema.attributes.div || []), 'align', ['align', /^(left|center|right)$/]],
    // ... headings with id
  },
  protocols: {
    ...defaultSchema.protocols,
    src: ['http', 'https', '/'],
    href: ['http', 'https', 'mailto', '/', '#'],
  },
};
```

## Testing

### Safe Examples

These should render correctly:
```markdown
<!-- Safe colored text -->
<span class="text-red-500">Red text</span>

<!-- Safe image -->
<img src="/images/logo.png" alt="Logo" />

<!-- Safe alignment -->
<div align="center">Centered content</div>
```

### Blocked Examples

These will be stripped/sanitized:
```markdown
<!-- Script injection - BLOCKED -->
<script>alert('XSS')</script>

<!-- Event handler - BLOCKED -->
<img src="x" onerror="alert('XSS')" />

<!-- JavaScript URL - BLOCKED -->
<a href="javascript:alert('XSS')">Click</a>

<!-- Iframe injection - BLOCKED -->
<iframe src="https://evil.com"></iframe>

<!-- Dangerous class - BLOCKED -->
<span class="malicious-class">Text</span>
```

## Best Practices

### For Content Editors

1. **Use markdown syntax when possible** - Safer than raw HTML
2. **Use toolbar features** - Color picker, image inserter are pre-sanitized
3. **Test in preview** - Verify your content renders correctly
4. **Report issues** - If legitimate content is being blocked, report it

### For Developers

1. **Never bypass sanitization** - Don't use `dangerouslySetInnerHTML`
2. **Extend carefully** - When adding allowed elements, consider security implications
3. **Review PRs** - Check for changes to `sanitizeSchema`
4. **Keep dependencies updated** - `rehype-sanitize` may have security patches
5. **Audit regularly** - Review allowed elements and attributes periodically

## Security Updates

**Last reviewed**: 2025-12-15
**Version**: 1.0.0
**Maintainer**: Claude Code Team

### Update Process

When updating allowed HTML:
1. Review the security implications
2. Add the element/attribute to `sanitizeSchema`
3. Test with malicious payloads
4. Document the change here
5. Update tests

### Reporting Vulnerabilities

If you discover a security vulnerability:
1. **Do not** create a public issue
2. Report via private channel to repository maintainers
3. Include proof of concept (sanitized)
4. Allow time for patch before disclosure

## References

- [rehype-sanitize documentation](https://github.com/rehypejs/rehype-sanitize)
- [OWASP XSS Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html)
- [Content Security Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP)
