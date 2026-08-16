import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Bot,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleGauge,
  CircleDollarSign,
  Clock3,
  Database,
  FileWarning,
  Gauge,
  KeyRound,
  LayoutDashboard,
  LoaderCircle,
  Pencil,
  Plus,
  Power,
  RefreshCw,
  Route,
  Save,
  Server,
  Settings2,
  ShieldCheck,
  Sparkles,
  TestTube2,
  ToggleLeft,
  ToggleRight,
  X,
  XCircle,
  Zap,
} from "lucide-react";
import { FormEvent, useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";

type PageId = "overview" | "providers" | "logs" | "settings";

type Provider = {
  id: string;
  name: string;
  baseUrl: string;
  modelId: string;
  models: ProviderModel[];
  apiKeyMasked: string;
  hasApiKey: boolean;
  enabled: boolean;
  priority: number;
  role: "primary" | "fallback" | "disabled";
  timeoutMs: number;
  lastTestStatus: "healthy" | "error" | "untested";
  lastTestAt: number | null;
  lastTestLatencyMs: number | null;
  lastError: string | null;
};

type ProviderModel = {
  modelId: string;
  displayName: string;
  enabled: boolean;
  isDefault: boolean;
  inputPricePerMillion: number;
  outputPricePerMillion: number;
};

type UsageEvent = {
  id: number;
  occurredAt: number;
  requestKind: string;
  providerId: string | null;
  providerName: string;
  modelId: string;
  success: boolean;
  statusCode: number | null;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  latencyMs: number;
  attemptNo: number;
  fallbackUsed: boolean;
  errorCode: string | null;
  errorMessage: string | null;
  estimatedCost: number;
};

type Settings = {
  requestsPerMinute: number;
  dailyRequestLimit: number;
  autoFallback: boolean;
  logRetentionDays: number;
};

type Overview = {
  today: {
    attempts: number;
    successes: number;
    successRate: number;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    estimatedCost: number;
    avgLatencyMs: number;
    fallbackSuccesses: number;
  };
  errors24h: number;
  activeProviders: number;
  budget: { minuteCount: number; dayCount: number };
  trend: Array<{ label: string; attempts: number; successes: number; tokens: number; estimatedCost?: number }>;
  providerBreakdown: Array<{ providerId: string | null; providerName: string; attempts: number; promptTokens: number; completionTokens: number; estimatedCost: number }>;
};

type Health = {
  status: "healthy" | "degraded" | "unconfigured";
  primaryProvider: string | null;
  database: string;
  localOnly: boolean;
  controlMode?: "cloud" | "local";
  uptimeSeconds: number;
};

const emptyOverview: Overview = {
  today: { attempts: 0, successes: 0, successRate: 100, promptTokens: 0, completionTokens: 0, totalTokens: 0, estimatedCost: 0, avgLatencyMs: 0, fallbackSuccesses: 0 },
  errors24h: 0,
  activeProviders: 0,
  budget: { minuteCount: 0, dayCount: 0 },
  trend: Array.from({ length: 24 }, (_, index) => ({ label: `${index}:00`, attempts: 0, successes: 0, tokens: 0 })),
  providerBreakdown: [],
};

const defaultSettings: Settings = {
  requestsPerMinute: 12,
  dailyRequestLimit: 120,
  autoFallback: true,
  logRetentionDays: 30,
};

const requestKindLabels: Record<string, string> = {
  action: "剧情行动",
  dialogue: "人物对话",
  summary: "剧情摘要",
  world: "世界导演",
  chat: "通用对话",
  health_check: "连通测试",
};

async function api<T>(pathname: string, init?: RequestInit): Promise<T> {
  const response = await fetch(pathname, {
    ...init,
    headers: init?.body ? { "content-type": "application/json", ...init.headers } : init?.headers,
  });
  const payload = await response.json();
  if (!response.ok || payload.ok === false) throw new Error(payload.error || payload.message || "请求失败");
  return payload;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("zh-CN", { notation: value >= 10_000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(value);
}

function formatTime(value: number | null) {
  if (!value) return "尚未测试";
  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(value);
}

function formatDuration(value: number) {
  if (value < 1000) return `${value} ms`;
  return `${(value / 1000).toFixed(value >= 10_000 ? 1 : 2)} s`;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", minimumFractionDigits: value >= 1 ? 2 : 4, maximumFractionDigits: 6 }).format(value || 0);
}

function StatusDot({ status }: { status: Health["status"] | Provider["lastTestStatus"] }) {
  const label = status === "healthy" ? "正常" : status === "error" || status === "degraded" ? "异常" : "未配置";
  return <span className={`status-dot status-${status}`} aria-label={label} title={label} />;
}

function Spinner({ size = 16 }: { size?: number }) {
  return <LoaderCircle size={size} className="spinner" aria-hidden="true" />;
}

function AppMark() {
  return (
    <div className="app-mark" aria-hidden="true">
      <Route size={23} />
      <span />
    </div>
  );
}

const navigation: Array<{ id: PageId; label: string; icon: typeof Activity }> = [
  { id: "overview", label: "运营概览", icon: LayoutDashboard },
  { id: "providers", label: "AI 服务商", icon: Server },
  { id: "logs", label: "调用记录", icon: FileWarning },
  { id: "settings", label: "限流与策略", icon: Settings2 },
];

export function App() {
  const [page, setPage] = useState<PageId>("overview");
  const [overview, setOverview] = useState<Overview>(emptyOverview);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [logs, setLogs] = useState<UsageEvent[]>([]);
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [health, setHealth] = useState<Health | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<number>(Date.now());
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [editingProvider, setEditingProvider] = useState<Provider | "new" | null>(null);

  const refresh = useCallback(async (quiet = false) => {
    if (!quiet) setRefreshing(true);
    try {
      const [overviewPayload, providersPayload, logsPayload, healthPayload] = await Promise.all([
        api<{ data: Overview; settings: Settings }>("/api/overview"),
        api<{ data: Provider[] }>("/api/providers"),
        api<{ data: UsageEvent[] }>("/api/logs?limit=80"),
        api<Health & { ok: true }>("/api/health"),
      ]);
      setOverview(overviewPayload.data);
      setSettings(overviewPayload.settings);
      setProviders(providersPayload.data);
      setLogs(logsPayload.data);
      setHealth(healthPayload);
      setLastRefresh(Date.now());
    } catch (error) {
      setToast({ type: "error", message: error instanceof Error ? error.message : "中台数据读取失败" });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = window.setInterval(() => refresh(true), 15_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const showToast = useCallback((type: "success" | "error", message: string) => setToast({ type, message }), []);
  const primary = providers.find((provider) => provider.role === "primary");
  const pageTitle = navigation.find((item) => item.id === page)?.label ?? "AI 运营中台";

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <AppMark />
          <div>
            <strong>AI 运营中台</strong>
            <span>斗罗模拟器·公网控制台</span>
          </div>
        </div>

        <nav className="side-nav" aria-label="中台主导航">
          {navigation.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.id} className={page === item.id ? "active" : ""} onClick={() => setPage(item.id)}>
                <Icon size={19} />
                <span>{item.label}</span>
                {page === item.id ? <ChevronRight size={16} className="nav-arrow" /> : null}
              </button>
            );
          })}
        </nav>

        <div className="sidebar-status">
          <div className="status-heading">
            <StatusDot status={health?.status ?? "unconfigured"} />
            <span>{health?.status === "healthy" ? "网关运行正常" : health?.status === "degraded" ? "服务处于降级" : "等待服务配置"}</span>
          </div>
          <p>{primary ? `当前主服务：${primary.name}` : "请先启用一个 AI 服务商"}</p>
          <div className="local-badge"><ShieldCheck size={15} /> {health?.controlMode === "cloud" ? "控制公网配置" : "本机离线模式"}</div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div>
            <span className="eyebrow">斗罗 AI 网关</span>
            <h1>{pageTitle}</h1>
          </div>
          <div className="topbar-actions">
            <div className="last-refresh"><Clock3 size={15} /> {formatTime(lastRefresh)}</div>
            <button className="icon-button" onClick={() => refresh()} disabled={refreshing} aria-label="立即刷新数据" title="立即刷新">
              {refreshing ? <Spinner size={18} /> : <RefreshCw size={18} />}
            </button>
            <button className="primary-button compact" onClick={() => setEditingProvider("new")}>
              <Plus size={17} /> 添加服务商
            </button>
          </div>
        </header>

        <div className="content-area">
          {loading ? <DashboardSkeleton /> : null}
          {!loading && page === "overview" ? <OverviewPage overview={overview} providers={providers} logs={logs} settings={settings} onNavigate={setPage} /> : null}
          {!loading && page === "providers" ? (
            <ProvidersPage providers={providers} onEdit={setEditingProvider} onRefresh={refresh} showToast={showToast} />
          ) : null}
          {!loading && page === "logs" ? <LogsPage logs={logs} providers={providers} setLogs={setLogs} showToast={showToast} /> : null}
          {!loading && page === "settings" ? (
            <SettingsPage settings={settings} onSaved={(next) => { setSettings(next); showToast("success", "限流与容灾策略已保存"); }} showToast={showToast} />
          ) : null}
        </div>
      </main>

      <nav className="mobile-nav" aria-label="移动端中台导航">
        {navigation.map((item) => {
          const Icon = item.icon;
          return <button key={item.id} className={page === item.id ? "active" : ""} onClick={() => setPage(item.id)} aria-label={item.label}><Icon size={20} /><span>{item.label.replace("AI ", "")}</span></button>;
        })}
      </nav>

      {editingProvider ? (
        <ProviderDialog
          provider={editingProvider === "new" ? null : editingProvider}
          onClose={() => setEditingProvider(null)}
          onSaved={async () => {
            setEditingProvider(null);
            showToast("success", "服务商配置已保存");
            await refresh(true);
          }}
          showToast={showToast}
        />
      ) : null}

      {toast ? (
        <div className={`toast toast-${toast.type}`} role="status" aria-live="polite">
          {toast.type === "success" ? <CheckCircle2 size={19} /> : <AlertTriangle size={19} />}
          <span>{toast.message}</span>
          <button onClick={() => setToast(null)} aria-label="关闭提示"><X size={16} /></button>
        </div>
      ) : null}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="skeleton-wrap" aria-label="数据加载中">
      <div className="skeleton hero-skeleton" />
      <div className="skeleton-grid">{Array.from({ length: 6 }, (_, index) => <div className="skeleton card-skeleton" key={index} />)}</div>
      <div className="skeleton panel-skeleton" />
    </div>
  );
}

function OverviewPage({ overview, providers, logs, settings, onNavigate }: {
  overview: Overview;
  providers: Provider[];
  logs: UsageEvent[];
  settings: Settings;
  onNavigate: (page: PageId) => void;
}) {
  const primary = providers.find((provider) => provider.role === "primary");
  const maxTrend = Math.max(1, ...overview.trend.map((item) => item.attempts));
  const dayBudgetCount = overview.budget?.dayCount ?? 0;
  const dailyUsagePercent = Math.min(100, Math.round((dayBudgetCount / settings.dailyRequestLimit) * 100));
  const latestErrors = logs.filter((item) => !item.success).slice(0, 3);

  return (
    <div className="page-stack">
      <section className="gateway-hero">
        <div className="hero-copy">
          <div className="hero-icon"><Activity size={25} /></div>
          <div>
            <div className="hero-status-line"><StatusDot status={primary?.lastTestStatus ?? "untested"} /> <span>{primary ? "AI 网关已接管请求" : "等待配置主服务"}</span></div>
            <h2>{primary?.name ?? "暂无主服务"}</h2>
            <p>{primary ? `${primary.modelId} · ${new URL(primary.baseUrl).host}` : "在“AI 服务商”中完成配置后，游戏请求会自动经过此中台。"}</p>
          </div>
        </div>
        <div className="hero-route" aria-label="当前请求路由">
          <div><Bot size={18} /><span>斗罗游戏</span></div><ChevronRight size={16} />
          <div className="active"><Route size={18} /><span>运营网关</span></div><ChevronRight size={16} />
          <div><Server size={18} /><span>{primary?.name ?? "AI 服务"}</span></div>
        </div>
      </section>

      <section className="metric-grid" aria-label="今日运营指标">
        <MetricCard label="今日调用" value={formatNumber(overview.today.attempts)} hint={`每日上限 ${formatNumber(settings.dailyRequestLimit)}`} icon={Zap} accent="blue" />
        <MetricCard label="调用成功率" value={`${overview.today.successRate}%`} hint={`${overview.today.successes} 次成功`} icon={CheckCircle2} accent="green" />
        <MetricCard label="输入 Token" value={formatNumber(overview.today.promptTokens)} hint="发送给模型的上下文" icon={Sparkles} accent="violet" />
        <MetricCard label="输出 Token" value={formatNumber(overview.today.completionTokens)} hint="模型生成的内容" icon={Bot} accent="cyan" />
        <MetricCard label="预估费用" value={formatMoney(overview.today.estimatedCost)} hint="按各模型价格自动估算" icon={CircleDollarSign} accent="amber" />
        <MetricCard label="平均延迟" value={formatDuration(overview.today.avgLatencyMs)} hint={`${overview.errors24h} 次异常 / 24 小时`} icon={CircleGauge} accent={overview.errors24h ? "amber" : "blue"} />
      </section>

      <div className="dashboard-grid">
        <section className="panel trend-panel">
          <div className="panel-header">
            <div><span className="section-kicker">24 小时趋势</span><h3>请求与成功情况</h3></div>
            <div className="chart-legend"><span><i className="legend-total" />请求</span><span><i className="legend-success" />成功</span></div>
          </div>
          <div className="bar-chart" role="img" aria-label="过去 24 小时 AI 请求与成功数柱状图">
            {overview.trend.map((item, index) => (
              <div className="bar-column" key={`${item.label}-${index}`} title={`${item.label}：${item.attempts} 次请求，${item.successes} 次成功`}>
                <div className="bar-stack">
                  <span className="bar-total" style={{ height: `${Math.max(item.attempts ? 6 : 1, (item.attempts / maxTrend) * 100)}%` }} />
                  <span className="bar-success" style={{ height: `${Math.max(item.successes ? 4 : 0, (item.successes / maxTrend) * 100)}%` }} />
                </div>
                {index % 4 === 0 ? <small>{item.label}</small> : <small aria-hidden="true">&nbsp;</small>}
              </div>
            ))}
          </div>
          <div className="chart-summary">
            <div><strong>{overview.today.fallbackSuccesses}</strong><span>备用服务救活</span></div>
            <div><strong>{overview.activeProviders}</strong><span>已启用服务</span></div>
            <div><strong>{overview.errors24h}</strong><span>24 小时异常</span></div>
          </div>
        </section>

        <section className="panel quota-panel">
          <div className="panel-header"><div><span className="section-kicker">额度保护</span><h3>今日调用额度</h3></div><Gauge size={20} /></div>
          <div className="quota-ring" style={{ "--progress": `${dailyUsagePercent * 3.6}deg` } as React.CSSProperties}>
            <div><strong>{dailyUsagePercent}%</strong><span>已使用</span></div>
          </div>
          <div className="quota-values"><span>{dayBudgetCount} 次已用</span><span>{Math.max(0, settings.dailyRequestLimit - dayBudgetCount)} 次剩余</span></div>
          <div className="policy-row"><ShieldCheck size={17} /><div><strong>刷新页面不会重置</strong><span>公网 D1 持久化记录，每分钟 {settings.requestsPerMinute} 次</span></div></div>
          <button className="text-button" onClick={() => onNavigate("settings")}>调整限流策略 <ArrowUpRight size={16} /></button>
        </section>
      </div>

      <div className="dashboard-grid lower-grid">
        <section className="panel providers-summary">
          <div className="panel-header"><div><span className="section-kicker">路由池</span><h3>服务商状态</h3></div><button className="text-button" onClick={() => onNavigate("providers")}>管理 <ChevronRight size={16} /></button></div>
          <div className="provider-mini-list">
            {providers.map((provider) => (
              <div className="provider-mini" key={provider.id}>
                <div className="provider-avatar"><Server size={18} /></div>
                <div><strong>{provider.name}</strong><span>{provider.modelId} · 今日 {overview.providerBreakdown.find((item) => item.providerId === provider.id)?.attempts ?? 0} 次 · 输入 {formatNumber(overview.providerBreakdown.find((item) => item.providerId === provider.id)?.promptTokens ?? 0)} / 输出 {formatNumber(overview.providerBreakdown.find((item) => item.providerId === provider.id)?.completionTokens ?? 0)} · {formatMoney(overview.providerBreakdown.find((item) => item.providerId === provider.id)?.estimatedCost ?? 0)}</span></div>
                <span className={`role-pill role-${provider.role}`}>{provider.role === "primary" ? "主服务" : provider.role === "fallback" ? "备用" : "已停用"}</span>
                <StatusDot status={provider.lastTestStatus} />
              </div>
            ))}
          </div>
        </section>

        <section className="panel error-summary">
          <div className="panel-header"><div><span className="section-kicker">异常观测</span><h3>最近错误</h3></div><button className="text-button" onClick={() => onNavigate("logs")}>查看全部 <ChevronRight size={16} /></button></div>
          {latestErrors.length ? latestErrors.map((item) => (
            <div className="error-row" key={item.id}>
              <XCircle size={18} />
              <div><strong>{item.providerName} · {requestKindLabels[item.requestKind] ?? item.requestKind}</strong><span>{item.errorMessage ?? item.errorCode ?? "未知错误"}</span></div>
              <time>{formatTime(item.occurredAt)}</time>
            </div>
          )) : <div className="empty-inline"><CheckCircle2 size={22} /><span>近24小时没有记录到异常</span></div>}
        </section>
      </div>
    </div>
  );
}

function MetricCard({ label, value, hint, icon: Icon, accent }: { label: string; value: string; hint: string; icon: typeof Activity; accent: string }) {
  return (
    <article className={`metric-card metric-${accent}`}>
      <div className="metric-icon"><Icon size={20} /></div>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{hint}</small>
    </article>
  );
}

function ProvidersPage({ providers, onEdit, onRefresh, showToast }: {
  providers: Provider[];
  onEdit: (provider: Provider | "new") => void;
  onRefresh: (quiet?: boolean) => Promise<void>;
  showToast: (type: "success" | "error", message: string) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);

  const runAction = async (provider: Provider, action: "test" | "primary" | "enabled") => {
    setBusy(`${provider.id}:${action}`);
    try {
      if (action === "test") {
        const result = await api<{ message: string }>(`/api/providers/${provider.id}/test`, { method: "POST" });
        showToast("success", `${provider.name}：${result.message}`);
      } else if (action === "primary") {
        await api(`/api/providers/${provider.id}/primary`, { method: "PUT", body: "{}" });
        showToast("success", `${provider.name} 已切换为主服务`);
      } else {
        await api(`/api/providers/${provider.id}/enabled`, { method: "PUT", body: JSON.stringify({ enabled: !provider.enabled }) });
        showToast("success", `${provider.name} 已${provider.enabled ? "停用" : "启用"}`);
      }
      await onRefresh(true);
    } catch (error) {
      showToast("error", error instanceof Error ? error.message : "操作失败");
      await onRefresh(true);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="page-stack">
      <section className="page-intro">
        <div><span className="section-kicker">可视化路由配置</span><h2>管理主服务与备用服务</h2><p>排在第一位的已启用服务会承担主请求；异常时按顺序自动降级到后续服务。</p></div>
        <button className="primary-button" onClick={() => onEdit("new")}><Plus size={18} /> 添加 AI 服务商</button>
      </section>

      <div className="provider-card-grid">
        {providers.map((provider) => {
          const testBusy = busy === `${provider.id}:test`;
          const primaryBusy = busy === `${provider.id}:primary`;
          const toggleBusy = busy === `${provider.id}:enabled`;
          return (
            <article className={`provider-card ${provider.role === "primary" ? "is-primary" : ""}`} key={provider.id}>
              <div className="provider-card-top">
                <div className="provider-logo"><Server size={22} /></div>
                <div className="provider-title"><div><h3>{provider.name}</h3><span className={`role-pill role-${provider.role}`}>{provider.role === "primary" ? "主服务" : provider.role === "fallback" ? "备用服务" : "已停用"}</span></div><p>{provider.modelId} · 可选 {provider.models?.length ?? 1} 个模型</p></div>
                <button className="icon-button subtle" onClick={() => onEdit(provider)} aria-label={`编辑 ${provider.name}`}><Pencil size={17} /></button>
              </div>

              <dl className="provider-details">
                <div><dt>接口地址</dt><dd>{provider.baseUrl}</dd></div>
                <div><dt>API 密钥</dt><dd className={provider.hasApiKey ? "" : "warning-text"}><KeyRound size={14} /> {provider.apiKeyMasked}</dd></div>
                <div><dt>请求超时</dt><dd>{formatDuration(provider.timeoutMs)}</dd></div>
                <div><dt>模型价格</dt><dd>{formatMoney(provider.models?.find((model) => model.isDefault)?.inputPricePerMillion ?? 0)} / {formatMoney(provider.models?.find((model) => model.isDefault)?.outputPricePerMillion ?? 0)} · 每百万输入/输出</dd></div>
                <div><dt>最后测试</dt><dd><StatusDot status={provider.lastTestStatus} /> {formatTime(provider.lastTestAt)}{provider.lastTestLatencyMs ? ` · ${formatDuration(provider.lastTestLatencyMs)}` : ""}</dd></div>
              </dl>

              {provider.lastError ? <div className="provider-error"><AlertTriangle size={16} /><span>{provider.lastError}</span></div> : null}

              <div className="provider-actions">
                <button className="secondary-button" onClick={() => runAction(provider, "test")} disabled={testBusy || !provider.hasApiKey}>{testBusy ? <Spinner /> : <TestTube2 size={17} />} 测试连接</button>
                {provider.role !== "primary" ? <button className="secondary-button" onClick={() => runAction(provider, "primary")} disabled={primaryBusy || !provider.hasApiKey}>{primaryBusy ? <Spinner /> : <ArrowUpRight size={17} />} 设为主服务</button> : <span className="primary-confirm"><Check size={17} /> 当前主服务</span>}
                <button className="toggle-button" onClick={() => runAction(provider, "enabled")} disabled={toggleBusy || (!provider.hasApiKey && !provider.enabled)} aria-pressed={provider.enabled}>
                  {toggleBusy ? <Spinner /> : provider.enabled ? <ToggleRight size={24} /> : <ToggleLeft size={24} />} {provider.enabled ? "已启用" : "已停用"}
                </button>
              </div>
            </article>
          );
        })}
      </div>

      <section className="info-banner"><ShieldCheck size={20} /><div><strong>这里修改会直接影响公网游戏</strong><span>服务商、默认模型和价格保存到云端；密钥使用 AES-GCM 加密，日志不记录游戏对话原文。关闭本机后公网仍使用最后保存的配置。</span></div></section>
    </div>
  );
}

function LogsPage({ logs, providers, setLogs, showToast }: {
  logs: UsageEvent[];
  providers: Provider[];
  setLogs: (logs: UsageEvent[]) => void;
  showToast: (type: "success" | "error", message: string) => void;
}) {
  const [status, setStatus] = useState("");
  const [providerId, setProviderId] = useState("");
  const [kind, setKind] = useState("");
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [busy, setBusy] = useState(false);

  const filteredLogs = useMemo(() => {
    const normalized = deferredQuery.trim().toLowerCase();
    if (!normalized) return logs;
    return logs.filter((item) => [item.providerName, item.modelId, item.errorMessage, item.errorCode, requestKindLabels[item.requestKind]].some((value) => value?.toLowerCase().includes(normalized)));
  }, [deferredQuery, logs]);

  const applyFilters = async () => {
    setBusy(true);
    try {
      const params = new URLSearchParams({ limit: "120" });
      if (status) params.set("status", status);
      if (providerId) params.set("provider", providerId);
      if (kind) params.set("kind", kind);
      const result = await api<{ data: UsageEvent[] }>(`/api/logs?${params}`);
      setLogs(result.data);
    } catch (error) {
      showToast("error", error instanceof Error ? error.message : "日志读取失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page-stack">
      <section className="page-intro"><div><span className="section-kicker">请求审计</span><h2>AI 调用与错误记录</h2><p>只记录类型、服务商、Token、延迟和错误摘要，不保存玩家剧情原文。</p></div></section>

      <section className="filter-bar" aria-label="调用记录筛选">
        <label><span>状态</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">全部状态</option><option value="success">成功</option><option value="error">异常</option></select></label>
        <label><span>服务商</span><select value={providerId} onChange={(event) => setProviderId(event.target.value)}><option value="">全部服务商</option>{providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}</select></label>
        <label><span>请求类型</span><select value={kind} onChange={(event) => setKind(event.target.value)}><option value="">全部类型</option>{Object.entries(requestKindLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="search-field"><span>关键字</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="服务商、模型或错误" /></label>
        <button className="secondary-button filter-button" onClick={applyFilters} disabled={busy}>{busy ? <Spinner /> : <RefreshCw size={17} />} 应用筛选</button>
      </section>

      <section className="table-panel">
        <div className="table-scroll">
          <table>
            <thead><tr><th>时间</th><th>状态</th><th>请求类型</th><th>服务商 / 模型</th><th>输入 Token</th><th>输出 Token</th><th>预估费用</th><th>延迟</th><th>路由</th><th>结果摘要</th></tr></thead>
            <tbody>
              {filteredLogs.map((item) => (
                <tr key={item.id}>
                  <td className="nowrap">{formatTime(item.occurredAt)}</td>
                  <td><span className={`result-pill ${item.success ? "success" : "error"}`}>{item.success ? <CheckCircle2 size={14} /> : <XCircle size={14} />}{item.success ? "成功" : "异常"}</span></td>
                  <td>{requestKindLabels[item.requestKind] ?? item.requestKind}</td>
                  <td><strong className="table-main">{item.providerName}</strong><span className="table-sub">{item.modelId}</span></td>
                  <td>{formatNumber(item.promptTokens)}</td>
                  <td>{formatNumber(item.completionTokens)}</td>
                  <td className="nowrap">{formatMoney(item.estimatedCost ?? 0)}</td>
                  <td>{formatDuration(item.latencyMs)}</td>
                  <td>{item.fallbackUsed ? <span className="fallback-pill">备用救活</span> : "主路由"}</td>
                  <td className={item.success ? "muted-cell" : "error-cell"}>{item.success ? `HTTP ${item.statusCode ?? 200}` : item.errorMessage ?? item.errorCode ?? "未知错误"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!filteredLogs.length ? <div className="empty-state"><Database size={28} /><strong>暂无符合条件的调用记录</strong><span>测试一次服务商连接后，记录会出现在这里。</span></div> : null}
      </section>
    </div>
  );
}

function SettingsPage({ settings, onSaved, showToast }: {
  settings: Settings;
  onSaved: (settings: Settings) => void;
  showToast: (type: "success" | "error", message: string) => void;
}) {
  const [form, setForm] = useState(settings);
  const [busy, setBusy] = useState(false);

  useEffect(() => setForm(settings), [settings]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      const result = await api<{ data: Settings }>("/api/settings", { method: "PUT", body: JSON.stringify(form) });
      setForm(result.data);
      onSaved(result.data);
    } catch (error) {
      showToast("error", error instanceof Error ? error.message : "策略保存失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page-stack settings-layout">
      <section className="page-intro"><div><span className="section-kicker">全局保护策略</span><h2>限流、自动降级与日志</h2><p>设置保存在公网数据库，保存后立即影响公网游戏；关闭本机不会中断游戏。</p></div></section>
      <form className="settings-form" onSubmit={submit}>
        <section className="settings-card">
          <div className="settings-card-heading"><div className="settings-icon blue"><Gauge size={20} /></div><div><h3>请求额度</h3><p>按访问来源计数，防止刷新页面绕过限流。</p></div></div>
          <div className="form-grid two-columns">
            <label><span>每分钟最多请求</span><input type="number" min="1" max="120" value={form.requestsPerMinute} onChange={(event) => setForm((current) => ({ ...current, requestsPerMinute: Number(event.target.value) }))} /><small>允许 1–120 次，当前推荐 12 次</small></label>
            <label><span>每日最多请求</span><input type="number" min="1" max="100000" value={form.dailyRequestLimit} onChange={(event) => setForm((current) => ({ ...current, dailyRequestLimit: Number(event.target.value) }))} /><small>当前个人使用推荐 120 次</small></label>
          </div>
        </section>

        <section className="settings-card">
          <div className="settings-card-heading"><div className="settings-icon green"><Route size={20} /></div><div><h3>故障自动降级</h3><p>主服务超时、限流或返回异常时，是否自动尝试备用服务。</p></div></div>
          <button type="button" className={`policy-toggle ${form.autoFallback ? "on" : ""}`} onClick={() => setForm((current) => ({ ...current, autoFallback: !current.autoFallback }))} aria-pressed={form.autoFallback}>
            <span className="toggle-track"><i /></span>
            <span><strong>{form.autoFallback ? "已启用自动降级" : "已关闭自动降级"}</strong><small>{form.autoFallback ? "主服务失败后会按优先级继续尝试" : "只调用当前主服务"}</small></span>
          </button>
        </section>

        <section className="settings-card">
          <div className="settings-card-heading"><div className="settings-icon violet"><Database size={20} /></div><div><h3>调用记录保留</h3><p>仅保留运营元数据，不保存玩家剧情或人物对话原文。</p></div></div>
          <label className="single-field"><span>日志保留天数</span><input type="number" min="1" max="365" value={form.logRetentionDays} onChange={(event) => setForm((current) => ({ ...current, logRetentionDays: Number(event.target.value) }))} /><small>允许 1–365 天，超期数据在中台启动时自动清理</small></label>
        </section>

        <div className="settings-save"><div><CheckCircle2 size={18} /><span>保存后立即同步到公网 AI 网关。</span></div><button className="primary-button" type="submit" disabled={busy}>{busy ? <Spinner /> : <Save size={17} />} 保存运行策略</button></div>
      </form>
    </div>
  );
}

function ProviderDialog({ provider, onClose, onSaved, showToast }: {
  provider: Provider | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
  showToast: (type: "success" | "error", message: string) => void;
}) {
  const initialModels: ProviderModel[] = provider?.models?.length
    ? provider.models
    : [{
      modelId: provider?.modelId ?? "",
      displayName: provider?.modelId ?? "",
      enabled: true,
      isDefault: true,
      inputPricePerMillion: 0,
      outputPricePerMillion: 0,
    }];
  const [form, setForm] = useState({
    name: provider?.name ?? "",
    baseUrl: provider?.baseUrl ?? "",
    models: initialModels,
    apiKey: "",
    timeoutMs: provider?.timeoutMs ?? 90000,
    enabled: provider?.enabled ?? true,
  });
  const [busy, setBusy] = useState(false);
  const [discovering, setDiscovering] = useState(false);

  const updateModel = (index: number, patch: Partial<ProviderModel>) => {
    setForm((current) => ({
      ...current,
      models: current.models.map((model, modelIndex) => modelIndex === index ? { ...model, ...patch } : model),
    }));
  };

  const chooseDefault = (index: number) => {
    setForm((current) => ({
      ...current,
      models: current.models.map((model, modelIndex) => ({ ...model, enabled: modelIndex === index ? true : model.enabled, isDefault: modelIndex === index })),
    }));
  };

  const addModel = () => {
    setForm((current) => ({
      ...current,
      models: [...current.models, { modelId: "", displayName: "", enabled: true, isDefault: current.models.length === 0, inputPricePerMillion: 0, outputPricePerMillion: 0 }],
    }));
  };

  const removeModel = (index: number) => {
    setForm((current) => {
      const next = current.models.filter((_, modelIndex) => modelIndex !== index);
      if (next.length && !next.some((model) => model.isDefault)) next[0] = { ...next[0], isDefault: true, enabled: true };
      return { ...current, models: next };
    });
  };

  const discoverModels = async () => {
    if (!provider) {
      showToast("error", "请先保存服务商，再自动同步模型列表");
      return;
    }
    setDiscovering(true);
    try {
      const result = await api<{ data: ProviderModel[] }>(`/api/providers/${provider.id}/models`, { method: "POST" });
      setForm((current) => ({ ...current, models: result.data }));
      showToast("success", `已同步 ${result.data.length} 个模型，你可以继续设置价格和默认模型`);
    } catch (error) {
      showToast("error", error instanceof Error ? error.message : "模型列表同步失败");
    } finally {
      setDiscovering(false);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      const models = form.models
        .map((model) => ({ ...model, modelId: model.modelId.trim(), displayName: model.displayName.trim() || model.modelId.trim() }))
        .filter((model) => model.modelId);
      if (!models.length) throw new Error("请至少添加一个模型");
      if (!models.some((model) => model.isDefault && model.enabled)) throw new Error("请选择一个已启用的默认模型");
      await api(provider ? `/api/providers/${provider.id}` : "/api/providers", {
        method: provider ? "PUT" : "POST",
        body: JSON.stringify({ ...form, models, modelId: models.find((model) => model.isDefault)?.modelId }),
      });
      await onSaved();
    } catch (error) {
      showToast("error", error instanceof Error ? error.message : "服务商保存失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="dialog provider-dialog" role="dialog" aria-modal="true" aria-labelledby="provider-dialog-title">
        <header><div><span className="section-kicker">OpenAI 兼容服务</span><h2 id="provider-dialog-title">{provider ? `编辑 ${provider.name}` : "添加 AI 服务商"}</h2></div><button className="icon-button" onClick={onClose} aria-label="关闭窗口"><X size={19} /></button></header>
        <form onSubmit={submit}>
          <label><span>服务商名称</span><input autoFocus value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="例如：Agnes AI" required /></label>
          <label><span>接口基础地址</span><input value={form.baseUrl} onChange={(event) => setForm((current) => ({ ...current, baseUrl: event.target.value }))} placeholder="https://example.com/v1" required /><small>需使用 OpenAI 兼容的 /v1/chat/completions 协议</small></label>
          <label><span>API 密钥</span><input type="password" autoComplete="new-password" value={form.apiKey} onChange={(event) => setForm((current) => ({ ...current, apiKey: event.target.value }))} placeholder={provider?.hasApiKey ? `留空则保留原密钥（${provider.apiKeyMasked}）` : "请输入完整密钥"} required={!provider?.hasApiKey} /><small>保存后只显示掩码，完整密钥不会返回浏览器</small></label>
          <section className="model-editor" aria-label="服务商模型与价格">
            <div className="model-editor-heading">
              <div><strong>可用模型与价格</strong><span>价格单位：人民币 / 100 万 Token</span></div>
              <div>
                <button type="button" className="secondary-button" onClick={discoverModels} disabled={discovering || !provider}>{discovering ? <Spinner /> : <RefreshCw size={17} />} 同步模型</button>
                <button type="button" className="secondary-button" onClick={addModel}><Plus size={17} /> 手动添加</button>
              </div>
            </div>
            <div className="model-list">
              {form.models.map((model, index) => (
                <article className={`model-row ${model.isDefault ? "is-default" : ""}`} key={index}>
                  <button type="button" className="default-model-button" onClick={() => chooseDefault(index)} aria-pressed={model.isDefault} aria-label={`将第 ${index + 1} 个模型设为默认`}>
                    <span>{model.isDefault ? <Check size={15} /> : null}</span>{model.isDefault ? "默认" : "设为默认"}
                  </button>
                  <label><span>模型 ID</span><input value={model.modelId} onChange={(event) => updateModel(index, { modelId: event.target.value })} placeholder="例如：agnes-2.5-flash" /></label>
                  <label><span>输入价格</span><input type="number" min="0" step="0.000001" value={model.inputPricePerMillion} onChange={(event) => updateModel(index, { inputPricePerMillion: Number(event.target.value) })} /></label>
                  <label><span>输出价格</span><input type="number" min="0" step="0.000001" value={model.outputPricePerMillion} onChange={(event) => updateModel(index, { outputPricePerMillion: Number(event.target.value) })} /></label>
                  <button type="button" className="remove-model-button" onClick={() => removeModel(index)} disabled={form.models.length === 1} aria-label={`删除模型 ${model.modelId || index + 1}`}><X size={17} /></button>
                </article>
              ))}
            </div>
            <p>服务商支持 `/v1/models` 时可自动同步；不支持时直接手动填写即可。价格由你设置，设为 0 表示暂不计费。</p>
          </section>
          <div className="form-grid two-columns">
            <label><span>请求超时（毫秒）</span><input type="number" min="1000" max="120000" step="1000" value={form.timeoutMs} onChange={(event) => setForm((current) => ({ ...current, timeoutMs: Number(event.target.value) }))} /></label>
            <button type="button" className={`policy-toggle compact-toggle ${form.enabled ? "on" : ""}`} onClick={() => setForm((current) => ({ ...current, enabled: !current.enabled }))} aria-pressed={form.enabled}><span className="toggle-track"><i /></span><span><strong>{form.enabled ? "保存后启用" : "保存后停用"}</strong></span></button>
          </div>
          <div className="dialog-note"><ShieldCheck size={18} /><span>密钥在公网服务端加密保存，不写入 Git 或页面代码；本机只保存中台管理凭证。</span></div>
          <footer><button type="button" className="secondary-button" onClick={onClose}>取消</button><button type="submit" className="primary-button" disabled={busy}>{busy ? <Spinner /> : <Save size={17} />} 保存服务商</button></footer>
        </form>
      </section>
    </div>
  );
}
