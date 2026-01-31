// ============================================================================
// FIX BRIEF GENERATOR
// ============================================================================
// Generates detailed improvement briefs for page writers based on content scoring.
// Includes current content, specific actions, and a complete writer prompt.
// ============================================================================

import type { ContentScoreResult, FactorScore, Recommendation } from '../content-scorer';

export interface FixSection {
  category: keyof ContentScoreResult['factors'];
  categoryLabel: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  currentScore: number;
  targetScore: number;
  currentState: string;
  targetState: string;
  specificActions: string[];
  exampleFix?: string;
}

export interface FixBrief {
  pageUrl: string;
  pageTitle: string;
  currentScore: number;
  currentGrade: string;
  targetScore: number;
  priority: 'critical' | 'high' | 'medium' | 'low';
  estimatedFixTime: string;
  currentContent: string;
  fixSections: FixSection[];
  writerPrompt: string;
  targetMetrics: {
    overallScore: number;
    factorTargets: Record<string, number>;
  };
  successCriteria: string[];
  generatedAt: string;
}

// ============================================================================
// CATEGORY LABELS
// ============================================================================

const CATEGORY_LABELS: Record<keyof ContentScoreResult['factors'], string> = {
  readability: 'Readability',
  seoStructure: 'SEO Structure',
  keywordOptimization: 'Keyword Optimization',
  contentDepth: 'Content Depth',
  eeatSignals: 'E-E-A-T Signals',
};

// ============================================================================
// ACTION GENERATORS
// ============================================================================

function generateActionsForReadability(factor: FactorScore): string[] {
  const actions: string[] = [];
  
  for (const issue of factor.issues) {
    if (issue.includes('sentence')) {
      actions.push('Break long sentences into shorter ones (target: 15-20 words per sentence)');
      actions.push('Use periods instead of commas where possible');
    }
    if (issue.includes('paragraph')) {
      actions.push('Split long paragraphs into 2-4 sentence chunks');
      actions.push('Add white space between ideas');
    }
    if (issue.includes('passive')) {
      actions.push('Convert passive voice to active voice');
      actions.push('Example: "The service was provided by us" → "We provided the service"');
    }
    if (issue.includes('Flesch') || issue.includes('difficult')) {
      actions.push('Use simpler words where possible');
      actions.push('Avoid jargon unless necessary for your audience');
      actions.push('Add bullet points to break up dense information');
    }
  }
  
  return Array.from(new Set(actions)); // Remove duplicates
}

function generateActionsForSeoStructure(factor: FactorScore): string[] {
  const actions: string[] = [];
  
  for (const issue of factor.issues) {
    if (issue.includes('H1')) {
      actions.push('Add a clear H1 heading that includes your main keyword');
      actions.push('Ensure only ONE H1 per page');
    }
    if (issue.includes('title')) {
      actions.push('Write a compelling title tag (50-60 characters)');
      actions.push('Include your primary keyword near the beginning');
      actions.push('End with your brand name: "Topic | Brand Name"');
    }
    if (issue.includes('meta description')) {
      actions.push('Write a meta description (120-160 characters)');
      actions.push('Include a call-to-action and your keyword');
      actions.push('Make it compelling - this is your search snippet');
    }
    if (issue.includes('H2')) {
      actions.push('Add H2 subheadings every 200-300 words');
      actions.push('Make H2s descriptive and include secondary keywords');
    }
    if (issue.includes('hierarchy')) {
      actions.push('Fix heading hierarchy: H1 → H2 → H3 (don\'t skip levels)');
    }
  }
  
  return Array.from(new Set(actions));
}

function generateActionsForKeywords(factor: FactorScore): string[] {
  const actions: string[] = [];
  
  for (const issue of factor.issues) {
    if (issue.includes('title')) {
      actions.push('Add your focus keyword to the title tag');
    }
    if (issue.includes('H1')) {
      actions.push('Include the focus keyword naturally in your H1');
    }
    if (issue.includes('meta description')) {
      actions.push('Add the focus keyword to your meta description');
    }
    if (issue.includes('first paragraph')) {
      actions.push('Mention your focus keyword in the first 100 words');
    }
    if (issue.includes('density') && issue.includes('low')) {
      actions.push('Use the focus keyword more naturally throughout');
      actions.push('Add keyword variations and related terms');
    }
    if (issue.includes('density') && issue.includes('high')) {
      actions.push('Reduce keyword repetition - sounds unnatural');
      actions.push('Use synonyms and related phrases instead');
    }
  }
  
  return Array.from(new Set(actions));
}

