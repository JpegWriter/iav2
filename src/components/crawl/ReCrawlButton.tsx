'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui';
import { RefreshCw } from 'lucide-react';

interface ReCrawlButtonProps {
  projectId: string;
}

export function ReCrawlButton({ projectId }: ReCrawlButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleReCrawl = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/crawl`, {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('Failed to start crawl');
      }

      // Refresh the page to show updated status
      router.refresh();
    } catch (error) {
      console.error('Re-crawl error:', error);
      alert('Failed to start re-crawl. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button 
      variant="outline" 
      size="sm" 
      onClick={handleReCrawl}
      disabled={isLoading}
    >
      <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
      {isLoading ? 'Crawling...' : 'Re-crawl'}
    </Button>
  );
}
