import { useState, useEffect } from 'react';
import GithubSlugger from 'github-slugger';

/**
 * Extract headings from markdown content to generate table of contents
 */
export const extractHeadings = (content) => {
  if (!content) return [];

  const headingRegex = /^(#{1,6})\s+(.+)$/gm;
  const headings = [];
  const slugger = new GithubSlugger();
  let match;

  while ((match = headingRegex.exec(content)) !== null) {
    const level = match[1].length;
    const text = match[2].trim();

    // Generate slug using github-slugger (same as rehype-slug does)
    const slug = slugger.slug(text);

    headings.push({
      level,
      text,
      slug,
    });
  }

  return headings;
};

/**
 * Hook to manage table of contents with active section tracking
 */
export const useTableOfContents = (content) => {
  const [headings, setHeadings] = useState([]);
  const [activeId, setActiveId] = useState('');

  useEffect(() => {
    const extractedHeadings = extractHeadings(content);
    setHeadings(extractedHeadings);
  }, [content]);

  useEffect(() => {
    if (headings.length === 0) return;

    // Track which heading is currently in view
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        });
      },
      {
        rootMargin: '-80px 0px -80% 0px',
        threshold: 0.5,
      }
    );

    // Observe all heading elements
    const headingElements = headings.map((heading) =>
      document.getElementById(heading.slug)
    );

    headingElements.forEach((el) => {
      if (el) observer.observe(el);
    });

    return () => {
      headingElements.forEach((el) => {
        if (el) observer.unobserve(el);
      });
    };
  }, [headings]);

  return { headings, activeId };
};
