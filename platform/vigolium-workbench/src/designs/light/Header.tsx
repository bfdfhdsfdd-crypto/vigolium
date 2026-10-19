import { Moon, ShieldCheck, Coins, Loader2, Menu } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useTheme } from '@/contexts/ThemeContext';
import { useToast } from '@/contexts/ToastContext';
import { useProjectContext } from '@/contexts/ProjectContext';
import { isStaticBuild } from '@/lib/buildMode';
import type { ServerInfoResponse } from '@/api/types';
import { getUserInfo } from '@/api/client';
import { useCurrentUser, useCredits } from '@/api/hooks';

interface HeaderProps {
  serverInfo?: ServerInfoResponse;
  isConnected: boolean;
}

export default function Header({ serverInfo, isConnected }: HeaderProps) {
  const { toggleTheme } = useTheme();
  const { toasts, dismiss } = useToast();
  const { projectUUID, projects, setProject, createProject } = useProjectContext();
  const { data: currentUser } = useCurrentUser();
  const { data: creditBalance } = useCredits();
  const displayedCredits = creditBalance?.credits ?? currentUser?.credits ?? 0;
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  const currentProject = projects.find((p) => p.uuid === projectUUID);
  // In cloud mode every user owns at least one project (auto-created on first
  // sign-in by ProjectContext). The legacy "ALL PROJECTS" option is kept only
  // for static/workbench mode where there is no per-user scoping.
  const isAllProjects = !isStaticBuild ? false : !projectUUID;
  const fallbackLabel = isStaticBuild ? '全部项目' : '未选择项目';
  const displayName = currentProject?.name ?? fallbackLabel;

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
        setCreating(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    await createProject(newName.trim());
    setNewName('');
    setCreating(false);
    setDropdownOpen(false);
  };

  const switchProject = (uuid: string | null) => {
    setDropdownOpen(false);
    if (uuid === projectUUID) return;
    setProject(uuid);
    window.location.href = '/';
  };

  const isDemoUser = !isStaticBuild && currentUser?.role === 'demo';
  const demoLabel = currentUser?.demo_label ?? '';
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    if (isStaticBuild) {
      document.getElementById('vigolium-logout')?.click();
      return;
    }
    setLoggingOut(true);
    await new Promise((r) => setTimeout(r, 600));
    if (isDemoUser) {
      document.cookie = 'vigolium-demo-entered=; path=/; max-age=0';
      window.location.href = '/login';
    } else {
      window.location.href = '/api/auth/logout';
    }
  };

  return (
    <header className="border-b sticky top-0 z-40" style={{ borderColor: 'var(--v-border)', backgroundColor: 'var(--v-bg)' }}>
      <div className="px-2 md:px-4 min-h-8 py-1 flex flex-wrap items-center justify-between text-xs gap-y-1">
        <div className="flex items-center gap-2 md:gap-4">
          <span className="font-bold" style={{ color: 'var(--v-accent)' }}>
            {isStaticBuild ? '> VIGOLIUM' : '> VIGOLIUM 云控制台'}
          </span>
          {!isStaticBuild && process.env.NEXT_PUBLIC_ENTERPRISE_LABEL && (
            <span style={{ color: '#ff8c00' }}>[{process.env.NEXT_PUBLIC_ENTERPRISE_LABEL}]</span>
          )}
          {isStaticBuild && serverInfo && (
            <span className="hidden sm:inline" style={{ color: 'var(--v-text-muted)' }}>[<span style={{ color: '#ff8c00' }}>工作台</span> {serverInfo.version}]</span>
          )}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="v-header-link transition-colors"
            >
              {isAllProjects && <ShieldCheck className="w-3 h-3 inline mr-1" />}[项目：<span style={{ color: '#e879f9' }}>{displayName}</span> ▼]
            </button>
            {dropdownOpen && (
              <div className="absolute top-full left-0 mt-1 min-w-[200px] z-50 shadow-lg border" style={{ backgroundColor: 'var(--v-surface)', borderColor: 'var(--v-border)' }}>
                {isStaticBuild && (
                  <button
                    onClick={() => switchProject(null)}
                    className="flex items-center gap-1.5 w-full text-left px-3 py-1.5 v-dropdown-item"
                    style={{ color: !projectUUID ? 'var(--v-success)' : 'var(--v-text)' }}
                  >
                    <ShieldCheck className="w-3 h-3" /> 全部项目
                  </button>
                )}
                {projects.map((p) => (
                  <button
                    key={p.uuid}
                    onClick={() => switchProject(p.uuid)}
                    className="block w-full text-left px-3 py-1.5 v-dropdown-item"
                    style={{ color: projectUUID === p.uuid ? 'var(--v-success)' : 'var(--v-text)' }}
                  >
                    {p.name}
                  </button>
                ))}
                <div className="border-t" style={{ borderColor: 'var(--v-border)' }}>
                  {creating ? (
                    <div className="flex items-center px-2 py-1.5 gap-1">
                      <input
                        autoFocus
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                        placeholder="项目名称"
                        className="px-1.5 py-0.5 text-xs flex-1 outline-none border"
                        style={{ backgroundColor: 'var(--v-bg)', borderColor: 'var(--v-border)', color: 'var(--v-text)' }}
                      />
                      <button onClick={handleCreate} style={{ color: 'var(--v-success)' }}>确定</button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setCreating(true)}
                      className="block w-full text-left px-3 py-1.5 v-dropdown-item"
                      style={{ color: 'var(--v-secondary)' }}
                    >
                      + 新建项目
                    </button>
                  )}
                  <a
                    href="/select-project"
                    onClick={() => setDropdownOpen(false)}
                    className="flex items-center gap-1.5 w-full text-left px-3 py-1.5 v-dropdown-item"
                    style={{ color: 'var(--v-accent)' }}
                  >
                    <Menu className="w-3 h-3" /> 选择项目
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 md:gap-4">
          {serverInfo?.proxy_addr && (
            <span className="hidden md:inline" style={{ color: 'var(--v-text-muted)' }}>代理：{serverInfo.proxy_addr}</span>
          )}
          {toasts.map((t) => {
            const toastColor = t.type === 'success' ? 'var(--v-success)' : t.type === 'error' ? 'var(--v-error)' : 'var(--v-secondary)';
            return (
              <span
                key={t.id}
                className="animate-toast-in flex items-center gap-1 border px-2 py-0.5"
                style={{ color: toastColor, borderColor: toastColor, backgroundColor: 'var(--v-surface)' }}
              >
                {t.message}
                <button onClick={() => dismiss(t.id)} className="v-header-btn">[x]</button>
              </span>
            );
          })}

          {/* Static mode: connection status + local user info */}
          {isStaticBuild && (
            <>
              <span style={{ color: isConnected ? 'var(--v-success)' : 'var(--v-error)' }}>
                {isConnected ? '[已连接]' : '[离线]'}
              </span>
              {isConnected && getUserInfo() && (
                <span className="hidden lg:inline" style={{ color: 'var(--v-secondary)' }}>
                  [登录用户：<span style={{ color: '#e879f9' }}>{getUserInfo()!.name}</span>]
                </span>
              )}
            </>
          )}

          {/* Cloud mode: credits + org + user */}
          {!isStaticBuild && (
            <>
              {!isConnected && (
                <Loader2
                  className="w-3.5 h-3.5 animate-spin"
                  style={{ color: 'var(--v-text-muted)' }}
                  aria-label="正在连接扫描器服务器"
                />
              )}
              {isConnected && currentUser && !isDemoUser && (
                <div className="flex items-center gap-2 md:gap-4 animate-header-fade">
                  <a href="/billing" className="hidden md:inline-flex items-center gap-1" style={{ color: 'var(--v-accent)' }} title="额度">
                    <Coins className="w-3 h-3" />
                    <span>额度：</span>{' '}
                    {creditBalance ? (
                      <span className="font-bold">{displayedCredits.toLocaleString()}</span>
                    ) : (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    )}
                  </a>
                  {currentUser.organization && (
                    <Link href="/settings/team" className="hidden lg:inline" style={{ color: 'var(--v-text-muted)' }} title="团队">
                      [{currentUser.organization.name}]
                    </Link>
                  )}
                  <Link href="/settings" className="hidden lg:inline" style={{ color: 'var(--v-secondary)' }}>
                    [登录用户：<span style={{ color: '#e879f9' }}>{currentUser.name}</span>]
                  </Link>
                </div>
              )}
              {isConnected && isDemoUser && (
                <div className="flex items-center gap-2 md:gap-4 animate-header-fade">
                  <a
                    href="/showcases"
                    className="hidden md:inline-flex items-center border px-2 py-0.5 hover:opacity-80 transition-opacity"
                    style={{
                      color: 'var(--v-accent)',
                      borderColor: 'color-mix(in srgb, var(--v-accent) 45%, transparent)',
                      backgroundColor: 'color-mix(in srgb, var(--v-accent) 8%, transparent)',
                    }}
                  >
                    [开源审计示例]
                  </a>
                  <span
                    className="hidden md:inline-flex items-center border px-2 py-0.5"
                    style={{
                      color: '#b45309',
                      borderColor: 'color-mix(in srgb, #d96b25 50%, transparent)',
                      backgroundColor: 'color-mix(in srgb, #d96b25 8%, transparent)',
                    }}
                    title={
                      (demoLabel
                        ? `演示密钥：${demoLabel}${currentUser?.demo_expires ? ` · 到期时间 ${currentUser.demo_expires}` : ''}`
                        : '演示会话') + '\n演示模式下的数据可能已脱敏或截断'
                    }
                  >
                    [演示预览 · 只读]
                  </span>
                </div>
              )}
            </>
          )}

          {isConnected && (
            <button
              onClick={handleLogout}
              disabled={loggingOut}
              className="v-header-btn-danger transition-colors inline-flex items-center gap-1.5 disabled:opacity-70 disabled:cursor-wait"
            >
              {loggingOut ? (
                <><Loader2 className="w-3 h-3 animate-spin" /> 正在退出…</>
              ) : (
                isDemoUser ? '[退出演示]' : '[退出登录]'
              )}
            </button>
          )}
          <button
            onClick={toggleTheme}
            className="v-header-btn transition-colors"
            title="切换主题"
          >
            <Moon className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </header>
  );
}
