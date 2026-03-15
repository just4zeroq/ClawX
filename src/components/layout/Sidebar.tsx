/**
 * Sidebar Component
 * Navigation sidebar with menu items.
 * No longer fixed - sits inside the flex layout below the title bar.
 */
import { useEffect, useMemo, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  Network,
  Bot,
  Puzzle,
  Clock,
  Settings as SettingsIcon,
  PanelLeftClose,
  PanelLeft,
  Plus,
  Trash2,
  Cpu,
  LogOut,
  User,
  Unlink,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '@/stores/settings';
import { useChatStore } from '@/stores/chat';
import { useGatewayStore } from '@/stores/gateway';
import { useAgentsStore } from '@/stores/agents';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/auth';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import logoSvg from '@/assets/logo.svg';

type SessionBucketKey =
  | 'today'
  | 'yesterday'
  | 'withinWeek'
  | 'withinTwoWeeks'
  | 'withinMonth'
  | 'older';

interface NavItemProps {
  to: string;
  icon: React.ReactNode;
  label: string;
  badge?: string;
  collapsed?: boolean;
  onClick?: () => void;
}

function NavItem({ to, icon, label, badge, collapsed, onClick }: NavItemProps) {
  return (
    <NavLink
      to={to}
      onClick={onClick}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[14px] font-medium transition-colors',
          'hover:bg-black/5 dark:hover:bg-white/5 text-foreground/80',
          isActive
            ? 'bg-black/5 dark:bg-white/10 text-foreground'
            : '',
          collapsed && 'justify-center px-0'
        )
      }
    >
      {({ isActive }) => (
        <>
          <div className={cn("flex shrink-0 items-center justify-center", isActive ? "text-foreground" : "text-muted-foreground")}>
            {icon}
          </div>
          {!collapsed && (
            <>
              <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap">{label}</span>
              {badge && (
                <Badge variant="secondary" className="ml-auto shrink-0">
                  {badge}
                </Badge>
              )}
            </>
          )}
        </>
      )}
    </NavLink>
  );
}

function getSessionBucket(activityMs: number, nowMs: number): SessionBucketKey {
  if (!activityMs || activityMs <= 0) return 'older';

  const now = new Date(nowMs);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 24 * 60 * 60 * 1000;

  if (activityMs >= startOfToday) return 'today';
  if (activityMs >= startOfYesterday) return 'yesterday';

  const daysAgo = (startOfToday - activityMs) / (24 * 60 * 60 * 1000);
  if (daysAgo <= 7) return 'withinWeek';
  if (daysAgo <= 14) return 'withinTwoWeeks';
  if (daysAgo <= 30) return 'withinMonth';
  return 'older';
}

const INITIAL_NOW_MS = Date.now();

function getAgentIdFromSessionKey(sessionKey: string): string {
  if (!sessionKey.startsWith('agent:')) return 'main';
  const [, agentId] = sessionKey.split(':');
  return agentId || 'main';
}

