'use client';

import { useState, useRef, useCallback } from 'react';
import { Image as ImageIcon, Upload, X, Loader2, Check, Eye } from 'lucide-react';
import { Button } from './button';
import { cn } from '@/lib/utils';

// ============================================================================
// IMAGE UPLOAD MODAL - For adding images to growth planner tasks
// ============================================================================

export interface UploadedImage {
  id: string;
  filename: string;
  base64: string;
  preview: string;
  size: number;
  type: string;
}

export interface VisionAnalysisResult {
  sceneSummary: string;
  sceneType: string;
  storyAngles: { angle: string; applicableContentTypes: string[] }[];
  entities: { name: string; type: string }[];
}

interface ImageUploadProps {
  projectId: string;
  taskId: string;
  taskTitle: string;
  primaryService?: string;
  targetAudience?: string;
  onUploadComplete?: (packId: string, imageCount: number) => void;
  existingPackId?: string;
  isCaseStudy?: boolean;
  className?: string;
}

interface ImageUploadModalProps extends ImageUploadProps {
  isOpen: boolean;
  onClose: () => void;
}

// ============================================================================
// INLINE UPLOAD BUTTON - Shows on task card
// ============================================================================

export function ImageUploadButton({
  projectId,
  taskId,
  taskTitle,
  primaryService,
  targetAudience,
  onUploadComplete,
  existingPackId,
  isCaseStudy,
  className,
}: ImageUploadProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className={cn("gap-1", className)}
        onClick={(e) => {
          e.stopPropagation();
          setIsModalOpen(true);
        }}
        title={existingPackId ? "View/Add images" : "Add images"}
      >
        <ImageIcon className="w-4 h-4" />
        {existingPackId && <Check className="w-3 h-3 text-green-500" />}
      </Button>

      {isModalOpen && (
        <ImageUploadModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          projectId={projectId}
          taskId={taskId}
          taskTitle={taskTitle}
          primaryService={primaryService}
          targetAudience={targetAudience}
          onUploadComplete={onUploadComplete}
          existingPackId={existingPackId}
          isCaseStudy={isCaseStudy}
        />
      )}
    </>
  );
}

// ============================================================================
// UPLOAD MODAL - Full image upload with drag/drop
// ============================================================================

