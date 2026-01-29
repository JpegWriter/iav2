import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { Header } from '@/components/layout';
import { Button, Card, Badge } from '@/components/ui';
import { Plus, Globe, ArrowRight } from 'lucide-react';
import { formatRelativeTime } from '@/lib/utils';

export default async function AppPage() {
  const supabase = createServerSupabaseClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect('/login');
  }

  const { data: projects } = await supabase
    .from('projects')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  return (
    <div className="min-h-screen bg-slate-50">
      <Header user={{ email: user.email }} />
      
      <main className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Projects</h1>
            <p className="text-slate-600">Manage your website audits and content plans</p>
          </div>
          <Link href="/onboarding">
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              New Project
            </Button>
          </Link>
        </div>

        {projects && projects.length > 0 ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {projects.map((project) => (
              <Link key={project.id} href={`/app/${project.id}`}>
                <Card className="hover:border-primary-300 transition-colors cursor-pointer h-full">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-lg bg-primary-100 flex items-center justify-center flex-shrink-0">
                      <Globe className="w-6 h-6 text-primary-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-slate-900 truncate">{project.name}</h3>
                      <p className="text-sm text-slate-500 truncate">{project.root_url}</p>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center gap-2">
                    <Badge
                      variant={
                        project.status === 'ready' ? 'success' :
                        project.status === 'crawling' || project.status === 'auditing' ? 'warning' :
                        'default'
                      }
                    >
                      {project.status}
                    </Badge>
                    {project.growth_planner_unlocked && (
                      <Badge variant="info">Growth Unlocked</Badge>
                    )}
                  </div>

                  <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
                    <div className="text-sm text-slate-500">
                      Score: <span className="font-medium text-slate-700">{project.foundation_score || 0}</span>
                    </div>
                    <div className="text-sm text-slate-500">
                      {formatRelativeTime(project.updated_at)}
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        ) : (
          <Card className="text-center py-12">
            <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
              <Globe className="w-8 h-8 text-slate-400" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900 mb-2">No projects yet</h3>
            <p className="text-slate-600 mb-6">Create your first project to start auditing your website</p>
            <Link href="/onboarding">
              <Button>
                Create Your First Project
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
          </Card>
        )}
      </main>
    </div>
  );
}
