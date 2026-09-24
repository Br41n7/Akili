'use client';
import { useState, useRef, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { MessageSquare, Send, Loader2, Bot } from 'lucide-react';
import toast from 'react-hot-toast';

interface Props { projectId: string; userId: string; region: string; persona: string; }
interface Message { role: 'user' | 'ai'; text: string; }

export default function AskAI({ projectId, userId, region, persona }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const send = async () => {
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    setMessages(p => [...p, { role: 'user', text: userMsg }]);
    setInput('');
    setLoading(true);

    try {
      const { data: docs } = await supabase.from('documents').select('content, name')
        .eq('project_id', projectId).eq('user_id', userId).limit(4);
      const context = docs?.map(d => `[${d.name}]\n${d.content}`).join('\n\n').slice(0, 8000) || '';

      const historyText = messages.slice(-6).map(m => `${m.role === 'user' ? 'Student' : 'AI'}: ${m.text}`).join('\n');

      const prompt = `You are an AI tutor. Answer the student's question using the project materials.

Project Materials:
${context || 'No materials uploaded yet.'}

Conversation so far:
${historyText}

Student question: ${userMsg}

Answer clearly and concisely. If the answer isn't in the materials, say so but still help.`;

      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task: 'notebook', prompt, region, persona, format: 'text' }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setMessages(p => [...p, { role: 'ai', text: data.result }]);
    } catch (err: any) {
      toast.error(err.message || 'AI request failed');
      setMessages(p => [...p, { role: 'ai', text: 'Sorry, something went wrong. Please try again.' }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full max-h-[calc(100vh-120px)]">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto no-scrollbar p-4 space-y-3">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center text-gray-400 space-y-2 py-12">
            <div className="w-14 h-14 bg-indigo-100 rounded-3xl flex items-center justify-center">
              <MessageSquare size={24} className="text-indigo-500" />
            </div>
            <p className="font-semibold">Ask anything about your materials</p>
            <p className="text-sm">I'll answer based on what you've uploaded</p>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
            {msg.role === 'ai' && (
              <div className="w-7 h-7 bg-indigo-100 rounded-full flex items-center justify-center shrink-0 mr-2 mt-1">
                <Bot size={14} className="text-indigo-600" />
              </div>
            )}
            <div className={cn('max-w-[80%] px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap',
              msg.role === 'user'
                ? 'bg-indigo-600 text-white rounded-br-sm'
                : 'bg-white border border-black/5 text-gray-800 rounded-bl-sm')}>
              {msg.text}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-indigo-100 rounded-full flex items-center justify-center">
              <Bot size={14} className="text-indigo-600" />
            </div>
            <div className="bg-white border border-black/5 px-4 py-3 rounded-2xl rounded-bl-sm">
              <div className="flex gap-1">
                {[0,1,2].map(i => (
                  <div key={i} className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="p-3 bg-white border-t border-black/8 flex items-end gap-2">
        <textarea value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder="Ask about your materials... (Enter to send)"
          rows={1} className="flex-1 px-4 py-3 rounded-2xl border border-gray-200 text-sm resize-none focus:outline-none focus:border-indigo-500 max-h-28" />
        <button onClick={send} disabled={!input.trim() || loading}
          className="w-11 h-11 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-2xl flex items-center justify-center shrink-0 transition-all">
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}
