// ============================================================================
// AEO RESEARCHER
// ============================================================================
// Answer Engine Optimization research using Serper + Tavily
// Builds structured research packs for content generation
// ============================================================================

import {
  serperSearch,
  serperBatchSearch,
  tavilySearch,
  tavilyFindAuthoritativeSources,
  type NormalizedSerperResult,
  type NormalizedTavilyResult,
} from '../clients';
import {
  getResearchConfig,
  getCachePath,
  isCacheValid,
  readCache,
  writeCache,
  generateCacheKey,
  ensureCacheDir,
} from '../config';
import type {
  ResearchRequest,
  AeoPack,
  PaaQuestion,
  QuestionCluster,
  AnswerShape,
  CitationTarget,
  Misconception,
  ResearchSource,
} from '../types';

// ============================================================================
// QUESTION TEMPLATES
// ============================================================================

const QUESTION_TEMPLATES = {
  how: [
    'how does {service} work',
    'how to choose {service}',
    'how much does {service} cost',
    'how long does {service} take',
    'how to prepare for {service}',
  ],
  cost: [
    '{service} cost',
    '{service} price',
    '{service} fees',
    'how much for {service}',
    '{service} pricing guide',
  ],
  best: [
    'best {service}',
    'best {service} near me',
    'best {service} {geo}',
    'top {service}',
    'recommended {service}',
  ],
  'near-me': [
    '{service} near me',
    '{service} {geo}',
    '{service} in {geo}',
    'local {service}',
    '{service} {geo} reviews',
  ],
  steps: [
    '{service} process',
    '{service} step by step',
    'what to expect from {service}',
    '{service} stages',
    'preparing for {service}',
  ],
  mistakes: [
    '{service} mistakes to avoid',
    'common {service} problems',
    '{service} what not to do',
    '{service} pitfalls',
    'wrong {service} choices',
  ],
  comparison: [
    '{service} vs',
    '{service} comparison',
    'types of {service}',
    '{service} alternatives',
    '{service} options',
  ],
  what: [
    'what is {service}',
    'what does {service} include',
    'what to look for in {service}',
    'what affects {service}',
  ],
  when: [
    'when to use {service}',
    'best time for {service}',
    'when do you need {service}',
  ],
  why: [
    'why use {service}',
    'why is {service} important',
    'benefits of {service}',
    'advantages of {service}',
  ],
};

// ============================================================================
// ANSWER SHAPE TEMPLATES
// ============================================================================

