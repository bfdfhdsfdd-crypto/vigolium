'use client';

import { useMemo } from 'react';
import Link from '@/components/shared/DemoAwareLink';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  ShieldAlert,
  Network,
  Radio,
  Blocks,
  Puzzle,
  Import,
  Radar,
  Bot,
  ShieldCheck,
  SlidersHorizontal,
  Database,
  CreditCard,
} from 'lucide-react';
import { isStaticBuild } from '@/lib/buildMode';
import { useHiddenPages } from '@/lib/nav-settings';
import { useCurrentUser } from '@/api/hooks';
import { useToast } from '@/contexts/ToastContext';

const DEMO_DISABLED_PATHS = new Set(['/billing', '/settings']);
const DEMO_FORCE_SHOW = new Set(['/modules', '/extensions']);

interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  group: 'default' | 'blue' | 'orange';
}

/* ── Static/workbench mode: flat list ─────────────────────────────── */

const STATIC_NAV_ITEMS: NavItem[] = [
  { href: '/', label: '仪表盘', icon: LayoutDashboard, group: 'default' },
  { href: '/findings', label: '漏洞发现', icon: ShieldAlert, group: 'default' },
  { href: '/http-records', label: 'HTTP 记录', icon: Network, group: 'default' },
  { href: '/oast-interactions', label: 'OAST 交互', icon: Radio, group: 'default' },
  { href: '/modules', label: '扫描模块', icon: Blocks, group: 'blue' },
  { href: '/extensions', label: '扩展', icon: Puzzle, group: 'blue' },
  { href: '/ingest', label: '导入流量', icon: Import, group: 'orange' },
  { href: '/scan', label: '原生扫描', icon: Radar, group: 'orange' },
  { href: '/agentic-scan', label: '智能代理扫描', icon: Bot, group: 'orange' },
  { href: '/database', label: '数据库', icon: Database, group: 'blue' },
  { href: '/settings', label: '设置', icon: SlidersHorizontal, group: 'blue' },
];

/* ── Cloud/console mode: grouped nav ──────────────────────────────── */

const CLOUD_NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: '数据',
    items: [
      { href: '/', label: '仪表盘', icon: LayoutDashboard, group: 'default' },
      { href: '/findings', label: '漏洞发现', icon: ShieldAlert, group: 'default' },
      { href: '/http-records', label: 'HTTP 记录', icon: Network, group: 'default' },
      { href: '/oast-interactions', label: 'OAST 交互', icon: Radio, group: 'default' },
    ],
  },
  {
    label: '扫描',
    items: [
      { href: '/modules', label: '扫描模块', icon: Blocks, group: 'blue' },
      { href: '/extensions', label: '扩展', icon: Puzzle, group: 'blue' },
      { href: '/ingest', label: '导入流量', icon: Import, group: 'orange' },
      { href: '/scan', label: '原生扫描', icon: Radar, group: 'orange' },
      { href: '/agentic-scan', label: '智能代理扫描', icon: Bot, group: 'orange' },
      { href: '/on-demand-audit', label: '按需审计', icon: ShieldCheck, group: 'orange' },
    ],
  },
  {
    label: '管理',
    items: [
      { href: '/billing', label: '账单', icon: CreditCard, group: 'blue' },
      { href: '/settings', label: '设置', icon: SlidersHorizontal, group: 'blue' },
    ],
  },
];

const GROUP_VAR: Record<string, string> = {
  default: '--v-accent',
  blue: '--v-secondary',
  orange: '--v-tertiary',
};

