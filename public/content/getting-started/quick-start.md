---
title: Quick Start Guide
description: Create your first wiki page in 5 minutes
tags: [quick-start, tutorial, beginner]
category: Getting Started
author: Wiki Team
date: 2025-12-12
---

# Quick Start Guide

Get your wiki up and running in just 5 minutes! This guide will show you how to create your first page.

## Step 1: Create a Markdown File

Navigate to the `public/content/` directory and create a new markdown file in any section:

```bash
public/content/getting-started/my-first-page.md
```

## Step 2: Add Frontmatter

Every wiki page starts with YAML frontmatter containing metadata:

```markdown
---
title: My First Page
description: This is my first wiki page
tags: [example, tutorial]
category: Documentation
date: 2025-12-12
---
```

## Step 3: Write Content

After the frontmatter, write your content in markdown:

```markdown
# My First Page

Welcome to my first wiki page! Here's what you can do:

## Features

- Write in **markdown**
- Add code blocks
- Include images
- Create tables

## Code Example

\`\`\`javascript
function hello() {
  console.log("Hello, Wiki!");
}
\`\`\`

## Lists

1. First item
2. Second item
3. Third item

- Bullet point
- Another point
- Last point
```

## Step 4: View Your Page

Start the development server if it's not already running:

```bash
npm run dev
```

Navigate to your new page at:
```
http://localhost:5173/#/getting-started/my-first-page
```

## Step 5: Customize

### Add Images

Place images in `public/content/images/` and reference them:

```markdown
![Alt text](/content/images/my-image.png)
```

### Add Links

Link to other pages in your wiki:

```markdown
[See Installation](installation)
[Go to Guides](../guides/index)
```

### Use Syntax Highlighting

Code blocks support syntax highlighting for many languages:

```python
def greet(name):
    """Greet someone by name"""
    print(f"Hello, {name}!")

greet("World")
```

### Create Tables

Markdown tables are fully supported:

| Feature | Status | Notes |
|---------|--------|-------|
| Search | ✅ Planned | Phase 2 |
| Edit Pages | ✅ Planned | Phase 4 |
| Dark Mode | ✅ Done | Working now! |

## Tips and Tricks

### Keyboard Shortcuts

- `Ctrl+K` - Open search (coming in Phase 2)
- Click theme icon - Toggle dark mode

### Markdown Tips

- Use `#` for headings (# is h1, ## is h2, etc.)
- Wrap code in single backticks for `inline code`
- Use triple backticks for code blocks
- Add language after triple backticks for syntax highlighting

### Best Practices

1. **Use descriptive titles** - Make frontmatter titles clear and specific
2. **Add tags** - Help users find related content
3. **Include descriptions** - Show up in search results
4. **Break up content** - Use headings to organize long pages
5. **Add examples** - Code examples help users understand

## What's Next?

Now that you've created your first page, explore:

- [Creating Pages](../guides/creating-pages) - Advanced page creation
- [Markdown Syntax](../reference/markdown-syntax) - Full markdown reference
- [Configuration](../reference/configuration) - Customize your wiki

## Example Page Template

Here's a complete example you can copy:

```markdown
---
title: Your Page Title
description: A brief description of this page
tags: [tag1, tag2, tag3]
category: Your Category
author: Your Name
date: 2025-12-12
---

# Your Page Title

Introduction paragraph explaining what this page covers.

## Section 1

Content for section 1.

### Subsection

More detailed content.

## Section 2

Content for section 2 with a code example:

\`\`\`javascript
// Your code here
const example = "Hello!";
\`\`\`

## Conclusion

Summary and next steps.
```

---

*Ready to create more pages? Check out the [Guides](../guides/index) section!*