const ANSWER_SHAPE_TEMPLATES: Record<QuestionCluster['type'], AnswerShape> = {
  how: {
    clusterType: 'how',
    requirements: [
      'Start with a clear direct answer',
      'Break down into numbered steps if applicable',
      'Include timeframes where relevant',
      'Mention what the customer needs to do vs provider',
      'End with next action or outcome',
    ],
    openingHook: 'In practice, the process typically involves...',
    wordCountRange: { min: 80, max: 120 },
  },
  cost: {
    clusterType: 'cost',
    requirements: [
      'Give a realistic range, not a single number',
      'Explain factors that affect price',
      'Avoid specific figures unless sourced',
      'Mention what\'s typically included/excluded',
      'Reference value, not just price',
    ],
    openingHook: 'What usually changes the price is...',
    wordCountRange: { min: 80, max: 120 },
  },
  best: {
    clusterType: 'best',
    requirements: [
      'Define what "best" means for the context',
      'List criteria that matter',
      'Avoid claiming to be "the best"',
      'Focus on fit for customer needs',
      'Mention credentials or standards to look for',
    ],
    openingHook: 'What makes a provider stand out is...',
    wordCountRange: { min: 80, max: 120 },
  },
  'near-me': {
    clusterType: 'near-me',
    requirements: [
      'Reference the specific location',
      'Mention local factors that matter',
      'Include accessibility/convenience points',
      'Avoid generic national advice',
      'Ground in local context',
    ],
    openingHook: 'For those in the local area...',
    wordCountRange: { min: 80, max: 120 },
  },
  steps: {
    clusterType: 'steps',
    requirements: [
      'Clear numbered sequence',
      'Practical, actionable steps',
      'Include what happens at each stage',
      'Mention typical timeframes',
      'Note any preparation needed',
    ],
    openingHook: 'The typical journey looks like this...',
    wordCountRange: { min: 100, max: 150 },
  },
  mistakes: {
    clusterType: 'mistakes',
    requirements: [
      'List concrete mistakes, not vague warnings',
      'Explain why each is a mistake',
      'Provide the better alternative',
      'Draw from real experience patterns',
      'Be helpful, not fear-mongering',
    ],
    openingHook: 'A common mistake we see is...',
    wordCountRange: { min: 80, max: 120 },
  },
  comparison: {
    clusterType: 'comparison',
    requirements: [
      'Fair, balanced comparison',
      'Clear criteria for comparison',
      'Explain trade-offs',
      'Help reader decide what\'s right for them',
      'Avoid biased recommendations',
    ],
    openingHook: 'The main difference comes down to...',
    wordCountRange: { min: 80, max: 120 },
  },
  what: {
    clusterType: 'what',
    requirements: [
      'Clear definition first',
      'Explain in plain language',
      'Cover what\'s included',
      'Mention variations if relevant',
    ],
    openingHook: 'In simple terms...',
    wordCountRange: { min: 80, max: 120 },
  },
  when: {
    clusterType: 'when',
    requirements: [
      'Identify trigger situations',
      'Give timing guidance',
      'Mention warning signs',
      'Include preventive context if relevant',
    ],
    openingHook: 'The right time is typically when...',
    wordCountRange: { min: 80, max: 120 },
  },
  why: {
    clusterType: 'why',
    requirements: [
      'Lead with the main benefit',
      'Back up with supporting benefits',
      'Avoid hype or exaggeration',
      'Connect to customer outcomes',
    ],
    openingHook: 'The key benefit is...',
    wordCountRange: { min: 80, max: 120 },
  },
};

// ============================================================================
// SNIPPET HOOKS
// ============================================================================

const SNIPPET_HOOKS = [
  'In practice...',
  'What usually changes the price is...',
  'A common mistake we see is...',
  'From experience, the key factor is...',
  'The typical journey looks like this...',
  'What most people don\'t realise is...',
  'The main difference comes down to...',
  'For those in the local area...',
  'What we\'ve found works best is...',
  'The honest answer is...',
];

// ============================================================================
// MAIN AEO RESEARCHER
// ============================================================================

export interface AeoResearcherOptions {
  /** Skip cache and force fresh research */
  forceRefresh?: boolean;
  /** Number of Serper queries to run */
  serperQueryCount?: number;
  /** Number of Tavily queries to run */
  tavilyQueryCount?: number;
}

