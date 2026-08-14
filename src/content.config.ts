import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import siteConfig from './data/site-config.json';

const categoryKeys = siteConfig.categories.map(c => c.key) as [string, ...string[]];

const blog = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/blog' }),
  schema: ({ image }) =>
    z.object({
      title: z.string().max(120),
      date: z.date(),
      category: z.enum(categoryKeys),
      tags: z.array(z.string()).default([]),
      summary: z.string().max(300),
      coverImage: image().optional(),
      draft: z.boolean().default(false),
    }),
});

export const collections = { blog };