export function Sidebar() {
  const sidebarCollapsed = useSettingsStore((state) => state.sidebarCollapsed);
  const setSidebarCollapsed = useSettingsStore((state) => state.setSidebarCollapsed);

  const sessions = useChatStore((s) => s.sessions);
  const currentSessionKey = useChatStore((s) => s.currentSessionKey);
  const sessionLabels = useChatStore((s) => s.sessionLabels);
  const sessionLastActivity = useChatStore((s) => s.sessionLastActivity);
  const switchSession = useChatStore((s) => s.switchSession);
  const newSession = useChatStore((s) => s.newSession);
  const deleteSession = useChatStore((s) => s.deleteSession);
  const loadSessions = useChatStore((s) => s.loadSessions);
  const loadHistory = useChatStore((s) => s.loadHistory);

  const gatewayStatus = useGatewayStore((s) => s.status);
  const isGatewayRunning = gatewayStatus.state === 'running';

  // Auth state
  const user = useAuthStore((s) => s.user);
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  const logout = useAuthStore((s) => s.logout);
  const unbindDevice = useAuthStore((s) => s.unbindDevice);
  const syncFromMain = useAuthStore((s) => s.syncFromMain);
  const [userDialogOpen, setUserDialogOpen] = useState(false);
  const [unbindDialogOpen, setUnbindDialogOpen] = useState(false);
  const [isUnbinding, setIsUnbinding] = useState(false);

  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    setUserDialogOpen(false);
    navigate('/login');
  };

  const handleUnbind = async () => {
    setIsUnbinding(true);
    try {
      const result = await unbindDevice();
      if (result.success) {
        toast.success(t('common:userInfo.unbindSuccess'));
        setUnbindDialogOpen(false);
        setUserDialogOpen(false);
        // Sync auth state to refresh user data
        await syncFromMain();
        // Navigate to login after unbinding
        navigate('/login');
      } else {
        toast.error(t('common:userInfo.unbindFailed', { message: result.message }));
      }
    } catch {
      toast.error(t('common:userInfo.unbindFailed', { message: 'Unknown error' }));
    } finally {
      setIsUnbinding(false);
    }
  };

  useEffect(() => {
    if (!isGatewayRunning) return;
    let cancelled = false;
    const hasExistingMessages = useChatStore.getState().messages.length > 0;
    (async () => {
      await loadSessions();
      if (cancelled) return;
      await loadHistory(hasExistingMessages);
    })();
    return () => {
      cancelled = true;
    };
  }, [isGatewayRunning, loadHistory, loadSessions]);
  const agents = useAgentsStore((s) => s.agents);
  const fetchAgents = useAgentsStore((s) => s.fetchAgents);

  const isOnChat = useLocation().pathname === '/';

  const getSessionLabel = (key: string, displayName?: string, label?: string) =>
    sessionLabels[key] ?? label ?? displayName ?? key;

  const { t } = useTranslation(['common', 'chat']);
  const [sessionToDelete, setSessionToDelete] = useState<{ key: string; label: string } | null>(null);
  const [nowMs, setNowMs] = useState(INITIAL_NOW_MS);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    void fetchAgents();
  }, [fetchAgents]);

  const agentNameById = useMemo(
    () => Object.fromEntries(agents.map((agent) => [agent.id, agent.name])),
    [agents],
  );
  const sessionBuckets: Array<{ key: SessionBucketKey; label: string; sessions: typeof sessions }> = [
    { key: 'today', label: t('chat:historyBuckets.today'), sessions: [] },
    { key: 'yesterday', label: t('chat:historyBuckets.yesterday'), sessions: [] },
    { key: 'withinWeek', label: t('chat:historyBuckets.withinWeek'), sessions: [] },
    { key: 'withinTwoWeeks', label: t('chat:historyBuckets.withinTwoWeeks'), sessions: [] },
    { key: 'withinMonth', label: t('chat:historyBuckets.withinMonth'), sessions: [] },
    { key: 'older', label: t('chat:historyBuckets.older'), sessions: [] },
  ];
  const sessionBucketMap = Object.fromEntries(sessionBuckets.map((bucket) => [bucket.key, bucket])) as Record<
    SessionBucketKey,
    (typeof sessionBuckets)[number]
  >;

  for (const session of [...sessions].sort((a, b) =>
    (sessionLastActivity[b.key] ?? 0) - (sessionLastActivity[a.key] ?? 0)
  )) {
    const bucketKey = getSessionBucket(sessionLastActivity[session.key] ?? 0, nowMs);
    sessionBucketMap[bucketKey].sessions.push(session);
  }

  const navItems = [
    { to: '/models', icon: <Cpu className="h-[18px] w-[18px]" strokeWidth={2} />, label: t('sidebar.models') },
    { to: '/agents', icon: <Bot className="h-[18px] w-[18px]" strokeWidth={2} />, label: t('sidebar.agents') },
    { to: '/channels', icon: <Network className="h-[18px] w-[18px]" strokeWidth={2} />, label: t('sidebar.channels') },
    { to: '/skills', icon: <Puzzle className="h-[18px] w-[18px]" strokeWidth={2} />, label: t('sidebar.skills') },
    { to: '/cron', icon: <Clock className="h-[18px] w-[18px]" strokeWidth={2} />, label: t('sidebar.cronTasks') },
  ];

  return (
    <aside
      className={cn(
        'flex shrink-0 flex-col border-r bg-[#eae8e1]/60 dark:bg-background transition-all duration-300',
        sidebarCollapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* Top Header Toggle */}
      <div className={cn("flex items-center p-2 h-12", sidebarCollapsed ? "justify-center" : "justify-between")}>
        {!sidebarCollapsed && (
          <div className="flex items-center gap-2 px-2 overflow-hidden">
            <img src={logoSvg} alt="XiWang" className="h-5 w-auto shrink-0" />
            <span className="text-sm font-semibold truncate whitespace-nowrap text-foreground/90">
              犀旺
            </span>
          </div>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 text-muted-foreground hover:bg-black/5 dark:hover:bg-white/10"
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
        >
          {sidebarCollapsed ? (
            <PanelLeft className="h-[18px] w-[18px]" />
          ) : (
            <PanelLeftClose className="h-[18px] w-[18px]" />
          )}
        </Button>
      </div>

      {/* Navigation */}
      <nav className="flex flex-col px-2 gap-0.5">
        <button
          onClick={() => {
            const { messages } = useChatStore.getState();
            if (messages.length > 0) newSession();
            navigate('/');
          }}
          className={cn(
            'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[14px] font-medium transition-colors mb-2',
            'bg-black/5 dark:bg-accent shadow-none border border-transparent text-foreground',
            sidebarCollapsed && 'justify-center px-0',
          )}
        >
          <div className="flex shrink-0 items-center justify-center text-foreground/80">
            <Plus className="h-[18px] w-[18px]" strokeWidth={2} />
          </div>
          {!sidebarCollapsed && <span className="flex-1 text-left overflow-hidden text-ellipsis whitespace-nowrap">{t('sidebar.newChat')}</span>}
        </button>

        {navItems.map((item) => (
          <NavItem
            key={item.to}
            {...item}
            collapsed={sidebarCollapsed}
          />
        ))}
      </nav>

      {/* Session list — below Settings, only when expanded */}
      {!sidebarCollapsed && sessions.length > 0 && (
        <div className="flex-1 overflow-y-auto overflow-x-hidden px-2 mt-4 space-y-0.5 pb-2">
          {sessionBuckets.map((bucket) => (
            bucket.sessions.length > 0 ? (
              <div key={bucket.key} className="pt-2">
                <div className="px-2.5 pb-1 text-[11px] font-medium text-muted-foreground/60 tracking-tight">
                  {bucket.label}
                </div>
                {bucket.sessions.map((s) => {
                  const agentId = getAgentIdFromSessionKey(s.key);
                  const agentName = agentNameById[agentId] || agentId;
                  return (
                    <div key={s.key} className="group relative flex items-center">
                      <button
                        onClick={() => { switchSession(s.key); navigate('/'); }}
                        className={cn(
                          'w-full text-left rounded-lg px-2.5 py-1.5 text-[13px] transition-colors pr-7',
                          'hover:bg-black/5 dark:hover:bg-white/5',
                          isOnChat && currentSessionKey === s.key
                            ? 'bg-black/5 dark:bg-white/10 text-foreground font-medium'
                            : 'text-foreground/75',
                        )}
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="shrink-0 rounded-full bg-black/[0.04] px-2 py-0.5 text-[10px] font-medium text-foreground/70 dark:bg-white/[0.08]">
                            {agentName}
                          </span>
                          <span className="truncate">{getSessionLabel(s.key, s.displayName, s.label)}</span>
                        </div>
                      </button>
                      <button
                        aria-label="Delete session"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSessionToDelete({
                            key: s.key,
                            label: getSessionLabel(s.key, s.displayName, s.label),
                          });
                        }}
                        className={cn(
                          'absolute right-1 flex items-center justify-center rounded p-0.5 transition-opacity',
                          'opacity-0 group-hover:opacity-100',
                          'text-muted-foreground hover:text-destructive hover:bg-destructive/10',
                        )}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : null
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="p-2 mt-auto space-y-1">
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            cn(
              'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[14px] font-medium transition-colors',
              'hover:bg-black/5 dark:hover:bg-white/5 text-foreground/80',
              isActive && 'bg-black/5 dark:bg-white/10 text-foreground',
              sidebarCollapsed ? 'justify-center px-0' : ''
            )
          }
        >
          {({ isActive }) => (
            <>
              <div className={cn("flex shrink-0 items-center justify-center", isActive ? "text-foreground" : "text-muted-foreground")}>
                <SettingsIcon className="h-[18px] w-[18px]" strokeWidth={2} />
              </div>
              {!sidebarCollapsed && <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap">{t('sidebar.settings')}</span>}
            </>
          )}
        </NavLink>

        {/* User Avatar */}
        {isLoggedIn() && user && (
          <button
            onClick={() => setUserDialogOpen(true)}
            className={cn(
              'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[14px] font-medium transition-colors w-full',
              'hover:bg-black/5 dark:hover:bg-white/5 text-foreground/80',
              sidebarCollapsed ? 'justify-center px-0' : 'justify-start'
            )}
          >
            <div className="flex shrink-0 items-center justify-center">
              {user.avatar ? (
                <img
                  src={user.avatar}
                  alt={user.username}
                  className="h-[18px] w-[18px] rounded-full object-cover"
                />
              ) : (
                <div className="h-[18px] w-[18px] rounded-full bg-primary/10 flex items-center justify-center">
                  <User className="h-3 w-3 text-primary" />
                </div>
              )}
            </div>
            {!sidebarCollapsed && (
              <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-left">
                {user.username}
              </span>
            )}
          </button>
        )}
      </div>

      {/* User Info Dialog */}
      <Dialog open={userDialogOpen} onOpenChange={setUserDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('common:userInfo.title')}</DialogTitle>
            <DialogDescription>{t('common:userInfo.description')}</DialogDescription>
          </DialogHeader>
          {user && (
            <div className="space-y-4 py-4">
              <div className="flex items-center gap-4">
                {user.avatar ? (
                  <img
                    src={user.avatar}
                    alt={user.username}
                    className="h-16 w-16 rounded-full object-cover"
                  />
                ) : (
                  <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                    <User className="h-8 w-8 text-primary" />
                  </div>
                )}
                <div>
                  <h3 className="font-semibold text-lg">{user.username}</h3>
                  <p className="text-sm text-muted-foreground">{t('common:userInfo.id')}: {user.id}</p>
                </div>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between py-2 border-b">
                  <span className="text-muted-foreground">{t('common:userInfo.phone')}</span>
                  <span>{user.phone}</span>
                </div>
                <div className="flex justify-between py-2 border-b">
                  <span className="text-muted-foreground">{t('common:userInfo.createdAt')}</span>
                  <span>{new Date(user.created_at).toLocaleString()}</span>
                </div>
                {user.mac_address && (
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-muted-foreground">{t('common:userInfo.macAddress')}</span>
                    <span>{user.mac_address}</span>
                  </div>
                )}
              </div>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-4 border-t">
            {user?.mac_address && (
              <Button
                variant="outline"
                onClick={() => setUnbindDialogOpen(true)}
                className="gap-2"
              >
                <Unlink className="h-4 w-4" />
                {t('common:userInfo.unbindDevice')}
              </Button>
            )}
            <Button
              variant="destructive"
              onClick={handleLogout}
              className="gap-2"
            >
              <LogOut className="h-4 w-4" />
              {t('common:userInfo.logout')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Unbind Device Confirm Dialog */}
      <ConfirmDialog
        open={unbindDialogOpen}
        title={t('common:userInfo.unbindConfirmTitle')}
        message={t('common:userInfo.unbindConfirmMessage')}
        confirmLabel={t('common:userInfo.unbindDevice')}
        cancelLabel={t('common:actions.cancel')}
        variant="destructive"
        loading={isUnbinding}
        onConfirm={handleUnbind}
        onCancel={() => setUnbindDialogOpen(false)}
      />

      <ConfirmDialog
        open={!!sessionToDelete}
        title={t('common:actions.confirm')}
        message={t('common:sidebar.deleteSessionConfirm', { label: sessionToDelete?.label })}
        confirmLabel={t('common:actions.delete')}
        cancelLabel={t('common:actions.cancel')}
        variant="destructive"
        onConfirm={async () => {
          if (!sessionToDelete) return;
          await deleteSession(sessionToDelete.key);
          if (currentSessionKey === sessionToDelete.key) navigate('/');
          setSessionToDelete(null);
        }}
        onCancel={() => setSessionToDelete(null)}
      />
    </aside>
  );
}