export default function Navigation() {
  const pathname = usePathname();
  const { data: currentUser } = useCurrentUser();
  const { toast } = useToast();
  const isDemoUser = !isStaticBuild && currentUser?.role === 'demo';
  const hidden = useHiddenPages();

  // Filter hidden pages in cloud mode
  const filteredGroups = useMemo(() => {
    if (isStaticBuild) return CLOUD_NAV_GROUPS;
    return CLOUD_NAV_GROUPS
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => {
          if (isDemoUser && DEMO_FORCE_SHOW.has(item.href)) return true;
          if (hidden.has(item.href)) return false;
          return true;
        }),
      }))
      .filter((group) => group.items.length > 0);
  }, [isDemoUser, hidden]);

  const handleDemoBlock = (e: React.MouseEvent, label: string) => {
    e.preventDefault();
    toast(`演示模式下无法使用「${label}」`, 'info');
  };

  if (isStaticBuild) {
    return (
      <nav className="border-b" style={{ borderColor: 'var(--v-border)', backgroundColor: 'var(--v-bg)' }}>
        <div className="px-2 md:px-4 min-h-7 py-1 flex flex-wrap items-center text-xs leading-tight gap-y-1">
          <span style={{ color: 'var(--v-border)' }} className="mr-2 hidden md:inline">&gt;</span>
          {STATIC_NAV_ITEMS.map((item, i) => {
            const isActive = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
            const colorVar = `var(${GROUP_VAR[item.group]})`;
            return (
              <span key={item.href} className="flex items-center">
                {i > 0 && <span style={{ color: 'var(--v-border)' }} className="mx-1 md:mx-2">|</span>}
                <Link
                  href={item.href}
                  className={`flex items-center gap-1 transition-colors whitespace-nowrap ${
                    isActive ? 'font-bold px-1.5 py-0.5 -my-0.5' : 'v-nav-link'
                  }`}
                  style={isActive ? {
                    color: colorVar,
                    backgroundColor: `color-mix(in srgb, ${colorVar} 10%, transparent)`,
                  } : undefined}
                  title={item.label}
                >
                  <item.icon className="w-3 h-3" />
                  {item.label}
                </Link>
              </span>
            );
          })}
        </div>
      </nav>
    );
  }

  return (
    <nav className="border-b" style={{ borderColor: 'var(--v-border)', backgroundColor: 'var(--v-bg)' }}>
      <div className="px-2 md:px-4 min-h-7 py-1 flex flex-wrap items-center text-xs leading-tight gap-y-1">
        {filteredGroups.map((group, gi) => (
          <div key={group.label} className="flex items-center">
            {gi > 0 && <span style={{ color: 'var(--v-border)' }} className="mx-2 md:mx-3 hidden md:inline">|</span>}
            <div className="flex items-center gap-0.5 md:gap-1">
              {group.items.map((item) => {
                const isActive = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
                const colorVar = `var(${GROUP_VAR[item.group]})`;
                const isBlocked = isDemoUser && DEMO_DISABLED_PATHS.has(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={isBlocked ? (e) => handleDemoBlock(e, item.label) : undefined}
                    className={`group/navitem flex items-center transition-colors whitespace-nowrap px-1.5 py-0.5 ${
                      isActive ? 'font-bold' : 'v-nav-link'
                    } ${isBlocked ? 'opacity-50 cursor-not-allowed' : ''}`}
                    style={isActive ? {
                      color: colorVar,
                      backgroundColor: `color-mix(in srgb, ${colorVar} 10%, transparent)`,
                    } : undefined}
                    title={isBlocked ? `演示模式下无法使用「${item.label}」` : item.label}
                    aria-disabled={isBlocked}
                  >
                    <item.icon className="w-3 h-3 shrink-0" />
                    <span
                      className={`overflow-hidden whitespace-nowrap transition-[max-width,opacity,margin] duration-700 ease-out motion-reduce:transition-none ${
                        isActive
                          ? 'ml-1 max-w-[16rem] opacity-100'
                          : 'ml-0 max-w-0 opacity-0 xl:ml-1 xl:max-w-[16rem] xl:opacity-100 group-hover/navitem:ml-1 group-hover/navitem:max-w-[16rem] group-hover/navitem:opacity-100'
                      }`}
                    >
                      {item.label}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </nav>
  );
}
