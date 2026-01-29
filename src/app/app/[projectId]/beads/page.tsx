'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Card, 
  CardHeader, 
  Button, 
  Badge,
  Input,
  Textarea
} from '@/components/ui';
import { 
  Plus, 
  Trash2, 
  Edit2, 
  X,
  Check,
  Award,
  Users,
  Clock,
  Star,
  Shield,
  Gem
} from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

type BeadType = 'proof' | 'authority' | 'process' | 'differentiator' | 'offer' | 'local';

interface Bead {
  id: string;
  type: BeadType;
  label: string;
  value: string;
  source?: any;
  priority: number;
  channels?: string[];
  where_to_use?: string[];
}

const beadTypeConfig: Record<BeadType, { icon: any; color: string; label: string; description: string }> = {
  proof: { 
    icon: Users, 
    color: 'bg-green-100 text-green-700', 
    label: 'Proof',
    description: '"1,200 shoots delivered", "4.9★ 312 reviews"'
  },
  authority: { 
    icon: Award, 
    color: 'bg-amber-100 text-amber-700', 
    label: 'Authority',
    description: 'Awards, certifications, press mentions'
  },
  process: { 
    icon: Clock, 
    color: 'bg-blue-100 text-blue-700', 
    label: 'Process',
    description: '"3-step booking", "48h turnaround"'
  },
  differentiator: { 
    icon: Gem, 
    color: 'bg-purple-100 text-purple-700', 
    label: 'Differentiator',
    description: 'What makes you unique from competitors'
  },
  offer: { 
    icon: Star, 
    color: 'bg-pink-100 text-pink-700', 
    label: 'Offer',
    description: 'Bundles, vouchers, guarantees'
  },
  local: { 
    icon: Shield, 
    color: 'bg-slate-100 text-slate-700', 
    label: 'Local',
    description: 'Landmarks, districts, neighborhoods'
  },
};

