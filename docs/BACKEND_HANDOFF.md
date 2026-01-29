# Backend Handoff: SEO Data Export API

## Overview

The SiteFix Planner application scans websites and extracts page content for SEO analysis. This document describes how to receive the exported data on your backend.

---

## Webhook Endpoint Requirements

Your backend needs a POST endpoint that accepts JSON payloads. The payload structure is documented below.

### Endpoint Specification

```
POST /your-endpoint-path
Content-Type: application/json
Authorization: Bearer <api-key>  (optional)
X-API-Key: <api-key>  (optional)
```

### Expected Response

Return HTTP 200-299 with optional JSON body:

```json
{
  "success": true,
  "message": "Data received",
  "recordsCreated": 15
}
```

---

## Payload Structure

```typescript
interface ExportPayload {
  exportedAt: string;        // ISO timestamp
  source: "sitefix-planner"; // Always this value
  
  project: {
    id: string;              // UUID
    name: string;            // Project name
    rootUrl: string;         // Base website URL
  };
  
  summary: {
    totalPages: number;      // Total pages scanned
    totalWords: number;      // Sum of all word counts
    pagesByRole: {
      money: number;         // Revenue-generating pages
      trust: number;         // About, contact, legal pages
      support: number;       // Blog, FAQ, resources
    };
  };
  
  pages: PageData[];         // Array of page objects
  context?: UserContext;     // Optional business context
  beads?: Bead[];            // Optional focus areas
}

interface PageData {
  id?: string;               // UUID (if exists in DB)
  url: string;               // Full page URL
  path: string;              // URL path only (e.g., "/services/")
  title: string;             // Page <title>
  h1: string;                // First H1 heading
  metaDescription: string;   // Meta description
  wordCount: number;         // Total word count
  role: "money" | "trust" | "support";  // Page classification
  priorityRank: number;      // 1 = highest priority
  cleanedText: string;       // Full page content (markdown)
  crawledAt: string;         // ISO timestamp when scraped
}

interface UserContext {
  businessName: string;
  location: string;
  services: string[];
  targetAudience: string;
  competitorUrls: string[];
  goals: string;
}

interface Bead {
  id: string;
  name: string;
  description: string;
  pageIds: string[];         // Pages associated with this focus area
}
```

---

## Example Payload

```json
{
  "exportedAt": "2025-01-27T14:30:00.000Z",
  "source": "sitefix-planner",
  "project": {
    "id": "9c45156a-1506-42e4-a1e2-a9aabd449ea7",
    "name": "New Age Fotografie",
    "rootUrl": "https://www.newagefotografie.com/"
  },
  "summary": {
    "totalPages": 12,
    "totalWords": 8540,
    "pagesByRole": {
      "money": 8,
      "trust": 3,
      "support": 1
    }
  },
  "pages": [
    {
      "url": "https://www.newagefotografie.com/",
      "path": "/",
      "title": "Fotograf in Wien für Familie, Baby & Business",
      "h1": "Willkommen bei New Age Fotografie",
      "metaDescription": "Professionelle Fotografie in Wien...",
      "wordCount": 631,
      "role": "money",
      "priorityRank": 1,
      "cleanedText": "# Willkommen bei New Age Fotografie\n\nWir sind...",
      "crawledAt": "2025-01-27T14:25:00.000Z"
    },
    {
      "url": "https://www.newagefotografie.com/ueber-uns/",
      "path": "/ueber-uns/",
      "title": "Über uns - Fotografen in Wien",
      "h1": "Über uns",
      "metaDescription": "Lernen Sie unser Team kennen...",
      "wordCount": 718,
      "role": "trust",
      "priorityRank": 3,
      "cleanedText": "# Über uns\n\nUnser Team besteht aus...",
      "crawledAt": "2025-01-27T14:26:00.000Z"
    }
  ],
  "context": {
    "businessName": "New Age Fotografie",
    "location": "Vienna, Austria",
    "services": ["Family Photography", "Baby Photography", "Business Headshots"],
    "targetAudience": "Families and businesses in Vienna",
    "competitorUrls": [],
    "goals": "Increase bookings for family shoots"
  },
  "beads": []
}
```

---

## Page Roles Explained

| Role | Description | Examples |
|------|-------------|----------|
| `money` | Revenue-generating pages | Homepage, service pages, pricing, booking |
| `trust` | Build credibility | About us, team, contact, testimonials, legal |
| `support` | Informational content | Blog posts, FAQ, guides, resources |

---

## Backend Implementation Example (Node.js/Express)

```javascript
const express = require('express');
const app = express();

app.use(express.json({ limit: '50mb' })); // Pages can be large

app.post('/api/seo-import', async (req, res) => {
  const apiKey = req.headers['x-api-key'] || 
                 req.headers['authorization']?.replace('Bearer ', '');
  
  // Validate API key
  if (apiKey !== process.env.IMPORT_API_KEY) {
    return res.status(401).json({ error: 'Invalid API key' });
  }
  
  const { project, pages, summary } = req.body;
  
  try {
    // Store in your database
    for (const page of pages) {
      await db.pages.upsert({
        where: { url: page.url },
        create: {
          projectId: project.id,
          url: page.url,
          path: page.path,
          title: page.title,
          content: page.cleanedText,
          wordCount: page.wordCount,
          role: page.role,
          priority: page.priorityRank,
        },
        update: {
          title: page.title,
          content: page.cleanedText,
          wordCount: page.wordCount,
          role: page.role,
          priority: page.priorityRank,
        }
      });
    }
    
    res.json({
      success: true,
      message: `Imported ${pages.length} pages`,
      recordsCreated: pages.length
    });
    
  } catch (error) {
    console.error('Import error:', error);
    res.status(500).json({ error: 'Failed to import data' });
  }
});

app.listen(3000);
```

---

## How to Trigger Export

### Option 1: From the Frontend App

POST to `/api/projects/{projectId}/export`:

```javascript
const response = await fetch(`/api/projects/${projectId}/export`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    webhookUrl: 'https://your-backend.com/api/seo-import',
    apiKey: 'your-secret-key'
  })
});
```

### Option 2: Direct GET (for pulling data)

GET from `/api/projects/{projectId}/export`:

```javascript
const data = await fetch(`/api/projects/${projectId}/export`)
  .then(r => r.json());

// Then POST to your backend
await fetch('https://your-backend.com/api/seo-import', {
  method: 'POST',
  headers: { 
    'Content-Type': 'application/json',
    'X-API-Key': 'your-key'
  },
  body: JSON.stringify(data)
});
```

### Option 3: Standalone Script

Run the test script:

```bash
node test-full-scan.mjs
```

Modify the `exportToBackend()` call at the bottom with your webhook URL.

---

## Security Recommendations

1. **API Key**: Always require an API key for the import endpoint
2. **Rate Limiting**: Implement rate limiting (e.g., max 10 imports/hour)
3. **Payload Validation**: Validate the payload structure before processing
4. **Size Limits**: Set appropriate body size limits (50MB should be plenty)
5. **IP Whitelist**: Optionally whitelist the SiteFix Planner server IPs

---

## Questions?

Contact the frontend team for integration support.
