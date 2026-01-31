import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { scorePageContent, type ContentPageData } from '@/lib/content-scorer';

export async function GET(
  request: NextRequest,
  { params }: { params: { projectId: string; pageId: string } }
) {
  try {
    const supabase = createServerSupabaseClient();
    
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
    
    // Score the content
    const result = scorePageContent(pageData);
    
    return NextResponse.json({
      success: true,
      pageId: params.pageId,
      pageUrl: page.url,
      ...result,
    });
    
  } catch (error) {
    console.error('[ContentScore] Error:', error);
    return NextResponse.json(
      { error: 'Failed to score content' },
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