export async function runAeoResearcher(
  request: ResearchRequest,
  options: AeoResearcherOptions = {}
): Promise<{ aeo: AeoPack; sources: ResearchSource[] }> {
  const config = getResearchConfig();
  const {
    forceRefresh = false,
    serperQueryCount = 5,
    tavilyQueryCount = 3,
  } = options;

  // Generate cache key
  const cacheKey = `aeo_${generateCacheKey(request)}`;
  const cachePath = getCachePath(config, cacheKey);

  // Check cache
  if (config.cacheEnabled && !forceRefresh && isCacheValid(cachePath, config.cacheTtlHours)) {
    console.log(`[AEO] Loading from cache: ${cacheKey}`);
    const cached = readCache<{ aeo: AeoPack; sources: ResearchSource[] }>(cachePath);
    if (cached) {
      return cached;
    }
  }

  console.log(`[AEO] Running research for: ${request.focusKeyword}`);
  ensureCacheDir(config);

  const sources: ResearchSource[] = [];

  // Step 1: Generate target queries
  const targetQueries = generateTargetQueries(request);
  console.log(`[AEO] Generated ${targetQueries.length} target queries`);

  // Step 2: Run Serper searches
  const serperQueries = targetQueries.slice(0, serperQueryCount);
  const serperResults = await serperBatchSearch(serperQueries);
  
  // Collect sources from Serper
  for (const result of serperResults) {
    for (const org of result.organic) {
      sources.push({
        url: org.link,
        title: org.title,
        snippet: org.snippet,
        type: 'serp',
        fetchedAt: new Date().toISOString(),
      });
    }
    for (const paa of result.paa) {
      if (paa.sourceUrl) {
        sources.push({
          url: paa.sourceUrl,
          title: paa.question,
          snippet: paa.snippet || '',
          type: 'paa',
          fetchedAt: new Date().toISOString(),
        });
      }
    }
  }

  // Step 3: Run Tavily for authoritative sources
  const tavilyQueries = [
    `${request.service} guide official`,
    `${request.service} regulations UK`,
    request.focusKeyword,
  ].slice(0, tavilyQueryCount);

  const tavilyResults: NormalizedTavilyResult[] = [];
  for (const query of tavilyQueries) {
    try {
      const result = await tavilySearch(query, { maxResults: 5 });
      tavilyResults.push(result);
    } catch (error) {
      console.warn(`[AEO] Tavily query failed: ${query}`);
    }
  }

  // Collect sources from Tavily
  for (const result of tavilyResults) {
    for (const item of result.results) {
      sources.push({
        url: item.url,
        title: item.title,
        snippet: item.contentSnippet,
        type: 'tavily',
        fetchedAt: new Date().toISOString(),
      });
    }
  }

  // Step 4: Build the AEO Pack
  const aeo = buildAeoPack(request, serperResults, tavilyResults, targetQueries);

  const result = { aeo, sources };

  // Save to cache
  if (config.cacheEnabled) {
    writeCache(cachePath, result);
    console.log(`[AEO] Saved to cache: ${cacheKey}`);
  }

  return result;
}

// ============================================================================
// QUERY GENERATION
// ============================================================================

function generateTargetQueries(request: ResearchRequest): string[] {
  const { service, focusKeyword, geoPrimary, intent } = request;
  const queries: string[] = [];
  
  // Add focus keyword first
  queries.push(focusKeyword);
  
  // Determine which template groups to prioritize based on intent
  const priorityGroups = getPriorityGroups(intent);
  
  for (const group of priorityGroups) {
    const templates = QUESTION_TEMPLATES[group] || [];
    for (const template of templates.slice(0, 2)) {
      const query = template
        .replace('{service}', service.toLowerCase())
        .replace('{geo}', geoPrimary || '');
      if (query.trim() && !queries.includes(query.trim())) {
        queries.push(query.trim());
      }
    }
  }

  // Add geo-specific queries if location provided
  if (geoPrimary) {
    queries.push(`${service} ${geoPrimary}`);
    queries.push(`${service} in ${geoPrimary}`);
    queries.push(`best ${service} ${geoPrimary}`);
  }

  // Limit to 12 queries
  return queries.slice(0, 12);
}

function getPriorityGroups(intent: ResearchRequest['intent']): QuestionCluster['type'][] {
  switch (intent) {
    case 'MONEY':
      return ['cost', 'best', 'comparison', 'how', 'mistakes', 'what'];
    case 'SERVICE':
      return ['how', 'steps', 'what', 'cost', 'near-me', 'mistakes'];
    case 'INFORMATIONAL':
      return ['what', 'how', 'why', 'when', 'steps', 'comparison'];
    case 'TRUST':
      return ['best', 'comparison', 'mistakes', 'what', 'why', 'how'];
    default:
      return ['how', 'what', 'cost', 'best', 'steps', 'mistakes'];
  }
}

// ============================================================================
// AEO PACK BUILDER
// ============================================================================

