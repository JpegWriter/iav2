'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Card, 
  CardHeader, 
  Button, 
  Badge,
  Input
} from '@/components/ui';
import { 
  Plus, 
  Check,
  X,
  Globe,
  MapPin,
  Linkedin,
  ExternalLink,
  Trash2,
  RefreshCw,
  Send,
  Clock,
  CheckCircle,
  AlertCircle
} from 'lucide-react';
import { useState } from 'react';
import { cn, formatDate } from '@/lib/utils';

type Channel = 'wordpress' | 'gmb' | 'linkedin';

interface ChannelConnection {
  id: string;
  channel: Channel;
  config: any;
  status: 'active' | 'error' | 'pending';
  created_at: string;
}

interface Publish {
  id: string;
  task_id: string;
  channel: Channel;
  status: 'pending' | 'published' | 'failed';
  published_url?: string;
  error_message?: string;
  published_at?: string;
  task?: {
    title: string;
    page?: { url: string };
  };
}

const channelConfig: Record<Channel, { icon: any; label: string; color: string }> = {
  wordpress: { icon: Globe, label: 'WordPress', color: 'bg-blue-100 text-blue-700' },
  gmb: { icon: MapPin, label: 'Google Business', color: 'bg-red-100 text-red-700' },
  linkedin: { icon: Linkedin, label: 'LinkedIn', color: 'bg-sky-100 text-sky-700' },
};

