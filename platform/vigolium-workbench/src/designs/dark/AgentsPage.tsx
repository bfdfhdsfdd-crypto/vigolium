'use client';

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Square, Send, Bot, Terminal, Clock, CheckCircle, XCircle, Loader2, Zap, Layers, Bug, ScrollText, Copy, Check, Upload, ChevronDown, Play, Settings2, Crosshair, Scale, ShieldCheck } from 'lucide-react';
import type { AgentSession, AgentSessionDetail } from '@/api/types';
import { agentStatusTone, type AgentStatusTone } from '@/api/types';
import { formatDate, formatDuration, truncate } from '@/lib/formatters';
import PageShell from './PageShell';
import Dropdown from './Dropdown';
import { useAgentsLogic, AGENT_OPTIONS, AUDIT_PREP_MODE_OPTIONS, INTENSITY_OPTIONS, AUDIT_MODE_OPTIONS, type DetectedInputType } from '@/hooks/useAgentsLogic';

const INPUT_TYPE_LABELS: Record<DetectedInputType, { label: string; color: string }> = {
  url: { label: 'URL', color: '#7fd962' },
  raw: { label: '原始 HTTP 请求', color: '#68a8e4' },
  curl: { label: 'curl 请求', color: '#d8a657' },
  empty: { label: '', color: '#918175' },
};

const STATUS_ICON: Record<string, typeof CheckCircle> = {
  completed: CheckCircle,
  error: XCircle,
  running: Loader2,
};

const STATUS_TONE_COLOR: Record<AgentStatusTone, string> = {
  ok: '#7fd962', warn: '#f2c55c', fail: '#ef2f27', running: '#68a8e4', idle: '#918175',
};

function StatusBadge({ status }: { status: string }) {
  const Icon = STATUS_ICON[status] || Clock;
  const color = STATUS_TONE_COLOR[agentStatusTone(status)];
  const labels: Record<string, string> = {
    completed: '已完成',
    error: '失败',
    failed: '失败',
    running: '运行中',
    pending: '等待中',
    queued: '排队中',
    cancelled: '已取消',
    canceled: '已取消',
    paused: '已暂停',
    stopped: '已停止',
  };
  return (
    <span className="flex items-center gap-1 text-xs font-bold" style={{ color }}>
      <Icon className={`w-3 h-3 ${status === 'running' ? 'animate-spin' : ''}`} />
      {labels[status.toLowerCase()] ?? status}
    </span>
  );
}

function tryPrettyJson(s: string | undefined): string {
  if (!s) return '';
  try { return JSON.stringify(JSON.parse(s), null, 2); } catch { return s; }
}