function generateActionsForContentDepth(factor: FactorScore): string[] {
  const actions: string[] = [];
  
  for (const issue of factor.issues) {
    if (issue.includes('thin') || issue.includes('short')) {
      actions.push('Expand content to at least 800 words for ranking pages');
      actions.push('Add more detail, examples, and explanations');
      actions.push('Answer related questions your audience might have');
    }
    if (issue.includes('subheading')) {
      actions.push('Add more subheadings to break up content');
      actions.push('Each section should be 200-300 words under an H2');
    }
    if (issue.includes('bullet') || issue.includes('list')) {
      actions.push('Add bullet points for lists of items, benefits, or steps');
      actions.push('Use numbered lists for processes or rankings');
    }
  }
  
  return Array.from(new Set(actions));
}

function generateActionsForEeat(factor: FactorScore): string[] {
  const actions: string[] = [];
  
  for (const issue of factor.issues) {
    if (issue.includes('author') || issue.includes('expertise')) {
      actions.push('Add author bio or "About the Author" section');
      actions.push('Mention relevant qualifications or experience');
    }
    if (issue.includes('experience') || issue.includes('credentials')) {
      actions.push('Add specific experience: "With 10+ years in the industry..."');
      actions.push('Mention number of clients served or projects completed');
    }
    if (issue.includes('source') || issue.includes('reference')) {
      actions.push('Link to authoritative sources that back your claims');
      actions.push('Cite industry statistics or research');
    }
    if (issue.includes('testimonial') || issue.includes('review')) {
      actions.push('Add a customer testimonial or quote');
      actions.push('Mention your Google review rating if applicable');
    }
    if (issue.includes('certification') || issue.includes('trust')) {
      actions.push('Mention any certifications, licenses, or accreditations');
      actions.push('Add trust signals: "Insured", "Licensed", "Award-winning"');
    }
  }
  
  return Array.from(new Set(actions));
}

function generateActionsForCategory(
  category: keyof ContentScoreResult['factors'],
  factor: FactorScore
): string[] {
  switch (category) {
    case 'readability':
      return generateActionsForReadability(factor);
    case 'seoStructure':
      return generateActionsForSeoStructure(factor);
    case 'keywordOptimization':
      return generateActionsForKeywords(factor);
    case 'contentDepth':
      return generateActionsForContentDepth(factor);
    case 'eeatSignals':
      return generateActionsForEeat(factor);
    default:
      return factor.issues;
  }
}

// ============================================================================
// PRIORITY & TIME ESTIMATION
// ============================================================================

function getPriority(score: number): 'critical' | 'high' | 'medium' | 'low' {
  if (score < 40) return 'critical';
  if (score < 60) return 'high';
  if (score < 75) return 'medium';
  return 'low';
}