export default function PublishingPage({
  params,
}: {
  params: { projectId: string };
}) {
  const [isAddingChannel, setIsAddingChannel] = useState<Channel | null>(null);
  const [wpConfig, setWpConfig] = useState({ url: '', username: '', password: '' });

  const queryClient = useQueryClient();

  const { data: connectionsData, isLoading: loadingConnections } = useQuery({
    queryKey: ['channel-connections', params.projectId],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${params.projectId}/channels`);
      if (!res.ok) throw new Error('Failed to fetch connections');
      return res.json();
    },
  });

  const { data: publishesData, isLoading: loadingPublishes } = useQuery({
    queryKey: ['publishes', params.projectId],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${params.projectId}/publishes`);
      if (!res.ok) throw new Error('Failed to fetch publishes');
      return res.json();
    },
  });

  const addConnectionMutation = useMutation({
    mutationFn: async ({ channel, config }: { channel: Channel; config: any }) => {
      const res = await fetch(`/api/projects/${params.projectId}/channels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel, config }),
      });
      if (!res.ok) throw new Error('Failed to add connection');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['channel-connections', params.projectId] });
      setIsAddingChannel(null);
      setWpConfig({ url: '', username: '', password: '' });
    },
  });

  const deleteConnectionMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/projects/${params.projectId}/channels/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete connection');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['channel-connections', params.projectId] });
    },
  });

  const connections: ChannelConnection[] = connectionsData?.data || [];
  const publishes: Publish[] = publishesData?.data || [];

  const connectedChannels = connections.map(c => c.channel);

  const handleAddWordPress = () => {
    if (!wpConfig.url || !wpConfig.username || !wpConfig.password) return;
    addConnectionMutation.mutate({
      channel: 'wordpress',
      config: wpConfig,
    });
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'published':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'failed':
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      default:
        return <Clock className="w-4 h-4 text-amber-500" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Publishing</h1>
        <p className="text-slate-600 mt-1">
          Connect your channels and publish content directly
        </p>
      </div>

      {/* Channel Connections */}
      <Card>
        <CardHeader 
          title="Connected Channels" 
          description="Set up publishing destinations for your content"
        />
        
        <div className="space-y-4">
          {/* WordPress */}
          <div className="p-4 border border-slate-200 rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={cn('p-2 rounded-lg', channelConfig.wordpress.color)}>
                  <Globe className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-medium text-slate-900">WordPress</h3>
                  <p className="text-sm text-slate-600">
                    Publish directly to your WordPress site
                  </p>
                </div>
              </div>
              {connectedChannels.includes('wordpress') ? (
                <div className="flex items-center gap-2">
                  <Badge className="bg-green-100 text-green-700">Connected</Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      const conn = connections.find(c => c.channel === 'wordpress');
                      if (conn && confirm('Remove WordPress connection?')) {
                        deleteConnectionMutation.mutate(conn.id);
                      }
                    }}
                  >
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </Button>
                </div>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsAddingChannel('wordpress')}
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Connect
                </Button>
              )}
            </div>

            {isAddingChannel === 'wordpress' && (
              <div className="mt-4 p-4 bg-slate-50 rounded-lg space-y-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    WordPress URL
                  </label>
                  <Input
                    value={wpConfig.url}
                    onChange={(e) => setWpConfig({ ...wpConfig, url: e.target.value })}
                    placeholder="https://yoursite.com"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Username
                    </label>
                    <Input
                      value={wpConfig.username}
                      onChange={(e) => setWpConfig({ ...wpConfig, username: e.target.value })}
                      placeholder="admin"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      App Password
                    </label>
                    <Input
                      type="password"
                      value={wpConfig.password}
                      onChange={(e) => setWpConfig({ ...wpConfig, password: e.target.value })}
                      placeholder="xxxx xxxx xxxx xxxx"
                    />
                  </div>
                </div>
                <p className="text-xs text-slate-500">
                  Generate an Application Password in WordPress: Users → Your Profile → Application Passwords
                </p>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => setIsAddingChannel(null)}>
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleAddWordPress}
                    disabled={addConnectionMutation.isPending}
                  >
                    <Check className="w-4 h-4 mr-1" />
                    Connect
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Google Business Profile */}
          <div className="p-4 border border-slate-200 rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={cn('p-2 rounded-lg', channelConfig.gmb.color)}>
                  <MapPin className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-medium text-slate-900">Google Business Profile</h3>
                  <p className="text-sm text-slate-600">
                    Post updates to your Google Business listing
                  </p>
                </div>
              </div>
              {connectedChannels.includes('gmb') ? (
                <Badge className="bg-green-100 text-green-700">Connected</Badge>
              ) : (
                <Button variant="outline" size="sm" disabled>
                  Coming Soon
                </Button>
              )}
            </div>
          </div>

          {/* LinkedIn */}
          <div className="p-4 border border-slate-200 rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={cn('p-2 rounded-lg', channelConfig.linkedin.color)}>
                  <Linkedin className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-medium text-slate-900">LinkedIn</h3>
                  <p className="text-sm text-slate-600">
                    Share content on your LinkedIn company page
                  </p>
                </div>
              </div>
              {connectedChannels.includes('linkedin') ? (
                <Badge className="bg-green-100 text-green-700">Connected</Badge>
              ) : (
                <Button variant="outline" size="sm" disabled>
                  Coming Soon
                </Button>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* Recent Publishes */}
      <Card>
        <CardHeader 
          title="Publishing History" 
          description="Track your published content"
          action={
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => queryClient.invalidateQueries({ queryKey: ['publishes', params.projectId] })}
            >
              <RefreshCw className="w-4 h-4 mr-1" />
              Refresh
            </Button>
          }
        />
        
        {loadingPublishes ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin w-6 h-6 border-2 border-primary-600 border-t-transparent rounded-full" />
          </div>
        ) : publishes.length === 0 ? (
          <div className="text-center py-12">
            <Send className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-slate-900 mb-2">No publishes yet</h3>
            <p className="text-slate-600">
              Content will appear here once you start publishing
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {publishes.map((publish) => {
              const channel = channelConfig[publish.channel];
              const Icon = channel.icon;
              
              return (
                <div
                  key={publish.id}
                  className="p-4 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <div className={cn('p-2 rounded-lg', channel.color)}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="font-medium text-slate-900">
                          {publish.task?.title || 'Untitled'}
                        </h4>
                        <p className="text-sm text-slate-600">
                          {channel.label}
                          {publish.published_at && ` • ${formatDate(publish.published_at)}`}
                        </p>
                        {publish.error_message && (
                          <p className="text-sm text-red-600 mt-1">{publish.error_message}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {getStatusIcon(publish.status)}
                      <span className={cn(
                        'text-sm font-medium',
                        publish.status === 'published' && 'text-green-600',
                        publish.status === 'failed' && 'text-red-600',
                        publish.status === 'pending' && 'text-amber-600'
                      )}>
                        {publish.status}
                      </span>
                      {publish.published_url && (
                        <a
                          href={publish.published_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1 hover:bg-slate-200 rounded"
                        >
                          <ExternalLink className="w-4 h-4 text-slate-500" />
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
