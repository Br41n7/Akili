'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { Plus, BookOpen, Zap, LogOut, Settings, GraduationCap, Loader2, Trash2, ExternalLink, BarChart3 } from 'lucide-react';
import toast from 'react-hot-toast';

interface Project {
  id: string; name: string; description: string;
  subject: string; exam_type: string; source: string;
  created_at: string;
}

export default function ProjectsPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newProject, setNewProject] = useState({ name: '', subject: '', exam_type: '' });

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/auth/login'); return; }
      setUser(user);

      const { data } = await supabase.from('projects').select('*')
        .eq('user_id', user.id).order('created_at', { ascending: false });
      setProjects((data as Project[]) || []);
      setLoading(false);
    }
    load();
  }, []);

  const createProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProject.name.trim()) return;
    setCreating(true);
    try {
      const { data, error } = await supabase.from('projects').insert({
        user_id: user.id,
        name: newProject.name,
        subject: newProject.subject,
        exam_type: newProject.exam_type,
        source: 'manual',
      }).select().single();
      if (error) throw error;
      setProjects(p => [data as Project, ...p]);
      setShowNewForm(false);
      setNewProject({ name: '', subject: '', exam_type: '' });
      router.push(`/projects/${data.id}`);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setCreating(false);
    }
  };

  const deleteProject = async (id: string) => {
    if (!confirm('Delete this project and all its content?')) return;
    await supabase.from('projects').delete().eq('id', id);
    setProjects(p => p.filter(pr => pr.id !== id));
    toast.success('Project deleted');
  };

  const signOut = async () => { await supabase.auth.signOut(); router.push('/'); };

  const EXAM_TYPES = ['WAEC', 'JAMB', 'NECO', 'KCSE', 'WASSCE', 'University / Self-study', 'Professional / Certification', 'OTHER'];
  const SUBJECTS = ['Mathematics', 'English Language', 'Biology', 'Chemistry', 'Physics', 'Economics', 'Government', 'Literature', 'Geography', 'History', 'Computer Science'];

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 size={28} className="animate-spin text-indigo-600" />
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F8F8F8]">
      <nav className="bg-white border-b border-black/8 px-6 py-4 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-indigo-600 rounded-xl flex items-center justify-center">
            <GraduationCap size={16} className="text-white" />
          </div>
          <span className="font-black text-lg">Akili</span>
        </div>
        <div className="flex items-center gap-2">
          <a href={process.env.NEXT_PUBLIC_PASTQ_URL || 'https://pastq.co'} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-sm text-green-600 font-semibold hover:underline">
            <Zap size={14} /> PastQ <ExternalLink size={12} />
          </a>
          <button onClick={signOut} className="p-2 text-gray-400 hover:text-gray-700">
            <LogOut size={17} />
          </button>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black">My Projects</h1>
            <p className="text-sm text-gray-500">Each project is a study workspace powered by AI</p>
          </div>
          <button onClick={() => setShowNewForm(true)}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl text-sm font-bold transition-all">
            <Plus size={15} /> New Project
          </button>
        </div>

        {/* New project form */}
        {showNewForm && (
          <form onSubmit={createProject} className="bg-white rounded-3xl p-6 border border-indigo-200 space-y-4">
            <h2 className="font-bold">Create New Project</h2>
            <input value={newProject.name} onChange={e => setNewProject(p => ({ ...p, name: e.target.value }))}
              required placeholder="Project name (e.g. Anatomy 200-level or WAEC Maths Prep)"
              className="w-full px-4 py-3 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:border-indigo-500" />
            <div className="grid grid-cols-2 gap-3">
              <select value={newProject.subject} onChange={e => setNewProject(p => ({ ...p, subject: e.target.value }))}
                className="px-4 py-3 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:border-indigo-500">
                <option value="">Subject (optional)</option>
                {SUBJECTS.map(s => <option key={s}>{s}</option>)}
              </select>
              <select value={newProject.exam_type} onChange={e => setNewProject(p => ({ ...p, exam_type: e.target.value }))}
                className="px-4 py-3 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:border-indigo-500">
                <option value="">Learning context (optional)</option>
                {EXAM_TYPES.map(e => <option key={e}>{e}</option>)}
              </select>
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={creating}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-5 py-2.5 rounded-xl text-sm font-bold">
                {creating ? <Loader2 size={14} className="animate-spin" /> : null} Create Project
              </button>
              <button type="button" onClick={() => setShowNewForm(false)} className="px-5 py-2.5 rounded-xl text-sm text-gray-500 hover:bg-gray-100">Cancel</button>
            </div>
          </form>
        )}

        {/* PastQ import banner */}
        <div className="bg-gradient-to-r from-green-500 to-emerald-600 rounded-3xl p-5 text-white flex items-center justify-between">
          <div>
            <p className="font-black">Have PastQ purchases?</p>
            <p className="text-sm text-green-100 mt-0.5">Import any question bank — AI builds a full course from it automatically</p>
          </div>
          <Link href="/import" className="flex items-center gap-2 bg-white text-green-700 px-4 py-2.5 rounded-xl text-sm font-black hover:bg-green-50 shrink-0 transition-all">
            <Zap size={15} /> Import from PastQ
          </Link>
        </div>

        {/* Projects grid */}
        {projects.length === 0 ? (
          <div className="bg-white rounded-3xl p-12 text-center border border-dashed border-gray-200">
            <BookOpen size={32} className="mx-auto text-gray-300 mb-3" />
            <p className="font-semibold text-gray-500">No projects yet</p>
            <p className="text-sm text-gray-400 mt-1">Create a project or import from PastQ to get started</p>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            {projects.map(p => (
              <div key={p.id} className="bg-white rounded-3xl p-5 border border-black/5 hover:border-indigo-200 transition-all group">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    {p.exam_type && <span className="text-[10px] font-bold bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">{p.exam_type}</span>}
                    {p.source === 'pastq' && <span className="text-[10px] font-bold bg-green-100 text-green-700 px-2 py-0.5 rounded-full">PastQ</span>}
                  </div>
                  <button onClick={() => deleteProject(p.id)} className="p-1.5 text-transparent group-hover:text-gray-300 hover:!text-rose-500 transition-all">
                    <Trash2 size={13} />
                  </button>
                </div>
                <h3 className="font-bold mb-1 line-clamp-1">{p.name}</h3>
                {p.description && <p className="text-xs text-gray-400 line-clamp-2 mb-3">{p.description}</p>}
                <p className="text-xs text-gray-400">{new Date(p.created_at).toLocaleDateString()}</p>
                <Link href={`/projects/${p.id}`}
                  className="mt-4 w-full flex items-center justify-center gap-2 py-2.5 bg-indigo-50 hover:bg-indigo-600 hover:text-white text-indigo-600 rounded-xl text-sm font-bold transition-all">
                  Open Project <BarChart3 size={14} />
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