function buildAeoPack(
  request: ResearchRequest,
  serperResults: NormalizedSerperResult[],
  tavilyResults: NormalizedTavilyResult[],
  targetQueries: string[]
): AeoPack {
  // Extract all PAA questions
  const paaQuestions: PaaQuestion[] = [];
  for (const result of serperResults) {
    for (const paa of result.paa) {
      if (!paaQuestions.find(p => p.question === paa.question)) {
        paaQuestions.push({
          question: paa.question,
          snippet: paa.snippet,
          sourceUrl: paa.sourceUrl,
        });
      }
    }
  }

  // Extract related searches
  const relatedSearches: string[] = [];
  for (const result of serperResults) {
    for (const related of result.relatedSearches) {
      if (!relatedSearches.includes(related)) {
        relatedSearches.push(related);
      }
    }
  }

  // Build question clusters
  const questionClusters = buildQuestionClusters(paaQuestions, relatedSearches, request);

  // Build answer shapes for each cluster
  const answerShapes = questionClusters.map(cluster => ({
    ...ANSWER_SHAPE_TEMPLATES[cluster.type],
    clusterType: cluster.type,
  }));

  // Build citation targets from Tavily results
  const citationTargets = buildCitationTargets(tavilyResults, serperResults);

  // Build misconceptions (from PAA patterns)
  const misconceptions = extractMisconceptions(paaQuestions, request);

  return {
    targetQueries,
    peopleAlsoAsk: paaQuestions,
    questionClusters,
    answerShapes,
    citationTargets,
    misconceptions,
    snippetHooks: SNIPPET_HOOKS,
    relatedSearches,
    generatedAt: new Date().toISOString(),
  };
}

function buildQuestionClusters(
  paaQuestions: PaaQuestion[],
  relatedSearches: string[],
  request: ResearchRequest
): QuestionCluster[] {
  const clusters: Map<QuestionCluster['type'], string[]> = new Map();
  
  // Initialize all cluster types
  const clusterTypes: QuestionCluster['type'][] = [
    'how', 'cost', 'best', 'near-me', 'steps', 'mistakes', 'comparison', 'what', 'when', 'why'
  ];
  for (const type of clusterTypes) {
    clusters.set(type, []);
  }

  // Classify PAA questions
  for (const paa of paaQuestions) {
    const q = paa.question.toLowerCase();
    const type = classifyQuestion(q);
    clusters.get(type)?.push(paa.question);
  }

  // Classify related searches
  for (const search of relatedSearches) {
    const q = search.toLowerCase();
    const type = classifyQuestion(q);
    clusters.get(type)?.push(search);
  }

  // Build cluster objects with priority
  const priorityGroups = getPriorityGroups(request.intent);
  
  return clusterTypes
    .map((type, index) => ({
      type,
      questions: Array.from(clusters.get(type) || []).slice(0, 5),
      priority: priorityGroups.includes(type) 
        ? 100 - priorityGroups.indexOf(type) * 10 
        : 50 - index,
    }))
    .filter(cluster => cluster.questions.length > 0)
    .sort((a, b) => b.priority - a.priority);
}

function classifyQuestion(question: string): QuestionCluster['type'] {
  const q = question.toLowerCase();
  
  if (q.includes('how much') || q.includes('cost') || q.includes('price') || q.includes('fee')) {
    return 'cost';
  }
  if (q.includes('how to') || q.includes('how do') || q.includes('how does')) {
    return 'how';
  }
  if (q.includes('best') || q.includes('top') || q.includes('recommended')) {
    return 'best';
  }
  if (q.includes('near me') || q.includes('near') || q.includes('local')) {
    return 'near-me';
  }
  if (q.includes('step') || q.includes('process') || q.includes('stage')) {
    return 'steps';
  }
  if (q.includes('mistake') || q.includes('avoid') || q.includes('wrong') || q.includes('problem')) {
    return 'mistakes';
  }
  if (q.includes('vs') || q.includes('versus') || q.includes('compare') || q.includes('difference')) {
    return 'comparison';
  }
  if (q.startsWith('what')) {
    return 'what';
  }
  if (q.startsWith('when')) {
    return 'when';
  }
  if (q.startsWith('why')) {
    return 'why';
  }
  
  return 'how'; // default
}

