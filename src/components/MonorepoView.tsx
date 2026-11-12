import { useEffect, useState } from 'react';
import { Check, Copy, FileCode2 } from 'lucide-react';
import type { MonorepoFile } from '../../packages/shared/src/types';

export function MonorepoView() {
  const [files, setFiles] = useState<MonorepoFile[]>([]);
  const [selectedPath, setSelectedPath] = useState<string>('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch('/api/monorepo')
      .then((r) => r.json())
      .then((data: { files: MonorepoFile[] }) => {
        setFiles(data.files || []);
        if (data.files?.length > 0) {
          setSelectedPath(data.files[0].path);
        }
      })
      .catch(() => {});
  }, []);

  const activeFile = files.find((f) => f.path === selectedPath) || files[0] || null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-[#F2EFE9]">
          Remus Monorepo Architecture
        </h1>
        <p className="text-sm text-[#9E9B93]">
          Shared SQLite schema and TypeScript contracts across Tauri v2 Desktop (Rust) and Expo Mobile (React Native)
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-4 rounded-xl border border-[#2A2A27] bg-[#161614] divide-y divide-[#232320] overflow-hidden">
          {files.map((file) => (
            <button
              key={file.path}
              type="button"
              onClick={() => setSelectedPath(file.path)}
              className={`w-full px-4 py-3 text-left flex items-center gap-3 transition-colors cursor-pointer ${
                activeFile?.path === file.path
                  ? 'bg-[#E06D2B]/10 text-[#F2EFE9]'
                  : 'text-[#9E9B93] hover:bg-[#1A1A18] hover:text-[#F2EFE9]'
              }`}
            >
              <FileCode2
                className={`w-4 h-4 shrink-0 ${
                  activeFile?.path === file.path ? 'text-[#E06D2B]' : 'text-[#706D66]'
                }`}
              />
              <div className="min-w-0">
                <div className="font-mono text-xs truncate">{file.path}</div>
                <div className="text-[11px] text-[#706D66] capitalize">{file.category}</div>
              </div>
            </button>
          ))}
        </div>

        <div className="lg:col-span-8 rounded-xl border border-[#2A2A27] bg-[#161614] overflow-hidden">
          {activeFile ? (
            <>
              <div className="px-4 py-3 border-b border-[#2A2A27] flex items-center justify-between">
                <span className="font-mono text-xs text-[#C9C5BC]">{activeFile.path}</span>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard?.writeText(activeFile.content);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1600);
                  }}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-[#2A2A27] text-xs text-[#C9C5BC] hover:text-[#F2EFE9] cursor-pointer"
                >
                  {copied ? (
                    <Check className="w-3.5 h-3.5 text-[#E06D2B]" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  <span>{copied ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
              <pre className="p-4 text-xs font-mono text-[#C9C5BC] overflow-x-auto max-h-[540px] leading-relaxed">
                <code>{activeFile.content}</code>
              </pre>
            </>
          ) : (
            <div className="p-8 text-sm text-[#9E9B93]">Loading monorepo files...</div>
          )}
        </div>
      </div>
    </div>
  );
}