function SessionDetailPanel({ session, onClose }: { session: AgentSessionDetail; onClose: () => void }) {
  const [copied, setCopied] = useState<string | null>(null);
  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    });
  };

  return (
    <div className="border-l border-[#2e2b26] flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#2e2b26] shrink-0">
        <span className="text-xs font-bold text-[#7fd962]">会话详情</span>
        <button onClick={onClose} className="text-[#918175] hover:text-[#fce8c3] text-xs font-bold px-1">&#10005;</button>
      </div>
      <div className="shrink-0 border-b border-[#2e2b26] px-3 py-2 text-xs space-y-1">
        <div className="text-[#68a8e4] font-mono break-all">{session.uuid}</div>
        <div className="flex flex-wrap gap-x-4 gap-y-0.5">
          <span><span className="text-[#918175]">状态 </span><StatusBadge status={session.status} /></span>
          <span><span className="text-[#918175]">模式 </span><span className="text-[#fce8c3]">{session.mode}</span></span>
          <span><span className="text-[#918175]">代理 </span><span className="text-[#fce8c3]">{session.agent_name}</span></span>
          {session.input_type && <span><span className="text-[#918175]">输入类型 </span><span className="text-[#fce8c3]">{session.input_type}</span></span>}
        </div>
        {session.target_url && (
          <div><span className="text-[#918175]">目标 </span><span className="text-[#fce8c3] break-all">{session.target_url}</span></div>
        )}
        <div className="flex flex-wrap gap-x-4 gap-y-0.5">
          <span><span className="text-[#918175]">漏洞数 </span><span className="text-[#fce8c3]">{session.finding_count}</span></span>
          <span><span className="text-[#918175]">记录数 </span><span className="text-[#fce8c3]">{session.record_count}</span></span>
          <span><span className="text-[#918175]">已保存 </span><span className="text-[#98bc37]">{session.saved_count}</span></span>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-0.5">
          <span><span className="text-[#918175]">耗时 </span><span className="text-[#fce8c3]">{formatDuration(session.duration_ms)}</span></span>
          <span><span className="text-[#918175]">开始时间 </span><span className="text-[#fce8c3]">{formatDate(session.started_at)}</span></span>
          {session.completed_at && <span><span className="text-[#918175]">完成时间 </span><span className="text-[#fce8c3]">{formatDate(session.completed_at)}</span></span>}
        </div>
        {session.phases_run && session.phases_run.length > 0 && (
          <div><span className="text-[#918175]">扫描阶段 </span><span className="text-[#fce8c3]">{session.phases_run.join(' \u2192 ')}</span></div>
        )}
        {session.error_message && (
          <div className="whitespace-pre-wrap break-words" style={{ color: STATUS_TONE_COLOR[agentStatusTone(session.status) === 'fail' ? 'fail' : 'warn'] }}>
            <span className="font-bold">{agentStatusTone(session.status) === 'fail' ? 'error ' : 'warnings '}</span>{session.error_message}
          </div>
        )}
        {session.module_names && session.module_names.length > 0 && (
          <div><span className="text-[#918175]">模块 </span><span className="text-[#fce8c3]">{session.module_names.join(', ')}</span></div>
        )}
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto text-xs">
        {session.prompt_sent && (
          <details className="border-b border-[#2e2b26]">
            <summary className="px-3 py-1.5 cursor-pointer text-[#7fd962] font-bold hover:bg-[#2e2b26] flex items-center gap-1.5">
              <Terminal className="w-3 h-3" />PROMPT
            </summary>
            <div className="relative">
              <button onClick={() => copyToClipboard(session.prompt_sent!, 'prompt')} className="absolute top-1.5 right-2 text-[#918175] hover:text-[#fce8c3] p-0.5" title="复制到剪贴板">
                {copied === 'prompt' ? <Check className="w-3.5 h-3.5 text-[#98bc37]" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
              <pre className="px-3 py-2 bg-[#141310] text-[#fce8c3] whitespace-pre-wrap break-all font-mono overflow-x-auto">{session.prompt_sent}</pre>
            </div>
          </details>
        )}
        {session.agent_raw_output && (
          <details open className="border-b border-[#2e2b26]">
            <summary className="px-3 py-1.5 cursor-pointer text-[#7fd962] font-bold hover:bg-[#2e2b26] flex items-center gap-1.5">
              <ScrollText className="w-3 h-3" />RAW OUTPUT
            </summary>
            <div className="relative">
              <button onClick={() => copyToClipboard(session.agent_raw_output!, 'output')} className="absolute top-1.5 right-2 z-10 text-[#918175] hover:text-[#fce8c3] p-0.5" title="复制到剪贴板">
                {copied === 'output' ? <Check className="w-3.5 h-3.5 text-[#98bc37]" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
              {/* ANSI-stripped terminal output, not Markdown: parsing up to 200 KB
                  of it on every re-render stalled the page. */}
              <pre className="px-3 py-2 bg-[#141310] text-[#fce8c3] whitespace-pre-wrap break-words font-mono overflow-x-auto">{session.agent_raw_output}</pre>
            </div>
          </details>
        )}
        {session.attack_plan && (
          <details open className="border-b border-[#2e2b26]">
            <summary className="px-3 py-1.5 cursor-pointer text-[#7fd962] font-bold hover:bg-[#2e2b26] flex items-center gap-1.5">
              <Zap className="w-3 h-3" />ATTACK PLAN
            </summary>
            <div className="relative">
              <button onClick={() => copyToClipboard(tryPrettyJson(session.attack_plan), 'plan')} className="absolute top-1.5 right-2 z-10 text-[#918175] hover:text-[#fce8c3] p-0.5" title="复制到剪贴板">
                {copied === 'plan' ? <Check className="w-3.5 h-3.5 text-[#98bc37]" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
              <div className="px-3 py-2 bg-[#141310] text-[#fce8c3] overflow-x-auto prose prose-xs prose-invert max-w-none [&_pre]:bg-[#0c0b09] [&_pre]:p-2 [&_pre]:text-xs [&_pre]:rounded [&_code]:text-[#98bc37] [&_p]:m-0 [&_p]:mb-1.5 [&_h1]:text-sm [&_h2]:text-sm [&_h3]:text-xs [&_h1]:mt-2 [&_h2]:mt-2 [&_h3]:mt-1 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0">
                <ReactMarkdown>{tryPrettyJson(session.attack_plan)}</ReactMarkdown>
              </div>
            </div>
          </details>
        )}
        {session.triage_result && (
          <details className="border-b border-[#2e2b26]">
            <summary className="px-3 py-1.5 cursor-pointer text-[#7fd962] font-bold hover:bg-[#2e2b26] flex items-center gap-1.5">
              <Bug className="w-3 h-3" />TRIAGE RESULT
            </summary>
            <div className="relative">
              <button onClick={() => copyToClipboard(tryPrettyJson(session.triage_result), 'triage')} className="absolute top-1.5 right-2 text-[#918175] hover:text-[#fce8c3] p-0.5" title="复制到剪贴板">
                {copied === 'triage' ? <Check className="w-3.5 h-3.5 text-[#98bc37]" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
              <pre className="px-3 py-2 bg-[#141310] text-[#fce8c3] whitespace-pre-wrap break-all font-mono overflow-x-auto">{tryPrettyJson(session.triage_result)}</pre>
            </div>
          </details>
        )}
      </div>
    </div>
  );
}

export default function AgentsPage() {
  const h = useAgentsLogic();

  const inputClass = 'bg-[#141310] border border-[#2e2b26] text-[#fce8c3] text-xs px-2 py-1 focus:outline-none focus:border-[#7fd962]/50 w-full';
  const modeBtnClass = (active: boolean) =>
    `px-3 py-0.5 text-xs font-bold transition-colors ${active ? 'text-[#7fd962] bg-[#7fd962]/10' : 'text-[#918175] hover:text-[#fce8c3]'}`;

  return (
    <PageShell>
      <div className="flex flex-col flex-1 min-h-0" style={{ minHeight: 500 }}>

        {/* ── Top: Config (full width) ── */}
        <div className="shrink-0 border border-[#2e2b26] bg-[#1c1b19] flex flex-col overflow-hidden">
          {/* Header with scan button */}
          <div className="px-3 py-2 border-b border-[#2e2b26] shrink-0 flex items-center justify-between">
            <h2 className="text-[#7fd962] text-xs font-bold tracking-wide">智能代理扫描</h2>
            {h.isScanStreaming && (
              <span className="text-xs text-[#68a8e4] flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> streaming...</span>
            )}
          </div>

          <div className="overflow-y-auto px-3 py-2 space-y-3">
            {/* Target + GitHub/Upload — same row */}
            <div className="grid grid-cols-3 gap-2 items-stretch">
              {/* Target input — 2/3 */}
              <div className="col-span-2 flex flex-col">
                <div className="flex items-center gap-1.5 mb-0.5" style={{ minHeight: '1.25rem' }}>
                  <button
                    onClick={() => h.setTargetInputTab('target')}
                    className={`text-xs font-bold transition-colors ${h.targetInputTab === 'target' ? 'text-[#7fd962]' : 'text-[#918175] hover:text-[#fce8c3]'}`}
                  >目标</button>
                  <span className="text-[#2e2b26]">|</span>
                  <button
                    onClick={() => h.setTargetInputTab('prompt')}
                    className={`text-xs font-bold transition-colors flex items-center gap-1 ${h.targetInputTab === 'prompt' ? 'text-[#7fd962]' : 'text-[#918175] hover:text-[#fce8c3]'}`}
                  ><Crosshair className="w-3 h-3" />提示词</button>
                  {h.targetInputTab === 'target' ? (
                    <span className="text-[10px]" style={{ color: INPUT_TYPE_LABELS[h.detectedInputType].color }}>
                      (type: {h.detectedInputType === 'empty' ? 'url' : h.detectedInputType === 'raw' ? 'raw request' : h.detectedInputType})
                    </span>
                  ) : (
                    <span className="text-[10px] text-[#d8a657]">(自然语言)</span>
                  )}
                </div>
                {h.targetInputTab === 'target' ? (
                  <>
                    <textarea
                      value={h.targetUrl}
                      onChange={(e) => h.setTargetUrl(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey && h.detectedInputType === 'url') {
                          e.preventDefault();
                          h.handleProfileSubmit();
                        }
                      }}
                      placeholder={"https://example.com/api/endpoint\n\nor paste a raw HTTP request / curl command"}
                      rows={Math.max(4, Math.min(20, h.targetUrl.split('\n').length + 1))}
                      className={`${inputClass} !text-xs !py-1.5 font-mono resize-y whitespace-pre-wrap break-all flex-1`}
                    />
                    {h.scanError && <p className="text-xs text-[#ef2f27] mt-1">{h.scanError}</p>}
                  </>
                ) : (
                  <>
                    <textarea
                      value={h.targetPrompt}
                      onChange={(e) => h.setTargetPrompt(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          h.handleTargetSubmit();
                        }
                      }}
                      placeholder="扫描 localhost:3000，检查是否存在认证绕过漏洞"
                      rows={Math.max(4, Math.min(20, h.targetPrompt.split('\n').length + 1))}
                      className={`${inputClass} !text-xs !py-1.5 font-mono resize-y whitespace-pre-wrap break-all flex-1`}
                    />
                    {h.targetError && <p className="text-xs text-[#ef2f27] mt-1">{h.targetError}</p>}
                    {h.targetRunStatus?.error && <p className="text-xs text-[#ef2f27] mt-1">{h.targetRunStatus.error}</p>}
                  </>
                )}
              </div>
              {/* Source upload — 1/3 */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[#918175] text-xs mb-0.5">源代码</label>
                <div
                  onDragEnter={h.onUploadDragEnter} onDragLeave={h.onUploadDragLeave} onDragOver={h.onUploadDragOver} onDrop={h.onUploadDrop}
                  className={`border border-dashed p-2 text-center transition-colors flex-1 flex flex-col items-center justify-center gap-0.5 ${h.uploadCompressing || h.uploadRepo.isPending ? '' : 'cursor-pointer'} ${h.uploadDragging ? 'border-[#7fd962] bg-[#7fd962]/10' : h.activeSource ? 'border-[#98bc37] bg-[#98bc37]/5' : 'border-[#2e2b26] hover:border-[#7fd962]/50'}`}
                  onClick={() => { if (!h.uploadCompressing && !h.uploadRepo.isPending) h.uploadFileInputRef.current?.click(); }}
                >
                  <input ref={h.uploadFileInputRef} type="file" accept=".zip,.tar.gz,.tgz,.tar" onChange={h.handleFileUpload} className="hidden" />
                  {h.uploadCompressing || h.uploadRepo.isPending ? (
                    <div className="flex items-center justify-center gap-1.5"><Loader2 className="w-3.5 h-3.5 text-[#7fd962] animate-spin" /><span className="text-[10px] text-[#fce8c3]">{h.uploadCompressing ? 'Compressing...' : 'Uploading...'}</span></div>
                  ) : (
                    <div className="flex items-center justify-center gap-1.5"><Upload className="w-3.5 h-3.5 text-[#7fd962]/70" /><span className="text-[10px] text-[#fce8c3]">{h.uploadDragging ? 'Drop here' : 'Upload source code'}</span></div>
                  )}
                  <p className="text-[9px] text-[#918175]">.zip、.tar.gz 压缩包或文件夹 — 最大 500 MB</p>
                  {h.activeSource && (
                    <p className="text-[9px] text-[#918175] truncate max-w-full px-2" title={h.activeSource.includes('x-access-token') ? 'Authenticated clone URL' : h.activeSource}>
                      {h.activeSource.includes('x-access-token') ? h.activeSource.replace(/https:\/\/x-access-token:[^@]+@/, 'https://') : h.activeSource}
                    </p>
                  )}
                  {h.uploadRepo.isSuccess && <p className="text-[9px] text-[#98bc37]">已上传</p>}
                  {h.uploadRepo.isError && <p className="text-[9px] text-[#ef2f27]">失败</p>}
                </div>
              </div>
            </div>

            {/* Scanning Mode */}
            <div>
              <label className="text-[#918175] text-xs block mb-1">扫描模式</label>
              {/* Top-level mode selector */}
              <div className="grid grid-cols-3 gap-0">
                <button
                  onClick={() => h.setScanProfile('autopilot')}
                  className={`px-3 py-2 text-center border transition-colors ${
                    h.scanProfile === 'autopilot'
                      ? 'border-[#6bb856] bg-[#6bb856]/8'
                      : 'border-[#2e2b26] hover:border-[#918175] hover:bg-[#2e2b26]/30'
                  }`}
                >
                  <div className="flex items-center justify-center gap-1.5 mb-0.5">
                    <Bot className={`w-3 h-3 ${h.scanProfile === 'autopilot' ? 'text-[#6bb856]' : 'text-[#918175]'}`} />
                    <span className={`text-xs font-bold ${h.scanProfile === 'autopilot' ? 'text-[#6bb856]' : 'text-[#fce8c3]'}`}>自动驾驶</span>
                  </div>
                  <p className="text-[10px] text-[#706560] leading-tight">AI 代理将自主操作命令行，探索目标、执行扫描并迭代分析发现。</p>
                </button>
                <button
                  onClick={() => { if (h.scanProfile !== 'quick') h.setScanProfile('quick'); }}
                  className={`px-3 py-2 text-center border transition-colors ${
                    h.scanProfile === 'quick'
                      ? 'border-[#6bb856] bg-[#6bb856]/8'
                      : 'border-[#2e2b26] hover:border-[#918175] hover:bg-[#2e2b26]/30'
                  }`}
                >
                  <div className="flex items-center justify-center gap-1.5 mb-0.5">
                    <Bug className={`w-3 h-3 ${h.scanProfile === 'quick' ? 'text-[#6bb856]' : 'text-[#918175]'}`} />
                    <span className={`text-xs font-bold ${h.scanProfile === 'quick' ? 'text-[#6bb856]' : 'text-[#fce8c3]'}`}>协同扫描</span>
                  </div>
                  <p className="text-[10px] text-[#706560] leading-tight">由 AI 引导并可选择模块的定向漏洞扫描。</p>
                </button>
                <button
                  onClick={() => h.setScanProfile('audit')}
                  className={`px-3 py-2 text-center border transition-colors ${
                    h.scanProfile === 'audit'
                      ? 'border-[#6bb856] bg-[#6bb856]/8'
                      : 'border-[#2e2b26] hover:border-[#918175] hover:bg-[#2e2b26]/30'
                  }`}
                >
                  <div className="flex items-center justify-center gap-1.5 mb-0.5">
                    <ShieldCheck className={`w-3 h-3 ${h.scanProfile === 'audit' ? 'text-[#6bb856]' : 'text-[#918175]'}`} />
                    <span className={`text-xs font-bold ${h.scanProfile === 'audit' ? 'text-[#6bb856]' : 'text-[#fce8c3]'}`}>审计</span>
                  </div>
                  <p className="text-[10px] text-[#706560] leading-tight">通过 piolium 测试框架执行全面的源代码安全审计。</p>
                </button>
              </div>
            </div>

            {/* Intensity */}
            <div>
              <label className="text-[#918175] text-xs block mb-1">扫描强度等级</label>
              <div className="grid grid-cols-3 gap-0">
                {INTENSITY_OPTIONS.filter((o) => o.value !== '').map((o) => {
                  const currentIntensity = h.scanProfile === 'autopilot' ? h.autopilotIntensity : h.scanProfile === 'audit' ? h.auditIntensity : h.swarmIntensity;
                  const active = currentIntensity === o.value || (!currentIntensity && o.value === 'balanced');
                  const Icon = o.icon === 'zap' ? Zap : o.icon === 'scale' ? Scale : Layers;
                  return (
                    <button
                      key={o.value}
                      onClick={() => { h.setSwarmIntensity(o.value); h.setAutopilotIntensity(o.value); h.setAuditIntensity(o.value); }}
                      className={`px-3 py-2 text-center border transition-colors ${
                        active
                          ? 'border-[#68a8e4] bg-[#68a8e4]/10'
                          : 'border-[#2e2b26] hover:border-[#918175] hover:bg-[#2e2b26]/30'
                      }`}
                    >
                      <div className="flex items-center justify-center gap-1.5 mb-0.5">
                        <Icon className={`w-3 h-3 ${active ? 'text-[#68a8e4]' : 'text-[#918175]'}`} />
                        <span className={`text-xs font-bold ${active ? 'text-[#68a8e4]' : 'text-[#fce8c3]'}`}>{o.label}</span>
                      </div>
                      {o.description && <p className="text-[10px] text-[#706560] leading-tight">{o.description}</p>}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Start Scan / Stop + Advanced toggle */}
            <div className="flex items-center gap-2">
              {h.targetInputTab === 'prompt' ? (
                <button
                  onClick={h.handleTargetSubmit}
                  disabled={!h.targetPrompt.trim() || h.startAutopilotRun.isPending}
                  className="px-4 py-1 text-xs font-bold border border-[#FF9F2F] text-[#FF9F2F] bg-[#FF9F2F]/10 hover:bg-[#FF9F2F]/20 shadow-[inset_0_0_18px_rgba(255,159,47,0.5)] hover:shadow-[inset_0_0_28px_rgba(255,159,47,0.7)] transition-colors disabled:opacity-30 flex items-center gap-1.5"
                >
                  {h.startAutopilotRun.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  {h.startAutopilotRun.isPending ? 'SUBMITTING...' : 'START SCAN'}
                </button>
              ) : !h.isScanStreaming ? (
                <button
                  onClick={h.handleProfileSubmit}
                  disabled={h.scanProfile === 'audit' ? !h.activeSource : (!h.targetUrl.trim() && !h.activeSource)}
                  className="px-4 py-1 text-xs font-bold border border-[#FF9F2F] text-[#FF9F2F] bg-[#FF9F2F]/10 hover:bg-[#FF9F2F]/20 shadow-[inset_0_0_18px_rgba(255,159,47,0.5)] hover:shadow-[inset_0_0_28px_rgba(255,159,47,0.7)] transition-colors disabled:opacity-30 flex items-center gap-1.5"
                >
                  <Play className="w-3.5 h-3.5" /> START SCAN
                </button>
              ) : (
                <button
                  onClick={h.handleScanCancel}
                  className="px-4 py-1 text-xs font-bold bg-[#ef2f27]/10 text-[#ef2f27] border border-[#ef2f27]/30 hover:bg-[#ef2f27]/20 transition-colors flex items-center gap-1.5"
                >
                  <Square className="w-3 h-3" /> STOP
                </button>
              )}
              <button
                onClick={() => h.setShowAdvanced(!h.showAdvanced)}
                className={`px-3 py-1 text-xs font-bold border flex items-center gap-1 transition-colors ${
                  h.showAdvanced
                    ? 'border-[#918175] bg-[#918175]/10 text-[#918175]'
                    : 'border-[#2e2b26] text-[#706560] hover:border-[#918175] hover:text-[#918175]'
                }`}
              >
                <Settings2 className="w-3 h-3" /> ADVANCED
              </button>
              {h.targetInputTab === 'prompt' && h.targetRunId && h.targetRunStatus && (
                <span className="flex items-center gap-1.5 text-xs">
                  <span className="text-[#918175]">运行次数</span>
                  <span className="text-[#68a8e4] font-mono">{h.targetRunId.slice(0, 12)}</span>
                  <StatusBadge status={h.targetRunStatus.status} />
                  {h.targetRunStatus.current_phase && <span className="text-[#fce8c3]">{h.targetRunStatus.current_phase}</span>}
                  {h.targetRunStatus.finding_count > 0 && <span className="text-[#7fd962] font-bold">{h.targetRunStatus.finding_count} findings</span>}
                </span>
              )}
            </div>

            {/* Advanced Options */}
            {h.showAdvanced && (
              <div className="mt-2 space-y-2">
                {/* Swarm options (default mode) */}
                {h.advancedMode === 'swarm' && (
                  <div className="space-y-1.5">
                    <div className="grid grid-cols-4 gap-1.5">
                      <div>
                        <label className="text-[#918175] text-[10px] block mb-0.5">模块标签</label>
                        <input value={h.swarmModuleTags} onChange={(e) => h.setSwarmModuleTags(e.target.value)} placeholder="例如 xss、sqli" className={inputClass} />
                      </div>
                      <div>
                        <label className="text-[#918175] text-[10px] block mb-0.5">漏洞类型</label>
                        <input value={h.swarmVulnType} onChange={(e) => h.setSwarmVulnType(e.target.value)} placeholder="例如 sqli" className={inputClass} />
                      </div>
                      <div>
                        <label className="text-[#918175] text-[10px] block mb-0.5">最大迭代次数</label>
                        <input value={h.swarmMaxIterations} onChange={(e) => h.setSwarmMaxIterations(e.target.value)} placeholder="3" className={inputClass} />
                      </div>
                      <div>
                        <label className="text-[#918175] text-[10px] block mb-0.5">超时时间</label>
                        <input value={h.swarmTimeout} onChange={(e) => h.setSwarmTimeout(e.target.value)} placeholder="30m" className={inputClass} />
                      </div>
                    </div>
                    <div>
                      <label className="text-[#918175] text-[10px] block mb-0.5">指令</label>
                      <textarea value={h.swarmInstruction} onChange={(e) => h.setSwarmInstruction(e.target.value)} placeholder="重点检查业务逻辑漏洞..." rows={2} className={`${inputClass} resize-y`} />
                    </div>
                    <div className="grid grid-cols-4 gap-1.5">
                      <div>
                        <label className="text-[#918175] text-[10px] block mb-0.5">关注重点</label>
                        <input value={h.swarmFocus} onChange={(e) => h.setSwarmFocus(e.target.value)} placeholder="认证绕过" className={inputClass} />
                      </div>
                      <div>
                        <label className="text-[#918175] text-[10px] block mb-0.5">扫描配置</label>
                        <input value={h.swarmProfile} onChange={(e) => h.setSwarmProfile(e.target.value)} placeholder="全面扫描" className={inputClass} />
                      </div>
                      <div>
                        <label className="text-[#918175] text-[10px] block mb-0.5">代码差异</label>
                        <input value={h.swarmDiff} onChange={(e) => h.setSwarmDiff(e.target.value)} placeholder="PR URL 或 main...branch" className={inputClass} />
                      </div>
                      <div>
                        <label className="text-[#918175] text-[10px] block mb-0.5">扫描强度</label>
                        <Dropdown value={h.swarmIntensity} onChange={h.setSwarmIntensity} options={INTENSITY_OPTIONS} />
                      </div>
                      <div>
                        <label className="text-[#918175] text-[10px] block mb-0.5">Vigolium 审计模式</label>
                        <Dropdown value={h.swarmAudit} onChange={h.setSwarmAudit} options={AUDIT_PREP_MODE_OPTIONS} />
                      </div>
                    </div>
                    <div className="flex flex-wrap items-end gap-1">
                      {([
                        ['Discover', h.swarmDiscover, h.setSwarmDiscover] as const,
                        ['Source Only', h.swarmSourceAnalysisOnly, h.setSwarmSourceAnalysisOnly] as const,
                        ['Code Audit', h.swarmCodeAudit, h.setSwarmCodeAudit] as const,
                        ['Triage', h.swarmTriage, h.setSwarmTriage] as const,
                        ['Show Prompt', h.swarmShowPrompt, h.setSwarmShowPrompt] as const,
                        ['Dry Run', h.swarmDryRun, h.setSwarmDryRun] as const,
                      ]).map(([label, value, setter]) => (
                        <button key={label} type="button" onClick={() => setter(!value)}
                          className={`px-2.5 py-1 text-xs font-bold border transition-colors ${
                            value
                              ? 'border-[#7fd962] bg-[#7fd962]/15 text-[#7fd962]'
                              : 'border-[#2e2b26] text-[#918175] hover:border-[#918175]'
                          }`}
                        >{label}</button>
                      ))}
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                      <div>
                        <label className="text-[#918175] text-[10px] block mb-0.5">仅执行阶段</label>
                        <input value={h.swarmOnlyPhase} onChange={(e) => h.setSwarmOnlyPhase(e.target.value)} placeholder="plan（计划阶段）" className={inputClass} />
                      </div>
                      <div>
                        <label className="text-[#918175] text-[10px] block mb-0.5">跳过阶段 <span className="text-[#706560] italic">逗号分隔</span></label>
                        <input value={h.swarmSkipPhases} onChange={(e) => h.setSwarmSkipPhases(e.target.value)} placeholder="triage、native-rescan" className={inputClass} />
                      </div>
                      <div>
                        <label className="text-[#918175] text-[10px] block mb-0.5">起始阶段</label>
                        <input value={h.swarmStartFrom} onChange={(e) => h.setSwarmStartFrom(e.target.value)} placeholder="triage（分流阶段）" className={inputClass} />
                      </div>
                    </div>
                  </div>
                )}

                {/* Autopilot options */}
                {h.advancedMode === 'autopilot' && (
                  <div className="space-y-1.5">
                    <div className="grid grid-cols-4 gap-1.5">
                      <div>
                        <label className="text-[#918175] text-[10px] block mb-0.5">代理</label>
                        <Dropdown value={h.autopilotAgent} onChange={h.setAutopilotAgent} options={AGENT_OPTIONS} />
                      </div>
                      <div>
                        <label className="text-[#918175] text-[10px] block mb-0.5">关注重点</label>
                        <input value={h.autopilotFocus} onChange={(e) => h.setAutopilotFocus(e.target.value)} placeholder="auth、api" className={inputClass} />
                      </div>
                      <div>
                        <label className="text-[#918175] text-[10px] block mb-0.5">超时时间</label>
                        <input value={h.autopilotTimeout} onChange={(e) => h.setAutopilotTimeout(e.target.value)} placeholder="30m" className={inputClass} />
                      </div>
                      <div>
                        <label className="text-[#918175] text-[10px] block mb-0.5">最大命令数</label>
                        <input value={h.autopilotMaxCommands} onChange={(e) => h.setAutopilotMaxCommands(e.target.value)} placeholder="50" className={inputClass} />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                      <div>
                        <label className="text-[#918175] text-[10px] block mb-0.5">来源</label>
                        <input value={h.autopilotSource} onChange={(e) => h.setAutopilotSource(e.target.value)} placeholder="Git URL 或本地路径" className={inputClass} />
                      </div>
                      <div>
                        <label className="text-[#918175] text-[10px] block mb-0.5">代码差异</label>
                        <input value={h.autopilotDiff} onChange={(e) => h.setAutopilotDiff(e.target.value)} placeholder="PR URL 或 main...branch" className={inputClass} />
                      </div>
                      <div>
                        <label className="text-[#918175] text-[10px] block mb-0.5">扫描强度</label>
                        <Dropdown value={h.autopilotIntensity} onChange={h.setAutopilotIntensity} options={INTENSITY_OPTIONS} />
                      </div>
                      <div>
                        <label className="text-[#918175] text-[10px] block mb-0.5">Vigolium 审计模式</label>
                        <Dropdown value={h.autopilotAuditMode} onChange={h.setAutopilotAuditMode} options={AUDIT_PREP_MODE_OPTIONS} />
                      </div>
                    </div>
                    <div>
                      <label className="text-[#918175] text-[10px] block mb-0.5">指令</label>
                      <textarea value={h.autopilotInstruction} onChange={(e) => h.setAutopilotInstruction(e.target.value)} placeholder="输入代理的自定义指令..." rows={2} className={`${inputClass} resize-y`} />
                    </div>
                    <div className="flex items-center gap-1">
                      {([
                        ['Dry Run', h.autopilotDryRun, h.setAutopilotDryRun] as const,
                        ['Skip Audit', h.autopilotNoAudit, h.setAutopilotNoAudit] as const,
                      ]).map(([label, value, setter]) => (
                        <button key={label} type="button" onClick={() => setter(!value)}
                          className={`px-2 py-0.5 text-[9px] font-bold border transition-colors ${
                            value
                              ? 'border-[#7fd962] bg-[#7fd962]/15 text-[#7fd962]'
                              : 'border-[#2e2b26] text-[#918175] hover:border-[#918175]'
                          }`}
                        >{label}</button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Audit options */}
                {h.advancedMode === 'audit' && (
                  <div className="space-y-1.5">
                    <div className="grid grid-cols-4 gap-1.5">
                      <div>
                        <label className="text-[#918175] text-[10px] block mb-0.5">模式</label>
                        <Dropdown value={h.auditMode} onChange={h.setAuditMode} options={AUDIT_MODE_OPTIONS} />
                      </div>
                      <div>
                        <label className="text-[#918175] text-[10px] block mb-0.5">扫描强度</label>
                        <Dropdown value={h.auditIntensity} onChange={h.setAuditIntensity} options={INTENSITY_OPTIONS} />
                      </div>
                      <div>
                        <label className="text-[#918175] text-[10px] block mb-0.5">超时时间</label>
                        <input value={h.auditTimeout} onChange={(e) => h.setAuditTimeout(e.target.value)} placeholder="2h" className={inputClass} />
                      </div>
                      <div>
                        <label className="text-[#918175] text-[10px] block mb-0.5">提交深度</label>
                        <input value={h.auditCommitDepth} onChange={(e) => h.setAuditCommitDepth(e.target.value)} placeholder="0" className={inputClass} />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                      <div>
                        <label className="text-[#918175] text-[10px] block mb-0.5">代码差异</label>
                        <input value={h.auditDiff} onChange={(e) => h.setAuditDiff(e.target.value)} placeholder="PR URL 或 HEAD~3" className={inputClass} />
                      </div>
                      <div>
                        <label className="text-[#918175] text-[10px] block mb-0.5">最近提交数</label>
                        <input value={h.auditLastCommits} onChange={(e) => h.setAuditLastCommits(e.target.value)} placeholder="5" className={inputClass} />
                      </div>
                      <div>
                        <label className="text-[#918175] text-[10px] block mb-0.5">文件 <span className="text-[#706560] italic">逗号分隔</span></label>
                        <input value={h.auditFiles} onChange={(e) => h.setAuditFiles(e.target.value)} placeholder="src/main.go、src/auth.go" className={inputClass} />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                      <div>
                        <label className="text-[#918175] text-[10px] block mb-0.5">Pi 服务提供方</label>
                        <input value={h.auditPiProvider} onChange={(e) => h.setAuditPiProvider(e.target.value)} placeholder="vertex-anthropic" className={inputClass} />
                      </div>
                      <div>
                        <label className="text-[#918175] text-[10px] block mb-0.5">Pi 模型</label>
                        <input value={h.auditPiModel} onChange={(e) => h.setAuditPiModel(e.target.value)} placeholder="claude-opus-4-6" className={inputClass} />
                      </div>
                      <div>
                        <label className="text-[#918175] text-[10px] block mb-0.5">源码 <span className="text-[#706560] italic">Git URL 或本地路径</span></label>
                        <input value={h.auditSource} onChange={(e) => h.setAuditSource(e.target.value)} placeholder="git@github.com:org/repo.git" className={inputClass} />
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {([
                        ['Upload Results', h.auditUploadResults, h.setAuditUploadResults] as const,
                      ]).map(([label, value, setter]) => (
                        <button key={label} type="button" onClick={() => setter(!value)}
                          className={`px-2.5 py-1 text-xs font-bold border transition-colors ${
                            value
                              ? 'border-[#7fd962] bg-[#7fd962]/15 text-[#7fd962]'
                              : 'border-[#2e2b26] text-[#918175] hover:border-[#918175]'
                          }`}
                        >{label}</button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Query options */}
                {h.advancedMode === 'query' && (
                  <div className="space-y-2">
                    <div className="flex border border-[#2e2b26]">
                      <button onClick={() => h.setScanMode('template')} className={modeBtnClass(h.scanMode === 'template')}>模板</button>
                      <button onClick={() => h.setScanMode('custom')} className={modeBtnClass(h.scanMode === 'custom')}>自定义</button>
                    </div>
                    {h.scanMode === 'template' ? (
                      <>
                        <div>
                          <label className="text-[#918175] text-xs block mb-0.5">代理</label>
                          <input value={h.agentName} onChange={(e) => h.setAgentName(e.target.value)} placeholder="claude" className={inputClass} />
                        </div>
                        <div>
                          <label className="text-[#918175] text-xs block mb-0.5">提示词模板</label>
                          <input value={h.promptTemplate} onChange={(e) => h.setPromptTemplate(e.target.value)} placeholder="security-analysis（安全分析）" className={inputClass} />
                        </div>
                      </>
                    ) : (
                      <div>
                        <label className="text-[#918175] text-xs block mb-0.5">提示词</label>
                        <textarea value={h.customPrompt} onChange={(e) => h.setCustomPrompt(e.target.value)} placeholder="输入提示词..." rows={3} className={`${inputClass} resize-y`} />
                      </div>
                    )}
                    <div>
                      <label className="text-[#918175] text-xs block mb-0.5">文件 <span className="text-[#706560] italic">逗号分隔</span></label>
                      <input value={h.queryFiles} onChange={(e) => h.setQueryFiles(e.target.value)} placeholder="源码文件路径，例如 src/main.go" className={inputClass} />
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <div>
                        <label className="text-[#918175] text-xs block mb-0.5">指令</label>
                        <input value={h.queryInstruction} onChange={(e) => h.setQueryInstruction(e.target.value)} placeholder="自定义指令..." className={inputClass} />
                      </div>
                      <div>
                        <label className="text-[#918175] text-xs block mb-0.5">来源标签</label>
                        <input value={h.querySourceLabel} onChange={(e) => h.setQuerySourceLabel(e.target.value)} placeholder="来源名称" className={inputClass} />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

        </div>

        {/* ── Bottom: Output ── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Sessions — open by default when there are sessions and no active scan */}
          <details open={!h.scanOutput && !!(h.sessionsData?.data?.length)} className="border border-t-0 border-[#2e2b26] bg-[#1c1b19] overflow-hidden shrink-0">
            <summary className="px-3 py-1.5 border-b border-[#2e2b26] cursor-pointer hover:bg-[#2e2b26]/30 list-none [&::-webkit-details-marker]:hidden flex items-center gap-1.5">
              <ChevronDown className="w-3 h-3 text-[#7fd962] transition-transform [[open]>&]:rotate-0 [details:not([open])>&]:-rotate-90" />
              <span className="text-[#7fd962] text-xs font-bold inline-flex items-center gap-1.5">
                <Layers className="w-3 h-3" />AGENT SESSIONS
                {h.sessionsData?.total != null && <span className="text-[#918175] font-normal ml-1">({h.sessionsData.total})</span>}
              </span>
            </summary>
            <div className="flex max-h-[300px]" style={{ minHeight: h.expandedSessionUuid && h.sessionDetail ? 280 : undefined }}>
              <div className={`${h.expandedSessionUuid && h.sessionDetail ? 'w-1/2' : 'w-full'} overflow-auto`}>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[#2e2b26] text-[#706560]">
                      <th className="text-left px-2 py-1 font-bold">状态</th>
                      <th className="text-left px-2 py-1 font-bold">UUID</th>
                      <th className="text-left px-2 py-1 font-bold">模式</th>
                      <th className="text-left px-2 py-1 font-bold">目标</th>
                      <th className="text-right px-2 py-1 font-bold">漏洞数</th>
                      <th className="text-right px-2 py-1 font-bold">已保存</th>
                      <th className="text-right px-2 py-1 font-bold">耗时</th>
                    </tr>
                  </thead>
                  <tbody>
                    {h.sessionsData?.data && h.sessionsData.data.length > 0 ? (
                      h.sessionsData.data.map((s: AgentSession) => (
                        <tr
                          key={s.uuid}
                          onClick={() => h.setExpandedSessionUuid(prev => prev === s.uuid ? null : s.uuid)}
                          className={`border-b border-[#2e2b26]/50 hover:bg-[#2e2b26]/30 cursor-pointer ${h.expandedSessionUuid === s.uuid ? 'bg-[#2e2b26]' : ''}`}
                        >
                          <td className="px-2 py-1"><StatusBadge status={s.status} /></td>
                          <td className="px-2 py-1 text-[#68a8e4] font-mono">{s.uuid.slice(0, 8)}</td>
                          <td className="px-2 py-1 text-[#918175]">{s.mode}</td>
                          <td className="px-2 py-1 text-[#fce8c3]">{s.target_url ? truncate(s.target_url, 30) : '\u2014'}</td>
                          <td className="px-2 py-1 text-right text-[#fce8c3]">{s.finding_count}</td>
                          <td className="px-2 py-1 text-right text-[#98bc37]">{s.saved_count}</td>
                          <td className="px-2 py-1 text-right text-[#fce8c3]">{formatDuration(s.duration_ms)}</td>
                        </tr>
                      ))
                    ) : (
                      <tr><td colSpan={7} className="px-3 py-3 text-center text-[#403d38]">暂无会话</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              {h.expandedSessionUuid && h.sessionDetail && (
                <div className="w-1/2">
                  <SessionDetailPanel session={h.sessionDetail} onClose={() => h.setExpandedSessionUuid(null)} />
                </div>
              )}
            </div>
          </details>

          {/* Streaming Output — collapsible, takes remaining height when open */}
          <div className={`border border-t-0 border-[#2e2b26] bg-[#141310] flex flex-col overflow-hidden ${h.streamingOpen ? 'flex-1' : 'shrink-0'}`}>
            <button
              type="button"
              onClick={() => h.setStreamingOpen(!h.streamingOpen)}
              className="px-3 py-1.5 border-b border-[#2e2b26] hover:bg-[#2e2b26]/30 flex items-center justify-between shrink-0 text-left"
            >
              <span className="text-[#7fd962] text-xs font-bold flex items-center gap-1.5">
                <ChevronDown className={`w-3 h-3 text-[#7fd962] transition-transform ${h.streamingOpen ? '' : '-rotate-90'}`} />
                <ScrollText className="w-3 h-3" />STREAMING RESPONSE
              </span>
              <div className="flex items-center gap-3">
                {h.panelIsStreaming && (
                  <span className="text-xs text-[#68a8e4] flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> streaming...</span>
                )}
                {h.scanResult && (
                  <span className="text-xs text-[#918175]">
                    {h.scanResult.finding_count != null && <span className="text-[#fce8c3] mr-3">漏洞数：<b className="text-[#7fd962]">{String(h.scanResult.finding_count)}</b></span>}
                    {h.scanResult.saved_count != null && <span className="text-[#fce8c3]">已保存：<b className="text-[#98bc37]">{String(h.scanResult.saved_count)}</b></span>}
                  </span>
                )}
              </div>
            </button>
            {h.streamingOpen && (
              <pre ref={h.scanOutputRef} onScroll={h.onScanOutputScroll} className="flex-1 overflow-auto p-3 text-xs text-[#a89888] font-mono whitespace-pre-wrap leading-relaxed">
                {h.panelOutput || (
                  <span className="text-[#403d38]">{h.panelError || h.panelPlaceholder}</span>
                )}
              </pre>
            )}
          </div>
        </div>

      </div>
    </PageShell>
  );
}