function estimateFixTime(score: number, contentLength: number): string {
  const baseTime = score < 40 ? 60 : score < 60 ? 45 : score < 75 ? 30 : 15;
  const lengthMultiplier = contentLength > 1500 ? 1.5 : contentLength > 800 ? 1.2 : 1;
  const totalMinutes = Math.round(baseTime * lengthMultiplier);
  
  if (totalMinutes >= 60) {
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours} hour${hours > 1 ? 's' : ''}`;
  }
  return `${totalMinutes}-${totalMinutes + 15} minutes`;
}

// ============================================================================
// WRITER PROMPT GENERATOR
// ============================================================================

function generateWriterPrompt(
  pageUrl: string,
  pageTitle: string,
  currentContent: string,
  fixSections: FixSection[],
  focusKeyword?: string
): string {
  const sections = fixSections
    .map((section, idx) => {
      const priorityEmoji = 
        section.priority === 'critical' ? '🔴' :
        section.priority === 'high' ? '🟠' :
        section.priority === 'medium' ? '🟡' : '🟢';
      
      return `### ${idx + 1}. ${section.categoryLabel.toUpperCase()} (${priorityEmoji} ${section.priority})
**Current Score:** ${section.currentScore}/100 → **Target:** ${section.targetScore}/100

**Current State:** ${section.currentState}
**Target State:** ${section.targetState}

**Actions Required:**
${section.specificActions.map(a => `- ${a}`).join('\n')}
${section.exampleFix ? `\n**Example Fix:** ${section.exampleFix}` : ''}`;
    })
    .join('\n\n');

  const contentPreview = currentContent.length > 3000 
    ? currentContent.substring(0, 3000) + '\n\n[... content truncated for brevity ...]'
    : currentContent;

  return `# Page Improvement Brief

You are improving a web page for SEO and user experience. Follow the instructions below to fix all identified issues.

---

## Page Information

**URL:** ${pageUrl}
**Title:** ${pageTitle}
${focusKeyword ? `**Focus Keyword:** ${focusKeyword}` : ''}

---

## Current Content

\`\`\`
${contentPreview}
\`\`\`

---

## Required Improvements

${sections}

---

## Success Criteria

When complete, the page should:
${fixSections.map(s => `- [ ] ${s.categoryLabel} score improves to ${s.targetScore}+`).join('\n')}
- [ ] All H2 sections are present and properly structured
- [ ] Content reads naturally and is easy to scan
- [ ] Focus keyword appears in title, H1, first paragraph, and meta description

---

## Important Notes

1. **Preserve the original voice** - improve, don't completely rewrite
2. **Keep factual claims accurate** - only add verifiable information
3. **Maintain brand consistency** - match the existing tone
4. **Don't keyword stuff** - keep it natural (1-2.5% density)

---

*Brief generated: ${new Date().toISOString()}*
`;
}

// ============================================================================
// MAIN GENERATOR
// ============================================================================

export function generateFixBrief(
  pageUrl: string,
  pageTitle: string,
  currentContent: string,
  contentScore: ContentScoreResult,
  focusKeyword?: string
): FixBrief {
  const fixSections: FixSection[] = [];
  const factorTargets: Record<string, number> = {};
  
  // Generate fix sections for each factor that needs improvement
  const factorEntries = Object.entries(contentScore.factors) as [keyof typeof contentScore.factors, FactorScore][];
  
  for (const [category, factor] of factorEntries) {
    if (factor.issues.length === 0) continue;
    
    const targetScore = Math.min(100, factor.score + 25); // Aim for 25-point improvement
    factorTargets[category] = targetScore;
    
    const actions = generateActionsForCategory(category, factor);
    
    fixSections.push({
      category,
      categoryLabel: CATEGORY_LABELS[category],
      priority: getPriority(factor.score),
      currentScore: factor.score,
      targetScore,
      currentState: factor.issues[0], // Primary issue as current state
      targetState: factor.passed[0] || `${CATEGORY_LABELS[category]} meets best practices`,
      specificActions: actions,
    });
  }
  
  // Sort by priority
  const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  fixSections.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
  
  // Calculate overall priority and target
  const overallPriority = fixSections.length > 0 ? fixSections[0].priority : 'low';
  const targetScore = Math.min(100, contentScore.score + 20);
  
  // Generate writer prompt
  const writerPrompt = generateWriterPrompt(
    pageUrl,
    pageTitle,
    currentContent,
    fixSections,
    focusKeyword
  );
  
  // Success criteria
  const successCriteria = [
    `Overall content score reaches ${targetScore}+`,
    ...fixSections.map(s => `${s.categoryLabel} score reaches ${s.targetScore}+`),
    'No critical issues remain',
    'Content reads naturally without keyword stuffing',
  ];
  
  return {
    pageUrl,
    pageTitle,
    currentScore: contentScore.score,
    currentGrade: contentScore.grade,
    targetScore,
    priority: overallPriority,
    estimatedFixTime: estimateFixTime(contentScore.score, currentContent.length),
    currentContent: currentContent.substring(0, 5000), // Limit for UI
    fixSections,
    writerPrompt,
    targetMetrics: {
      overallScore: targetScore,
      factorTargets,
    },
    successCriteria,
    generatedAt: new Date().toISOString(),
  };
}
