'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Card, 
  CardHeader, 
  Button, 
  Input,
  Textarea,
  Toggle
} from '@/components/ui';
import { 
  Save,
  Trash2,
  AlertTriangle,
  Globe,
  Building,
  Palette,
  RefreshCw
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function SettingsPage({
  params,
}: {
  params: { projectId: string };
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isSaving, setIsSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const { data: projectData, isLoading } = useQuery({
    queryKey: ['project', params.projectId],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${params.projectId}`);
      if (!res.ok) throw new Error('Failed to fetch project');
      return res.json();
    },
  });

  const { data: contextData } = useQuery({
    queryKey: ['user-context', params.projectId],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${params.projectId}/context`);
      if (!res.ok) throw new Error('Failed to fetch context');
      return res.json();
    },
  });

  const [formData, setFormData] = useState({
    name: '',
    domain: '',
    business_name: '',
    industry: '',
    services: '',
    brand_voice: '',
    primary_cta: '',
  });

  useEffect(() => {
    if (projectData?.data) {
      setFormData((prev) => ({
        ...prev,
        name: projectData.data.name || '',
        domain: projectData.data.domain || '',
      }));
    }
  }, [projectData]);

  useEffect(() => {
    if (contextData?.data) {
      const ctx = contextData.data;
      setFormData((prev) => ({
        ...prev,
        business_name: ctx.business_name || '',
        industry: ctx.industry || '',
        services: Array.isArray(ctx.services) ? ctx.services.join(', ') : '',
        brand_voice: ctx.brand_voice || '',
        primary_cta: ctx.primary_cta || '',
      }));
    }
  }, [contextData]);

  const updateProjectMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch(`/api/projects/${params.projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to update project');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', params.projectId] });
    },
  });

  const updateContextMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch(`/api/projects/${params.projectId}/context`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to update context');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-context', params.projectId] });
    },
  });

  const deleteProjectMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/projects/${params.projectId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete project');
      return res.json();
    },
    onSuccess: () => {
      router.push('/app');
    },
  });

  const recrawlMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/projects/${params.projectId}/crawl`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Failed to start recrawl');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', params.projectId] });
    },
  });

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updateProjectMutation.mutateAsync({
        name: formData.name,
        domain: formData.domain,
      });
      await updateContextMutation.mutateAsync({
        business_name: formData.business_name,
        industry: formData.industry,
        services: formData.services.split(',').map(s => s.trim()).filter(Boolean),
        brand_voice: formData.brand_voice,
        primary_cta: formData.primary_cta,
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-2 border-primary-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Project Settings</h1>
        <p className="text-slate-600 mt-1">
          Manage your project configuration and preferences
        </p>
      </div>

      {/* Website Settings */}
      <Card>
        <CardHeader 
          title={
            <div className="flex items-center gap-2">
              <Globe className="w-5 h-5 text-slate-600" />
              Website Settings
            </div>
          }
        />
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Project Name
            </label>
            <Input
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="My Website Project"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Domain
            </label>
            <Input
              value={formData.domain}
              onChange={(e) => setFormData({ ...formData, domain: e.target.value })}
              placeholder="https://example.com"
            />
          </div>
          <div className="flex items-center justify-between pt-4 border-t border-slate-200">
            <div>
              <p className="font-medium text-slate-900">Re-crawl Website</p>
              <p className="text-sm text-slate-600">Start a fresh crawl of all pages</p>
            </div>
            <Button 
              variant="outline"
              onClick={() => recrawlMutation.mutate()}
              disabled={recrawlMutation.isPending}
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${recrawlMutation.isPending ? 'animate-spin' : ''}`} />
              {recrawlMutation.isPending ? 'Crawling...' : 'Re-crawl'}
            </Button>
          </div>
        </div>
      </Card>

      {/* Business Settings */}
      <Card>
        <CardHeader 
          title={
            <div className="flex items-center gap-2">
              <Building className="w-5 h-5 text-slate-600" />
              Business Information
            </div>
          }
        />
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Business Name
            </label>
            <Input
              value={formData.business_name}
              onChange={(e) => setFormData({ ...formData, business_name: e.target.value })}
              placeholder="Your Business Name"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Industry
            </label>
            <Input
              value={formData.industry}
              onChange={(e) => setFormData({ ...formData, industry: e.target.value })}
              placeholder="e.g., Legal Services, Home Improvement"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Services (comma-separated)
            </label>
            <Textarea
              value={formData.services}
              onChange={(e) => setFormData({ ...formData, services: e.target.value })}
              placeholder="Service 1, Service 2, Service 3"
              rows={2}
            />
          </div>
        </div>
      </Card>

      {/* Brand Settings */}
      <Card>
        <CardHeader 
          title={
            <div className="flex items-center gap-2">
              <Palette className="w-5 h-5 text-slate-600" />
              Brand & Voice
            </div>
          }
        />
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Brand Voice
            </label>
            <Textarea
              value={formData.brand_voice}
              onChange={(e) => setFormData({ ...formData, brand_voice: e.target.value })}
              placeholder="Describe your brand voice (e.g., Professional but friendly, authoritative yet approachable)"
              rows={3}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Primary Call-to-Action
            </label>
            <Input
              value={formData.primary_cta}
              onChange={(e) => setFormData({ ...formData, primary_cta: e.target.value })}
              placeholder="e.g., Schedule a Free Consultation"
            />
          </div>
        </div>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isSaving}>
          <Save className="w-4 h-4 mr-2" />
          {isSaving ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>

      {/* Danger Zone */}
      <Card className="border-red-200">
        <CardHeader 
          title={
            <div className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="w-5 h-5" />
              Danger Zone
            </div>
          }
        />
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-slate-900">Delete Project</p>
            <p className="text-sm text-slate-600">
              Permanently delete this project and all its data
            </p>
          </div>
          {!showDeleteConfirm ? (
            <Button 
              variant="outline"
              className="border-red-300 text-red-600 hover:bg-red-50"
              onClick={() => setShowDeleteConfirm(true)}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete Project
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button 
                variant="outline"
                onClick={() => setShowDeleteConfirm(false)}
              >
                Cancel
              </Button>
              <Button 
                className="bg-red-600 hover:bg-red-700"
                onClick={() => deleteProjectMutation.mutate()}
                disabled={deleteProjectMutation.isPending}
              >
                {deleteProjectMutation.isPending ? 'Deleting...' : 'Confirm Delete'}
              </Button>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
