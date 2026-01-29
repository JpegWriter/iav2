// ============================================================================
// CONTEXT ADAPTER
// ============================================================================
// Converts the new UnifiedContextPack format to the legacy ContextPack format
// for backward compatibility with existing prompt builders.
// ============================================================================

import type {
  ContextPack,
  UnifiedContextPack,
  UnifiedMasterProfile,
  SelectedImage,
  WritingJob,
  ProofElementType,
  EEATSignalType,
} from '../types';

/**
 * Convert the new unified context pack format to the legacy ContextPack format
 * This allows existing prompt builders to work with the new system
 */
export function adaptUnifiedContextPack(
  unified: UnifiedContextPack
): ContextPack {
  const profile = unified.masterProfile;

  return {
    businessReality: {
      name: profile.business.name,
      services: profile.business.allServices,
      differentiators: profile.business.usps,
      beadsSummary: buildBeadsSummary(profile.proofAtoms),
      targetAudience: profile.audience.primary,
    },
    localSignals: {
      locations: profile.business.locations,
      serviceAreas: profile.localSignals?.serviceAreas || profile.business.locations,
      localPhrasing: buildLocalPhrasing(profile),
    },
    proofSummary: {
      reviewThemes: profile.reviews.themes.map((t) => t.theme),
      topQuotes: profile.reviews.topSnippets
        .filter((s) => s.hasConsent)
        .map((s) => s.text),
      caseStudyBullets: extractCaseStudyBullets(unified.proofRequirements.selectedProofAtoms),
      credentialsList: extractCredentials(unified.proofRequirements.selectedProofAtoms),
    },
    rewriteSummary: unified.rewriteContext
      ? {
          keepHeadings: [], // Will be extracted from original content
          keepFAQs: [],
          keyPointsToPreserve: unified.rewriteContext.preserveElements,
          elementsToRemove: unified.rewriteContext.removeElements,
        }
      : undefined,
    visionSummary: {
      heroCandidate: unified.visionContext?.heroImage
        ? adaptImagePlanToSelectedImage(unified.visionContext.heroImage)
        : undefined,
      inlineCandidates: (unified.visionContext?.inlineImages || []).map(
        adaptImagePlanToSelectedImage
      ),
      emotionalCues: unified.visionContext?.crossImageThemes || [],
    },
  };
}

function buildBeadsSummary(proofAtoms: UnifiedContextPack['proofRequirements']['selectedProofAtoms']): string {
  return proofAtoms
    .slice(0, 5)
    .map((atom) => `${atom.label}: ${atom.value}`)
    .join('; ');
}

function buildLocalPhrasing(profile: UnifiedMasterProfile): string[] {
  const phrases: string[] = [];
  
  // Add location-based phrases
  for (const location of profile.business.locations) {
    phrases.push(`${profile.business.primaryService} in ${location}`);
    phrases.push(`${location} ${profile.business.primaryService.toLowerCase()}`);
  }
  
  // Add service area phrases
  if (profile.localSignals?.serviceAreas) {
    for (const area of profile.localSignals.serviceAreas.slice(0, 3)) {
      phrases.push(`serving ${area}`);
    }
  }

  return phrases;
}

function extractCaseStudyBullets(proofAtoms: UnifiedContextPack['proofRequirements']['selectedProofAtoms']): string[] {
  return proofAtoms
    .filter((atom) => atom.type === 'proof' || atom.type === 'authority')
    .slice(0, 3)
    .map((atom) => atom.value);
}

function extractCredentials(proofAtoms: UnifiedContextPack['proofRequirements']['selectedProofAtoms']): string[] {
  return proofAtoms
    .filter((atom) => atom.type === 'authority')
    .map((atom) => `${atom.label}: ${atom.value}`);
}

function adaptImagePlanToSelectedImage(
  imagePlan: NonNullable<UnifiedContextPack['visionContext']>['heroImage']
): SelectedImage {
  if (!imagePlan) {
    throw new Error('Image plan is required');
  }
  
  return {
    imageId: imagePlan.imageId,
    url: imagePlan.imageUrl,
    vision: {
      subjects: [],
      expressions: [],
      scene: imagePlan.title || '',
      technicalScore: imagePlan.technicalScore,
      emotionalImpact: imagePlan.emotionalScore >= 70 ? 'high' : imagePlan.emotionalScore >= 40 ? 'medium' : 'low',
      composition: imagePlan.technicalScore >= 80 ? 'excellent' : imagePlan.technicalScore >= 60 ? 'good' : 'acceptable',
    },
    tags: [],
    suggestedAlt: imagePlan.alt,
    suggestedCaption: imagePlan.caption || '',
    intendedUse: imagePlan.placement === 'hero' ? 'hero' : 'inline',
  };
}

/**
 * Convert a unified context pack to a legacy WritingJob format
 * for backward compatibility with existing orchestrator
 */