function ImageUploadModal({
  isOpen,
  onClose,
  projectId,
  taskId,
  taskTitle,
  primaryService,
  targetAudience,
  onUploadComplete,
  existingPackId,
  isCaseStudy,
}: ImageUploadModalProps) {
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<VisionAnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [writerContext, setWriterContext] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle file selection
  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files) return;

    const newImages: UploadedImage[] = [];
    const maxFiles = 10 - images.length;

    for (let i = 0; i < Math.min(files.length, maxFiles); i++) {
      const file = files[i];
      if (!file.type.startsWith('image/')) {
        setError('Only image files are allowed');
        continue;
      }

      if (file.size > 10 * 1024 * 1024) {
        setError('Images must be under 10MB');
        continue;
      }

      // Convert to base64
      const base64 = await fileToBase64(file);
      
      newImages.push({
        id: `${Date.now()}-${i}`,
        filename: file.name,
        base64: base64.split(',')[1], // Remove data:image/... prefix
        preview: base64,
        size: file.size,
        type: file.type,
      });
    }

    setImages(prev => [...prev, ...newImages].slice(0, 3));
    setError(null);
  }, [images.length]);

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    handleFiles(e.dataTransfer.files);
  };

  // Remove an image
  const removeImage = (id: string) => {
    setImages(prev => prev.filter(img => img.id !== id));
  };

  // Submit for analysis
  const handleSubmit = async () => {
    if (images.length === 0) {
      setError('Please add at least one image');
      return;
    }

    setIsAnalyzing(true);
    setError(null);

    try {
      const response = await fetch(`/api/projects/${projectId}/vision/evidence`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          images: images.map(img => ({
            base64: img.base64,
            filename: img.filename,
          })),
          context: {
            topic: taskTitle,
            primaryService: primaryService || '',
            brandTone: ['professional'],
            targetAudience: targetAudience || '',
            contentIntent: isCaseStudy ? 'case-study' : 'showcase',
            writerNotes: writerContext,
            isCaseStudy: isCaseStudy || false,
          },
          taskId,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to analyze images');
      }

      // Show success
      setAnalysisResult(data.pack);
      onUploadComplete?.(data.pack?.id, images.length);

      // Close after short delay
      setTimeout(() => {
        onClose();
      }, 2000);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload images');
    } finally {
      setIsAnalyzing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Add Images</h2>
            <p className="text-sm text-slate-500 mt-0.5 truncate max-w-[300px]">{taskTitle}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Analysis Success */}
          {analysisResult && (
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-center gap-2 text-green-700 font-medium mb-2">
                <Check className="w-5 h-5" />
                Images Analyzed Successfully
              </div>
              <p className="text-sm text-green-600">{analysisResult.sceneSummary}</p>
              {analysisResult.storyAngles?.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs font-medium text-green-700">Story Angles:</p>
                  <ul className="text-xs text-green-600 mt-1">
                    {analysisResult.storyAngles.slice(0, 2).map((angle, i) => (
                      <li key={i}>• {angle.angle}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Drop Zone */}
          {!analysisResult && (
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={cn(
                "border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer",
                isDragOver 
                  ? "border-primary-400 bg-primary-50" 
                  : "border-slate-300 hover:border-slate-400"
              )}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => handleFiles(e.target.files)}
              />
              <Upload className="w-10 h-10 text-slate-400 mx-auto mb-3" />
              <p className="text-sm text-slate-600">
                Drag & drop images or <span className="text-primary-600 font-medium">browse</span>
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Up to 10 images, max 10MB each
              </p>
            </div>
          )}

          {/* Image Previews */}
          {images.length > 0 && !analysisResult && (
            <div className="grid grid-cols-3 gap-3">
              {images.map(img => (
                <div key={img.id} className="relative aspect-square group">
                  <img
                    src={img.preview}
                    alt={img.filename}
                    className="w-full h-full object-cover rounded-lg"
                  />
                  <button
                    onClick={() => removeImage(img.id)}
                    className="absolute top-1 right-1 p-1 bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-4 h-4 text-white" />
                  </button>
                  <div className="absolute bottom-1 left-1 right-1 bg-black/50 rounded px-1.5 py-0.5">
                    <p className="text-xs text-white truncate">{img.filename}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Writer Context Notes */}
          {images.length > 0 && !analysisResult && (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700">
                {isCaseStudy ? 'Case Study Context' : 'Image Context'} 
                <span className="text-slate-400 font-normal ml-1">(optional)</span>
              </label>
              <textarea
                value={writerContext}
                onChange={(e) => setWriterContext(e.target.value)}
                placeholder={
                  isCaseStudy 
                    ? "Describe this project: What was the problem? What solution did you provide? What were the results? This helps the writer tell a compelling story..."
                    : "Add notes to help the writer understand these images (e.g., 'Team installing new boiler at Smith residence', 'Before/after of kitchen renovation')..."
                }
                rows={3}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none placeholder:text-slate-400"
              />
              {isCaseStudy && (
                <p className="text-xs text-amber-600 bg-amber-50 px-2 py-1.5 rounded">
                  💡 Case studies convert better with specific details: project scope, challenges overcome, and measurable results.
                </p>
              )}
            </div>
          )}

          {/* Info */}
          {!analysisResult && (
            <div className="text-xs text-slate-500 bg-slate-50 p-3 rounded-lg">
              <p className="font-medium text-slate-700 mb-1">What happens next:</p>
              <ul className="space-y-1">
                <li>• AI analyzes your images for content context</li>
                <li>• Identifies people, equipment, and work scenes</li>
                <li>• Suggests story angles for your content</li>
                <li>• Evidence is included in generated briefs</li>
              </ul>
            </div>
          )}
        </div>

        {/* Footer */}
        {!analysisResult && (
          <div className="p-4 border-t bg-slate-50 flex justify-end gap-3">
            <Button variant="outline" onClick={onClose} disabled={isAnalyzing}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={images.length === 0 || isAnalyzing}
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Eye className="w-4 h-4 mr-2" />
                  Analyze {images.length} Image{images.length !== 1 ? 's' : ''}
                </>
              )}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// UTILITIES
// ============================================================================

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
  });
}
