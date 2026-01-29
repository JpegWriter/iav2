import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { Header, Sidebar } from '@/components/layout';

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { projectId: string };
}) {
  const supabase = createServerSupabaseClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect('/login');
  }

  const { data: project } = await supabase
    .from('projects')
    .select('*')
    .eq('id', params.projectId)
    .eq('user_id', user.id)
    .single();

  if (!project) {
    redirect('/app');
  }

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <Sidebar 
        projectId={params.projectId} 
        growthUnlocked={project.growth_planner_unlocked} 
      />
      <div className="flex-1 flex flex-col">
        <Header user={{ email: user.email }} projectName={project.name} />
        <main className="flex-1 p-6 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