export function adaptUnifiedToLegacyJob(
  unified: UnifiedContextPack,
  toneProfileId: string,
  publishingTargets: { wordpress: boolean; linkedin: boolean; gmb: boolean; reddit: boolean }
): WritingJob {
  const profile = unified.masterProfile;
  const brief = unified.writerBrief;

  return {
    jobId: unified.id,
    userId: '', // Not available in unified format
    projectId: unified.projectId,
    task: {
      slug: brief.slug,
      role: brief.role,
      primaryService: brief.primaryService,
      location: brief.location,
      intent: brief.intent,
      targetAudience: brief.targetAudience,
      requiredProofElements: unified.proofRequirements.requiredProofElements as ProofElementType[],
      requiredEEATSignals: unified.proofRequirements.requiredEEATSignals as EEATSignalType[],
      internalLinks: {
        upLinks: unified.internalLinking.upLinks.map((l) => ({
          targetUrl: l.url,
          targetTitle: l.title,
          anchorSuggestion: l.anchorSuggestion,
          required: l.required,
        })),
        downLinks: unified.internalLinking.downLinks.map((l) => ({
          targetUrl: l.url,
          targetTitle: l.title,
          anchorSuggestion: l.anchorSuggestion,
        })),
        requiredAnchors: unified.internalLinking.requiredAnchors,
      },
      mediaRequirements: {
        heroRequired: !!unified.visionContext?.heroImage,
        inlineImagesMin: 1,
        inlineImagesMax: unified.visionContext?.inlineImages?.length || 5,
      },
      wordpress: {
        maxBlocks: 60,
        maxHtmlBytes: 50000,
        excerptLength: 155,
        readingTimeTarget: Math.ceil(brief.estimatedWords / 200),
        maxH2Count: 10,
        maxTableRows: 8,
      },
    },
    userContext: {
      businessName: profile.business.name,
      website: profile.business.websiteUrl,
      locales: profile.business.locations,
      serviceAreas: profile.localSignals?.serviceAreas || profile.business.locations,
      services: profile.business.allServices,
      products: [],
      uspDifferentiators: profile.business.usps,
      beads: profile.proofAtoms.map((atom) => ({
        id: atom.id,
        type: atom.type,
        label: atom.label,
        value: atom.value,
        priority: atom.priority,
      })),
      brandToneProfile: {
        id: toneProfileId,
        name: toneProfileId,
        voice: {
          formality: 'neutral',
          confidence: 'confident',
          humourLevel: 'subtle',
          sentenceLengthBias: 'mixed',
        },
        tabooWords: profile.brandVoice.tabooWords,
        persuasionLevel: 'medium',
        ctaStyle: 'direct',
        readingLevel: 'standard',
      },
      complianceNotes: profile.brandVoice.complianceNotes,
    },
    siteContext: {
      sitemapSummary: {
        totalPages: profile.siteMap.totalPages,
        moneyPages: profile.siteMap.moneyPages.length,
        supportPages: profile.siteMap.supportPages.length,
        authorityPages: profile.siteMap.authorityPages.length,
      },
      pageGraph: [
        ...profile.siteMap.moneyPages,
        ...profile.siteMap.supportPages,
        ...profile.siteMap.trustPages,
        ...profile.siteMap.authorityPages,
      ].map((p) => ({
        url: p.url,
        title: p.title,
        role: p.role as any,
        priorityScore: p.priorityScore,
      })),
      rewrite: unified.rewriteContext
        ? {
            originalUrl: unified.rewriteContext.originalUrl,
            originalHtml: undefined,
            extractedHeadings: [],
            extractedFAQs: [],
            extractedKeyPoints: [],
            preserveElements: unified.rewriteContext.preserveElements,
            removeElements: unified.rewriteContext.removeElements,
          }
        : undefined,
    },
    proofContext: {
      reviews: profile.reviews.topSnippets.map((s) => ({
        source: s.source as any,
        rating: s.rating,
        text: s.text,
        date: '',
        author: s.author,
      })),
      reviewThemes: profile.reviews.themes.map((t) => ({
        theme: t.theme,
        count: t.count,
        snippets: [],
      })),
      proofAssets: {
        caseStudies: [],
        awards: [],
        certifications: [],
        guarantees: [],
      },
    },
    visionContext: {
      selectedImages: unified.visionContext
        ? [
            ...(unified.visionContext.heroImage
              ? [adaptImagePlanToSelectedImage(unified.visionContext.heroImage)]
              : []),
            ...unified.visionContext.inlineImages.map(adaptImagePlanToSelectedImage),
          ]
        : [],
      heroCandidate: unified.visionContext?.heroImage?.imageId,
    },
    publishingTargets: {
      wordpress: {
        siteId: '',
        status: 'draft' as const,
      },
      linkedin: {
        enabled: publishingTargets.linkedin,
      },
      gmb: {
        enabled: publishingTargets.gmb,
      },
      reddit: {
        enabled: publishingTargets.reddit,
        subredditTargets: [],
      },
    },
    createdAt: unified.generatedAt,
    updatedAt: unified.generatedAt,
  };
}
