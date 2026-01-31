import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { scorePageContent, type ContentPageData } from '@/lib/content-scorer';
import { generateFixBrief } from '@/lib/fix-brief/generator';

export async function POST(
  request: NextRequest,
  { params }: { params: { projectId: string; pageId: string } }
) {
  try {
    const supabase = createServerSupabaseClient();
    
    // Parse optional body (can include pre-computed content score)
    let providedScore;
    try {
      const body = await request.json();
      providedScore = body?.contentScore;
    } catch {
      // No body provided, that's fine
    }
    
    // Fetch page data
    const { data: page, error } = await supabase
      .from('pages')
      .select('*')
      .eq('id', params.pageId)
      .eq('project_id', params.projectId)
      .single();
    
    if (error || !page) {
      return NextResponse.json(
        { error: 'Page not found' },
        { status: 404 }
      );
    }
    
    // Build page data for scorer
    const pageData: ContentPageData = {
      url: page.url,
      title: page.title || page.seo_data?.title,
      metaDescription: page.meta_description || page.seo_data?.metaDescription,
      h1: page.seo_data?.h1 || page.h1,
      headings: page.seo_data?.headings || [],
      bodyText: page.body_text || page.content || '',
      wordCount: page.word_count || page.seo_data?.wordCount,
      focusKeyword: page.focus_keyword || page.seo_data?.focusKeyword || extractKeywordFromTitle(page.title),
    };
    
    // Score the content if not provided
    const contentScore = providedScore || scorePageContent(pageData);
    
    // Generate the fix brief
    const brief = generateFixBrief(
      pageData.url,
      pageData.title || 'Untitled Page',
      pageData.bodyText || '',
      contentScore,
      pageData.focusKeyword
    );
    
    return NextResponse.json({
      success: true,
      pageId: params.pageId,
      brief,
    });
    
  } catch (error) {
    console.error('[FixBrief] Error:', error);
    return NextResponse.json(
      { error: 'Failed to generate fix brief' },
      { status: 500 }
    );
  }
}

/**
 * Extract a focus keyword from the page title as a fallback
 */
function extractKeywordFromTitle(title?: string): string | undefined {
  if (!title) return undefined;
  
  // Remove common suffixes like "| Brand Name"
  const cleaned = title.split(/[|\-–]/).reverse().pop()?.trim() || title;
  
  // Take first 3-4 significant words
  const words = cleaned
    .toLowerCase()
    .split(/\s+/)
    .filter(w => w.length > 3 && !['the', 'and', 'for', 'with', 'your', 'our'].includes(w))
    .slice(0, 4);
  
  return words.length >= 2 ? words.join(' ') : undefined;
}