function buildCitationTargets(
  tavilyResults: NormalizedTavilyResult[],
  serperResults: NormalizedSerperResult[]
): CitationTarget[] {
  const targets: CitationTarget[] = [];
  const seenUrls = new Set<string>();

  // Add Tavily results (higher credibility)
  for (const result of tavilyResults) {
    for (const item of result.results) {
      if (seenUrls.has(item.url)) continue;
      seenUrls.add(item.url);

      const type = categorizeSource(item.url);
      const credibilityScore = calculateCredibilityScore(item.url, item.score);

      if (credibilityScore >= 50) {
        targets.push({
          url: item.url,
          title: item.title,
          snippet: item.contentSnippet.slice(0, 200),
          type,
          credibilityScore,
        });
      }
    }
  }

  // Add high-ranking Serper results
  for (const result of serperResults) {
    for (const item of result.organic.slice(0, 3)) {
      if (seenUrls.has(item.link)) continue;
      seenUrls.add(item.link);

      const type = categorizeSource(item.link);
      const credibilityScore = calculateCredibilityScore(item.link, 0.5);

      if (credibilityScore >= 60) {
        targets.push({
          url: item.link,
          title: item.title,
          snippet: item.snippet.slice(0, 200),
          type,
          credibilityScore,
        });
      }
    }
  }

  return targets
    .sort((a, b) => b.credibilityScore - a.credibilityScore)
    .slice(0, 10);
}

function categorizeSource(url: string): CitationTarget['type'] {
  const domain = url.toLowerCase();
  
  if (domain.includes('.gov') || domain.includes('gov.uk')) {
    return 'official';
  }
  if (domain.includes('.org') || domain.includes('.ac.uk') || domain.includes('.edu')) {
    return 'industry';
  }
  if (domain.includes('bbc.') || domain.includes('guardian') || domain.includes('telegraph')) {
    return 'news';
  }
  if (domain.includes('local') || domain.includes('council')) {
    return 'local';
  }
  return 'guide';
}

function calculateCredibilityScore(url: string, tavilyScore: number): number {
  let score = tavilyScore * 100;
  
  // Boost for authoritative domains
  if (url.includes('.gov')) score += 30;
  if (url.includes('.org')) score += 20;
  if (url.includes('.ac.uk') || url.includes('.edu')) score += 25;
  if (url.includes('bbc.co.uk')) score += 20;
  if (url.includes('which.co.uk')) score += 15;
  
  // Penalize low-quality signals
  if (url.includes('forum') || url.includes('reddit')) score -= 20;
  if (url.includes('blog')) score -= 10;
  
  return Math.min(100, Math.max(0, score));
}

function extractMisconceptions(
  paaQuestions: PaaQuestion[],
  request: ResearchRequest
): Misconception[] {
  const misconceptions: Misconception[] = [];
  
  // Look for questions that suggest misconceptions
  const misconceptionPatterns = [
    { pattern: /do i need|do you need/i, type: 'necessity' },
    { pattern: /is it worth|are they worth/i, type: 'value' },
    { pattern: /can i|can you/i, type: 'capability' },
    { pattern: /should i|should you/i, type: 'decision' },
    { pattern: /why (don't|doesn't|isn't|aren't)/i, type: 'why-not' },
  ];

  for (const paa of paaQuestions) {
    for (const { pattern, type } of misconceptionPatterns) {
      if (pattern.test(paa.question)) {
        misconceptions.push({
          misconception: `Many people ask: "${paa.question}"`,
          correction: `The answer depends on specific circumstances. ${paa.snippet || 'Consider consulting a professional.'}`,
          source: paa.sourceUrl,
        });
        break;
      }
    }
  }

  // Add generic misconceptions based on service type
  misconceptions.push({
    misconception: `All ${request.service.toLowerCase()} providers are the same`,
    correction: `Quality, experience, and approach can vary significantly. Look for credentials, reviews, and local expertise.`,
  });

  misconceptions.push({
    misconception: `The cheapest option is always the best value`,
    correction: `Price should be weighed against quality, reliability, and what's included. Sometimes paying more saves money long-term.`,
  });

  return misconceptions.slice(0, 10);
}

// ============================================================================
// EXPORTS
// ============================================================================

export { generateTargetQueries, buildQuestionClusters, classifyQuestion };