export default function BeadsPage({
  params,
}: {
  params: { projectId: string };
}) {
  const [isAddingBead, setIsAddingBead] = useState(false);
  const [editingBead, setEditingBead] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<Bead>>({
    type: 'proof',
    label: '',
    value: '',
    priority: 1,
  });

  const queryClient = useQueryClient();

  const { data: beadsData, isLoading } = useQuery({
    queryKey: ['beads', params.projectId],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${params.projectId}/beads`);
      if (!res.ok) throw new Error('Failed to fetch beads');
      return res.json();
    },
  });

  const createBeadMutation = useMutation({
    mutationFn: async (bead: Partial<Bead>) => {
      const res = await fetch(`/api/projects/${params.projectId}/beads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bead),
      });
      if (!res.ok) throw new Error('Failed to create bead');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['beads', params.projectId] });
      resetForm();
    },
  });

  const updateBeadMutation = useMutation({
    mutationFn: async ({ id, ...bead }: Partial<Bead> & { id: string }) => {
      const res = await fetch(`/api/projects/${params.projectId}/beads/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bead),
      });
      if (!res.ok) throw new Error('Failed to update bead');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['beads', params.projectId] });
      setEditingBead(null);
    },
  });

  const deleteBeadMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/projects/${params.projectId}/beads/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete bead');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['beads', params.projectId] });
    },
  });

  const beads: Bead[] = beadsData?.data || [];

  const resetForm = () => {
    setFormData({
      type: 'proof',
      label: '',
      value: '',
      priority: 1,
    });
    setIsAddingBead(false);
  };

  const handleSubmit = () => {
    if (!formData.label || !formData.value) return;
    
    if (editingBead) {
      updateBeadMutation.mutate({ id: editingBead, ...formData });
    } else {
      createBeadMutation.mutate(formData);
    }
  };

  const startEditing = (bead: Bead) => {
    setEditingBead(bead.id);
    setFormData({
      type: bead.type,
      label: bead.label,
      value: bead.value,
      priority: bead.priority,
    });
  };

  const beadsByType = beads.reduce((acc, bead) => {
    if (!acc[bead.type]) acc[bead.type] = [];
    acc[bead.type].push(bead);
    return acc;
  }, {} as Record<BeadType, Bead[]>);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Beads</h1>
          <p className="text-slate-600 mt-1">
            Proof points and trust signals to weave into your content
          </p>
        </div>
        <Button onClick={() => setIsAddingBead(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Add Bead
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        {Object.entries(beadTypeConfig).map(([type, config]) => {
          const count = beadsByType[type as BeadType]?.length || 0;
          const Icon = config.icon;
          return (
            <Card key={type} className="text-center">
              <div className={cn('w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-2', config.color)}>
                <Icon className="w-5 h-5" />
              </div>
              <p className="text-2xl font-bold text-slate-900">{count}</p>
              <p className="text-sm text-slate-600">{config.label}s</p>
            </Card>
          );
        })}
      </div>

      {/* Add/Edit Form */}
      {(isAddingBead || editingBead) && (
        <Card className="border-primary-200 bg-primary-50/50">
          <CardHeader 
            title={editingBead ? 'Edit Bead' : 'Add New Bead'} 
            action={
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => {
                  resetForm();
                  setEditingBead(null);
                }}
              >
                <X className="w-4 h-4" />
              </Button>
            }
          />
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Type</label>
              <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                {Object.entries(beadTypeConfig).map(([type, config]) => {
                  const Icon = config.icon;
                  return (
                    <button
                      key={type}
                      onClick={() => setFormData({ ...formData, type: type as BeadType })}
                      className={cn(
                        'p-3 rounded-lg border-2 transition-all flex flex-col items-center gap-1',
                        formData.type === type
                          ? 'border-primary-500 bg-white'
                          : 'border-transparent bg-white hover:border-slate-200'
                      )}
                    >
                      <Icon className="w-5 h-5 text-slate-600" />
                      <span className="text-xs text-slate-700">{config.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Label</label>
                <Input
                  value={formData.label}
                  onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                  placeholder={getLabelPlaceholder(formData.type as BeadType)}
                />
                <p className="text-xs text-slate-500 mt-1">Short descriptive name</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Value</label>
                <Input
                  value={formData.value}
                  onChange={(e) => setFormData({ ...formData, value: e.target.value })}
                  placeholder={getValuePlaceholder(formData.type as BeadType)}
                />
                <p className="text-xs text-slate-500 mt-1">The actual proof point</p>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Priority</label>
                <select
                  value={formData.priority}
                  onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value={1}>High (use frequently)</option>
                  <option value={2}>Medium</option>
                  <option value={3}>Low (use occasionally)</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { resetForm(); setEditingBead(null); }}>
                Cancel
              </Button>
              <Button 
                onClick={handleSubmit}
                disabled={!formData.label || !formData.value || createBeadMutation.isPending || updateBeadMutation.isPending}
              >
                <Check className="w-4 h-4 mr-1" />
                {editingBead ? 'Update' : 'Add'} Bead
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Beads List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin w-6 h-6 border-2 border-primary-600 border-t-transparent rounded-full" />
        </div>
      ) : beads.length === 0 ? (
        <Card className="text-center py-12">
          <Gem className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-slate-900 mb-2">No beads yet</h3>
          <p className="text-slate-600 mb-4">
            Add proof points to make your content more persuasive
          </p>
          <Button onClick={() => setIsAddingBead(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Add Your First Bead
          </Button>
        </Card>
      ) : (
        <div className="space-y-6">
          {Object.entries(beadTypeConfig).map(([type, config]) => {
            const typeBeads = beadsByType[type as BeadType] || [];
            if (typeBeads.length === 0) return null;
            
            const Icon = config.icon;
            
            return (
              <Card key={type}>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className={cn('w-8 h-8 rounded-full flex items-center justify-center', config.color)}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <span className="text-lg font-semibold text-slate-900">{config.label}s</span>
                    <Badge className="bg-slate-100 text-slate-700" size="sm">
                      {typeBeads.length}
                    </Badge>
                  </div>
                </div>
                
                <div className="space-y-3">
                  {typeBeads.sort((a, b) => a.priority - b.priority).map((bead) => (
                    <div
                      key={bead.id}
                      className="p-4 bg-slate-50 rounded-lg group hover:bg-slate-100 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <p className="font-medium text-slate-900">{bead.label}</p>
                          <p className="text-slate-600 mt-1">{bead.value}</p>
                          {bead.source && (
                            <p className="text-sm text-slate-500 mt-1">
                              Source: {typeof bead.source === 'string' ? bead.source : JSON.stringify(bead.source)}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Badge 
                            className={cn(
                              bead.priority === 1 && 'bg-green-100 text-green-700',
                              bead.priority === 2 && 'bg-amber-100 text-amber-700',
                              bead.priority === 3 && 'bg-slate-100 text-slate-700'
                            )}
                            size="sm"
                          >
                            P{bead.priority}
                          </Badge>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => startEditing(bead)}
                          >
                            <Edit2 className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              if (confirm('Delete this bead?')) {
                                deleteBeadMutation.mutate(bead.id);
                              }
                            }}
                          >
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function getLabelPlaceholder(type: BeadType): string {
  switch (type) {
    case 'proof':
      return 'Review Count, Properties Sold, etc.';
    case 'authority':
      return 'Award Name, Certification, etc.';
    case 'process':
      return 'Turnaround Time, Booking Steps, etc.';
    case 'differentiator':
      return 'Unique Selling Point';
    case 'offer':
      return 'Bundle Name, Guarantee, etc.';
    case 'local':
      return 'Neighborhood, Landmark, etc.';
    default:
      return 'Brief label for this bead';
  }
}

function getValuePlaceholder(type: BeadType): string {
  switch (type) {
    case 'proof':
      return '4.9★ from 312 reviews';
    case 'authority':
      return 'Best Real Estate Agency 2024';
    case 'process':
      return '48-hour turnaround guaranteed';
    case 'differentiator':
      return 'Only agency with drone photography';
    case 'offer':
      return 'Free virtual staging with every listing';
    case 'local':
      return 'Specializing in Downtown & Westside';
    default:
      return 'The actual proof point...';
  }
}
