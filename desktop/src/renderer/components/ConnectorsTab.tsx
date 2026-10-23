import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bot, Check, CircleAlert, Download, ExternalLink, FolderGit2, Globe, LoaderCircle, Lock, Plug, Plus, RotateCw, Trash2, Unplug } from 'lucide-react';
import { Fragment, type ReactElement, type ReactNode, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import type * as T from '../../shared/api';
import * as A from '../../shared/api';
import { api } from '../lib/api';
import { formatDateTime, t as translate, useT } from '../lib/i18n';
import { projectLabel } from '../lib/projectName';
import {
  type ConnectorOverride,
  type ConnectorPreset,
  type FieldProblem,
  type StatusTone,
  connectorFormProblems,
  connectorName,
  connectorPresets,
  connectorStatus,
  connectorURL,
  isWide,
  overrideOf,
  overrideRequest,
  secretNameFor,
  tokenLine,
} from '../lib/connectors';
import { useNow } from '../lib/useNow';
import { cn, errorMessage, timeAgo } from '../lib/utils';
import { ConfirmDialog } from './ConfirmDialog';
import { ConnectorImportDialog } from './ConnectorImportDialog';
import { ConnectorMark } from './ConnectorMark';
import { ConnectorRequestCards } from './ConnectorRequestCard';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card, Code, Notice } from './ui/card';
import { Field, Input } from './ui/input';
import { Skeleton } from './ui/skeleton';
import { Switch } from './ui/switch';
import { Tip } from './ui/tooltip';

// Connectors, a section of a project's or an agent's Settings tab, and of
// AgentBox's Settings: remote MCP servers — Notion, Linear, Figma… — that every
// project, a project's agents, or one agent, get as tools. A target is "pawly"
// or "pawly/agent-01", as under Secrets, or "" for the AgentBox-wide ones.
// A project's page lists the AgentBox-wide ones it gets with a three-way
// override; one of its own of the same name replaces one there.
//
// The user signs in here, in their own browser, and the daemon keeps the
// tokens: no page can read one, so what a row shows is the connector's state
// and when its token runs out, never the token.

// embedded drops the tab's own scrolling and margins, inside a Settings page
// that has them.
export function ConnectorsTab({ target, embedded }: { target: string; embedded?: boolean }) {
  const t = useT();
  const queryClient = useQueryClient();
  const projects = useQuery({ queryKey: ['projects'], queryFn: api.projects });
  const wide = target === '';
  const forAgent = target.includes('/');
  const connectors = useQuery({ queryKey: ['connectors', target], queryFn: () => api.connectors(target) });
  const [removing, setRemoving] = useState<T.Connector | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['connectors'] });
  const connect = useConnect(target);

  const scope = wide ? A.ConnectorWide : forAgent ? 'agent' : 'project';
  const mine = connectors.data?.filter((c) => c.scope === scope) ?? [];
  const inherited = forAgent ? (connectors.data?.filter((c) => c.scope !== 'agent') ?? []) : [];
  const fromAgentBox = !wide && !forAgent ? (connectors.data?.filter(isWide) ?? []) : [];
  const [project, agent] = target.split('/');

  return (
    <div className={cn(!embedded && 'h-full overflow-y-auto p-5')}>
      <div className={cn('mx-auto grid gap-4', !embedded && 'max-w-4xl')}>
        {!wide && <ConnectorRequestCards project={project} agent={agent} />}

        <Card
          title={
            wide
              ? t('project.connectors.wideOwn', { count: mine.length })
              : forAgent
                ? t('project.connectors.agentOwn', { count: mine.length })
                : t('project.connectors.projectOwn', { count: mine.length })
          }
          icon={Plug}
          description={
            wide
              ? t('project.connectors.wideOwnDescription')
              : forAgent
                ? t('project.connectors.agentOwnDescription')
                : t('project.connectors.projectOwnDescription')
          }
        >
          {connect.error && <Notice className="mb-3">{connect.error}</Notice>}
          {connectors.error ? (
            <LoadFailed message={errorMessage(connectors.error)} />
          ) : connectors.isPending ? (
            <ConnectorSkeletons />
          ) : mine.length === 0 ? (
            <NoConnectors />
          ) : (
            <ConnectorList label={t('project.connectors.listAria')}>
              {mine.map((c) => (
                <ConnectorRow
                  key={c.name}
                  connector={c}
                  target={target}
                  connecting={connect.starting === c.name}
                  onConnect={() => connect.start(c.name)}
                  onReopen={connect.reopen(c.name)}
                  onRemove={() => setRemoving(c)}
                />
              ))}
            </ConnectorList>
          )}
        </Card>

        {fromAgentBox.length > 0 && (
          <Card
            title={t('project.connectors.fromAgentBox', { count: fromAgentBox.length })}
            icon={Globe}
            description={t('project.connectors.fromAgentBoxDescription')}
          >
            <ConnectorList label={t('project.connectors.agentBoxAria')}>
              {fromAgentBox.map((c) => (
                <ConnectorRow key={c.name} connector={c} control={<OverrideControl project={target} connector={c} />} />
              ))}
            </ConnectorList>
          </Card>
        )}

        {inherited.length > 0 && (
          <Card
            title={t('project.connectors.fromProject', { count: inherited.length })}
            icon={Lock}
            description={t('project.connectors.fromProjectDescription')}
          >
            <ConnectorList label={t('project.connectors.projectAria')}>
              {inherited.map((c) => (
                <ConnectorRow key={c.name} connector={c} />
              ))}
            </ConnectorList>
          </Card>
        )}

        <Catalog target={target} scope={scope} have={connectors.data ?? []} onAdded={refresh} connect={connect.start} />
      </div>

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={t('project.connectors.removeTitle', { name: removing?.name ?? '' })}
        description={
          removing?.scope === A.ConnectorWide
            ? t('project.connectors.removeDescriptionWide')
            : removing?.scope === 'project'
              ? t('project.connectors.removeDescriptionProject', { project: projectLabel(removing.project ?? '', projects.data) })
              : t('project.connectors.removeDescriptionAgent', { agent: removing?.agent ?? '' })
        }
        confirmLabel={t('common.remove')}
        destructive
        onConfirm={async () => {
          await api.removeConnector(target, removing!.name);
          toast(t('project.connectors.removed', { name: removing!.name }));
          await refresh();
        }}
      />
    </div>
  );
}

// NoConnectors is a target with none of its own yet: the catalog's marks,
// and what one does, over the catalog below.
function NoConnectors() {
  const t = useT();
  return (
    <div className="grid justify-items-center gap-3 rounded-xl border border-dashed border-line-strong px-6 py-7 text-center" data-connectors-empty>
      <div className="flex items-center gap-1.5" aria-hidden="true">
        {connectorPresets.map((p) => (
          <ConnectorMark key={p.id} preset={p.id} className="text-muted" />
        ))}
      </div>
      <div className="grid max-w-md gap-1">
        <p className="text-sm font-semibold text-primary">{t('project.connectors.emptyTitle')}</p>
        <p className="text-[12.5px] leading-relaxed text-subtle">{t.rich('project.connectors.none', { code: (c) => <Code>{c}</Code> })}</p>
      </div>
    </div>
  );
}

// ConnectorSkeletons stand in for the list until it arrives, in the shape
// of its rows.
function ConnectorSkeletons() {
  return (
    <div className="grid gap-2" aria-busy="true" data-connectors-loading>
      {['w-24', 'w-32'].map((w) => (
        <div key={w} className="flex items-center gap-3 rounded-xl border border-line-faint bg-surface-faint p-3">
          <Skeleton className="size-9 rounded-[10px]" />
          <div className="grid flex-1 gap-1.5">
            <Skeleton className={cn('h-3.5', w)} />
            <Skeleton className="h-3 w-40" />
          </div>
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-8 w-28 rounded-lg" />
        </div>
      ))}
    </div>
  );
}

// LoadFailed is the list the daemon wouldn't give: what it said, where the
// list would be. The page refetches when connectors change.
function LoadFailed({ message }: { message: string }) {
  const t = useT();
  return (
    <div role="alert" className="flex items-start gap-3 rounded-xl border border-rose-500/25 bg-rose-500/[0.06] p-3" data-connectors-error>
      <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-rose-500/10 text-rose-300 ring-1 ring-inset ring-rose-400/25">
        <CircleAlert className="size-4" />
      </span>
      <div className="grid min-w-0 gap-0.5">
        <p className="text-[13px] font-medium text-primary">{t('project.connectors.loadFailed')}</p>
        <p className="break-words font-mono text-[11.5px] text-rose-300">{message}</p>
      </div>
    </div>
  );
}

// useConnect starts a sign-in: the daemon answers with the page to open, the
// user's own browser opens it, and the row turns connected when the daemon
// publishes the connector (lib/events.ts refetches the list). It says so
// when a sign-in it started finishes, one way or the other.
function useConnect(target: string) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | undefined>();
  // starting is the connect call on its way; waiting, the sign-in after it,
  // until the connector stops waiting on the browser.
  const [starting, setStarting] = useState<string | undefined>();
  const [waiting, setWaiting] = useState<string | undefined>();
  const urls = useRef(new Map<string, string>());
  const connectors = useQuery({ queryKey: ['connectors', target], queryFn: () => api.connectors(target) });

  const start = async (name: string) => {
    setError(undefined);
    setStarting(name);
    try {
      const result = await api.connectConnector(target, name);
      urls.current.set(name, result.authorizationUrl);
      queryClient.setQueryData<T.Connector[]>(['connectors', target], (list) => list?.map((c) => (c.name === name ? result.connector : c)));
      setWaiting(name);
      await window.agentbox.openExternal(result.authorizationUrl);
    } catch (err) {
      setError(`${name}: ${errorMessage(err)}`);
    } finally {
      setStarting(undefined);
    }
  };

  const settled = waiting ? connectors.data?.find((c) => c.name === waiting && c.status !== A.ConnectorConnecting) : undefined;
  useEffect(() => {
    if (!settled) return;
    setWaiting(undefined);
    if (settled.status === A.ConnectorConnected) toast.success(translate('project.connectors.connected', { name: settled.name }), { description: translate('project.connectors.connectedDetail') });
    else if (settled.error) toast.error(translate('project.connectors.notConnected', { name: settled.name }), { description: settled.error });
  }, [settled]);

  const reopen = (name: string) => {
    const url = urls.current.get(name);
    return url ? () => void window.agentbox.openExternal(url) : undefined;
  };
  return { start, starting, error, reopen };
}

// Catalog is the servers the app knows, and a custom address. Picking one
// opens its form under the tiles: a name and URL for a browser sign-in, a
// token for a server that takes one instead.
function Catalog({
  target,
  scope,
  have,
  onAdded,
  connect,
}: {
  target: string;
  scope: string;
  have: T.Connector[];
  onAdded: () => Promise<unknown>;
  connect: (name: string) => Promise<void>;
}) {
  const t = useT();
  const [picked, setPicked] = useState<ConnectorPreset | 'custom' | null>(null);
  const [importing, setImporting] = useState(false);
  // An AgentBox-wide one doesn't take a project's tile: the project can add
  // its own, which replaces it there.
  const added = (p: ConnectorPreset) => have.find((c) => (scope === A.ConnectorWide || !isWide(c)) && (c.url === p.url || c.name === p.name));

  return (
    <Card
      title={
        scope === A.ConnectorWide
          ? t('project.connectors.giveWide')
          : scope === 'agent'
            ? t('project.connectors.giveAgent')
            : t('project.connectors.giveProject')
      }
      icon={Plus}
      action={
        // An agent's own connectors are added one at a time: an import goes
        // AgentBox-wide or to a project.
        scope !== 'agent' && (
          <Button size="sm" variant="secondary" onClick={() => setImporting(true)} data-connectors-import>
            <Download />
            {t('project.connectors.import')}
          </Button>
        )
      }
      description={
        scope === A.ConnectorWide
          ? t('project.connectors.giveWideDescription')
          : scope === 'agent'
            ? t('project.connectors.giveAgentDescription')
            : t('project.connectors.giveProjectDescription')
      }
    >
      <div className="grid auto-rows-fr grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-2" role="list" aria-label={t('project.connectors.catalogAria')}>
        {connectorPresets.map((p) => {
          const existing = added(p);
          return (
            <Tile
              key={p.id}
              id={p.label}
              label={p.label}
              detail={p.blurb}
              added={existing ? t('project.connectors.addedAs', { name: existing.name }) : undefined}
              selected={picked !== 'custom' && picked?.id === p.id}
              mark={<ConnectorMark preset={p.id} />}
              onClick={() => setPicked(picked !== 'custom' && picked?.id === p.id ? null : p)}
            />
          );
        })}
        <Tile
          id="Custom URL"
          label={t('project.connectors.customUrl')}
          detail={t('project.connectors.customDetail')}
          selected={picked === 'custom'}
          mark={<ConnectorMark className="border border-dashed border-line-strong bg-transparent ring-0" />}
          onClick={() => setPicked(picked === 'custom' ? null : 'custom')}
        />
      </div>
      {picked && (
        <ConnectorForm
          key={picked === 'custom' ? 'custom' : picked.id}
          target={target}
          preset={picked === 'custom' ? undefined : picked}
          taken={have.filter((c) => c.scope === scope).map((c) => c.name)}
          onDone={async (connector) => {
            setPicked(null);
            await onAdded();
            if (connector.auth === A.ConnectorOAuth) await connect(connector.name);
            else toast(t('project.connectors.added', { name: connector.name }), { description: connector.status === A.ConnectorConnected ? t('project.connectors.addedDetail') : undefined });
          }}
        />
      )}
      {importing && <ConnectorImportDialog project={scope === 'project' ? target : undefined} onClose={() => setImporting(false)} />}
    </Card>
  );
}

// Tile is a server in the catalog: its mark, its name and one line on what
// it does, all of a height. One this target has already is shown as added,
// and can't be picked again.
function Tile({
  id,
  label,
  detail,
  mark,
  added,
  selected,
  onClick,
}: {
  id: string;
  label: string;
  detail: string;
  mark: ReactNode;
  // added says under what name this target has it already.
  added?: string;
  selected: boolean;
  onClick: () => void;
}) {
  const t = useT();
  return (
    <button
      type="button"
      role="listitem"
      disabled={!!added}
      aria-pressed={selected}
      title={added}
      data-connector-preset={id}
      onClick={onClick}
      className={cn(
        'flex min-w-0 items-center gap-3 rounded-xl border p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400',
        selected ? 'border-brand-400/60 bg-brand-500/10 [&>span:first-child]:text-brand-300' : 'border-line-faint bg-surface-faint hover:border-line-strong hover:bg-surface',
        'disabled:cursor-default disabled:hover:border-line-faint disabled:hover:bg-surface-faint',
      )}
    >
      {mark}
      <span className="grid min-w-0 flex-1 gap-0.5">
        <span className="flex min-w-0 items-center gap-2">
          <span className={cn('truncate text-[13px] font-medium', added ? 'text-tertiary' : 'text-primary')}>{label}</span>
          {added && (
            <span className="ml-auto inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-emerald-300" data-connector-added>
              <Check className="size-3.5" />
              {t('project.connectors.addedBadge')}
            </span>
          )}
        </span>
        <span className="truncate text-[11.5px] text-subtle">{detail}</span>
      </span>
    </button>
  );
}

type AuthChoice = typeof A.ConnectorOAuth | typeof A.ConnectorSecret | typeof A.ConnectorNone;

// ConnectorForm adds a connector. For a browser sign-in that is a name and a
// URL, and the sign-in starts as soon as it is added; for a token, the token
// is stored as a secret of the same target first and the connector sends it
// in a header, so it is kept, and shown, the way any other secret is. An
// AgentBox-wide connector's token goes with it instead, kept by AgentBox and
// given to no agent.
function ConnectorForm({
  target,
  preset,
  taken,
  onDone,
}: {
  target: string;
  preset?: ConnectorPreset;
  taken: string[];
  onDone: (connector: T.Connector) => Promise<void>;
}) {
  const t = useT();
  const [url, setUrl] = useState(preset?.url ?? '');
  const [name, setName] = useState(preset?.name ?? '');
  const [nameTouched, setNameTouched] = useState(!!preset);
  const [auth, setAuth] = useState<AuthChoice>(preset?.auth ?? A.ConnectorOAuth);
  // The secret's name follows the connector's, ACME_TOKEN for acme, until
  // the user types one of their own.
  const [secretName, setSecretName] = useState(preset?.secret?.name ?? '');
  const [secretTouched, setSecretTouched] = useState(!!preset?.secret);
  const [header, setHeader] = useState(preset?.secret?.header ?? 'Authorization');
  const [token, setToken] = useState('');
  const shownName = nameTouched ? name : connectorName(connectorURL(url));
  const shownSecret = secretTouched ? secretName : secretNameFor(shownName);

  const save = useMutation({
    mutationFn: async () => {
      const req: T.SetConnectorRequest = { url: connectorURL(url), auth };
      if (auth === A.ConnectorSecret) {
        if (target === '') req.secretValue = token;
        else await api.setSecret(target, shownSecret.trim(), token);
        req.secret = shownSecret.trim();
        req.header = header.trim();
        // A preset says what goes before the token; a custom header leaves it
        // to the daemon, which puts Bearer before one in Authorization.
        if (preset?.secret) req.scheme = preset.secret.scheme;
      }
      return api.setConnector(target, shownName, req);
    },
    onSuccess: async (connector) => {
      setToken('');
      await onDone(connector);
    },
  });

  // Every reason Add is greyed out is said under its field.
  const problems = connectorFormProblems({ name: shownName, url, auth, secret: shownSecret, header, token, taken });
  const ready = Object.keys(problems).length === 0;

  return (
    <form
      className="mt-3 grid gap-4 rounded-xl border border-line-faint bg-surface-faint p-4"
      data-connector-form={preset?.id ?? 'custom'}
      onSubmit={(event) => {
        event.preventDefault();
        if (ready && !save.isPending) save.mutate();
      }}
    >
      {preset?.secret && <Notice tone="info">{preset.secret.why}</Notice>}
      <div className="grid gap-4 sm:grid-cols-[minmax(0,0.7fr)_minmax(0,1.6fr)]">
        <Field
          label={t('project.connectors.nameLabel')}
          htmlFor="connector-name"
          hint={problemHint(problems.name, t('project.connectors.nameHint'))}
        >
          <Input
            id="connector-name"
            className="font-mono text-[13px]"
            placeholder="acme"
            autoComplete="off"
            spellCheck={false}
            aria-invalid={isWrong(problems.name)}
            value={shownName}
            onChange={(event) => {
              setNameTouched(true);
              setName(event.target.value.toLowerCase());
            }}
          />
        </Field>
        <Field label={t('project.connectors.urlLabel')} htmlFor="connector-url" hint={problemHint(problems.url, t('project.connectors.urlHint'))}>
          <Input
            id="connector-url"
            className="font-mono text-[13px]"
            placeholder="https://mcp.example.com/mcp"
            autoComplete="off"
            spellCheck={false}
            aria-invalid={isWrong(problems.url)}
            value={url}
            onChange={(event) => setUrl(event.target.value)}
          />
        </Field>
      </div>

      {!preset && (
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t('project.connectors.signInAria')}>
          {(
            [
              [A.ConnectorOAuth, t('project.connectors.authOAuth')],
              [A.ConnectorSecret, t('project.connectors.authSecret')],
              [A.ConnectorNone, t('project.connectors.authNone')],
            ] as const
          ).map(([value, label]) => (
            <Button key={value} type="button" size="sm" variant={auth === value ? 'primary' : 'ghost'} role="radio" aria-checked={auth === value} onClick={() => setAuth(value)}>
              {label}
            </Button>
          ))}
        </div>
      )}

      {auth === A.ConnectorSecret && (
        <div className="grid gap-4 sm:grid-cols-3">
          <Field
            label={preset?.secret?.tokenLabel ?? t('project.connectors.tokenLabel')}
            htmlFor="connector-token"
            hint={problemHint(problems.token, target === '' ? t('project.connectors.tokenHintWide') : t('project.connectors.tokenHint'))}
          >
            <Input
              id="connector-token"
              type="password"
              className="font-mono text-[13px]"
              placeholder={t('project.connectors.tokenPlaceholder')}
              autoComplete="off"
              spellCheck={false}
              value={token}
              onChange={(event) => setToken(event.target.value)}
            />
          </Field>
          <Field label={t('project.connectors.secretLabel')} htmlFor="connector-secret" hint={problemHint(problems.secret)}>
            <Input
              id="connector-secret"
              className="font-mono text-[13px]"
              placeholder="ACME_TOKEN"
              autoComplete="off"
              spellCheck={false}
              aria-invalid={isWrong(problems.secret)}
              value={shownSecret}
              onChange={(event) => {
                setSecretTouched(true);
                setSecretName(event.target.value.toUpperCase());
              }}
            />
          </Field>
          <Field label={t('project.connectors.headerLabel')} htmlFor="connector-header" hint={problemHint(problems.header, header.trim().toLowerCase() === 'authorization' ? t('project.connectors.headerHint') : undefined)}>
            <Input
              id="connector-header"
              className="font-mono text-[13px]"
              autoComplete="off"
              spellCheck={false}
              aria-invalid={isWrong(problems.header)}
              value={header}
              onChange={(event) => setHeader(event.target.value)}
            />
          </Field>
        </div>
      )}

      {save.error && <Notice>{errorMessage(save.error)}</Notice>}
      <div className="flex items-center gap-3">
        {preset?.secret ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => void window.agentbox.openExternal(preset.secret!.tokenUrl)}>
            <ExternalLink />
            {t('project.connectors.howToMake')}
          </Button>
        ) : (
          <p className="text-xs leading-relaxed text-subtle">
            {auth === A.ConnectorOAuth ? t('project.connectors.browserOpens') : ''}
          </p>
        )}
        <Button type="submit" variant="primary" className="ml-auto" disabled={!ready || save.isPending}>
          {save.isPending ? <LoaderCircle className="animate-spin" /> : <Plug />}
          {auth === A.ConnectorOAuth ? t('project.connectors.addAndConnect') : t('common.add')}
        </Button>
      </div>
    </form>
  );
}

const isWrong = (problem?: FieldProblem) => (problem && !problem.empty ? true : undefined);

// problemHint is what a field says under it: what is wrong with it, in red;
// what it still needs, in the hint's grey; or its usual hint.
function problemHint(problem?: FieldProblem, hint?: string): ReactNode {
  if (!problem) return hint;
  return (
    <span data-connector-problem={problem.empty ? 'empty' : 'wrong'} className={cn(!problem.empty && 'text-rose-300')}>
      {problem.message}
    </span>
  );
}

// ConnectorRow is one connector: its name and server, where it stands, how
// long its sign-in holds, and — when it is this target's own — what can be
// done about it. A project connector on an agent's tab shows only; an
// AgentBox-wide one on a project's has control, its override.
function ConnectorRow({
  connector: c,
  target,
  control,
  connecting,
  onConnect,
  onReopen,
  onRemove,
}: {
  connector: T.Connector;
  target?: string;
  control?: ReactNode;
  connecting?: boolean;
  onConnect?: () => void;
  onReopen?: () => void;
  onRemove?: () => void;
}) {
  const t = useT();
  const queryClient = useQueryClient();
  const now = useNow(30_000);
  const token = tokenLine(c, now);
  const change = useMutation({
    mutationFn: (fn: () => Promise<T.Connector>) => fn(),
    onSuccess: (updated) => {
      queryClient.setQueryData<T.Connector[]>(['connectors', target], (list) => list?.map((x) => (x.name === updated.name && x.scope === updated.scope ? updated : x)));
    },
  });
  const oauth = c.auth === A.ConnectorOAuth;
  const waiting = c.status === A.ConnectorConnecting;

  const meta = [
    token && <span key="token" data-connector-token>{token}</span>,
    c.issuer && <span key="issuer" className="min-w-0 truncate">{t('project.connectors.signedInWith', { host: hostOf(c.issuer) })}</span>,
    c.connectedAt && c.status === A.ConnectorConnected && <span key="since" title={formatDateTime(c.connectedAt)}>{t('project.connectors.since', { when: timeAgo(c.connectedAt, now) })}</span>,
    c.auth === A.ConnectorNone && <span key="public">{t('project.connectors.publicServer')}</span>,
    <span key="where">{whereItIs(c)}</span>,
    c.overrides && Object.keys(c.overrides).length > 0 && (
      <Tip key="overrides" label={Object.entries(c.overrides).map(([p, on]) => `${p}: ${on ? t('skills.on') : t('skills.off')}`).join(' · ')}>
        <span>{t('project.connectors.overridden', { count: Object.keys(c.overrides).length })}</span>
      </Tip>
    ),
  ].filter(Boolean);

  // On a wide list, a row of ConnectorList's columns: the mark, the name and
  // host, the state, what can be done. On a narrow one, the state and the
  // actions go under the name.
  return (
    <li
      data-connector={c.name}
      data-connector-status={c.status}
      className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2 rounded-xl border border-line-faint bg-surface-faint p-3 transition hover:border-line-strong @xl:col-span-full @xl:grid-cols-subgrid"
    >
      <ConnectorMark url={c.url} className="row-span-2 self-start @xl:row-span-1 @xl:self-center" />
      <div className="grid min-w-0 gap-0.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate font-mono text-[13px] font-medium text-primary" title={c.name}>{c.name}</span>
          <ScopeBadge connector={c} />
        </div>
        <span className="truncate font-mono text-[11.5px] text-subtle" title={c.url} data-connector-host>
          {hostOf(c.url)}
        </span>
      </div>
      <div className="col-start-2 flex min-w-0 flex-wrap items-center justify-between gap-2 @xl:contents">
        <div className="flex min-w-0 flex-wrap items-center gap-2 @xl:col-start-3">
          <StatusDot connector={c} />
          {!c.enabled && <Badge>{t('project.connectors.off')}</Badge>}
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-1 @xl:col-start-4 @xl:justify-end">
          {control}
          {target !== undefined && (
            <>
              <Tip label={c.enabled ? t('project.connectors.given') : t('project.connectors.leftOut')}>
                <span className="mr-1 flex items-center">
                  <Switch
                    aria-label={t('project.connectors.giveSwitch', { name: c.name })}
                    checked={c.enabled}
                    disabled={change.isPending}
                    onCheckedChange={(enabled) => change.mutate(() => api.setConnector(target, c.name, sameConnector(c, enabled)))}
                  />
                </span>
              </Tip>
              {oauth && waiting && onReopen && (
                <Button size="sm" variant="ghost" onClick={onReopen}>
                  <ExternalLink />
                  {t('project.connectors.reopen')}
                </Button>
              )}
              {oauth && !waiting && c.status !== A.ConnectorConnected && (
                <Button size="sm" variant="primary" disabled={connecting} onClick={onConnect}>
                  {connecting ? <LoaderCircle className="animate-spin" /> : c.status === A.ConnectorError ? <RotateCw /> : <Plug />}
                  {c.status === A.ConnectorError ? t('project.connectors.connectAgain') : t('project.connectors.connect')}
                </Button>
              )}
              {oauth && (c.status === A.ConnectorConnected || waiting) && (
                <Button size="sm" variant="ghost" disabled={change.isPending} onClick={() => change.mutate(() => api.disconnectConnector(target, c.name))}>
                  <Unplug />
                  {waiting ? t('common.cancel') : t('project.connectors.disconnect')}
                </Button>
              )}
              {onRemove && (
                <Tip label={t('common.remove')}>
                  <Button variant="ghost" size="icon-sm" className="text-subtle hover:text-rose-300 [&_svg]:size-4" aria-label={t('project.connectors.removeAria', { name: c.name })} onClick={onRemove}>
                    <Trash2 />
                  </Button>
                </Tip>
              )}
            </>
          )}
        </div>
      </div>
      {meta.length > 0 && (
        <div className="col-start-2 col-end-[-1] flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11.5px] text-subtle">
          {meta.map((m, i) => (
            <Fragment key={(m as ReactElement).key}>
              {i > 0 && <span className="text-faint" aria-hidden="true">·</span>}
              {m}
            </Fragment>
          ))}
        </div>
      )}
      {c.status === A.ConnectorError && c.error && <RowError>{c.error}</RowError>}
      {change.error && <RowError>{errorMessage(change.error)}</RowError>}
    </li>
  );
}

function RowError({ children }: { children: ReactNode }) {
  return (
    <p className="col-start-2 col-end-[-1] flex min-w-0 items-start gap-1.5 rounded-lg border border-rose-500/20 bg-rose-500/[0.06] px-2.5 py-1.5 text-[11.5px] leading-relaxed text-rose-300">
      <CircleAlert className="mt-px size-3.5 shrink-0" />
      <span className="min-w-0 break-words">{children}</span>
    </p>
  );
}

// ConnectorList is a card's connectors, whose rows share their columns when
// there is room for them.
function ConnectorList({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="@container">
      <ul className="grid gap-2 @xl:grid-cols-[auto_minmax(0,1fr)_auto_auto] @xl:gap-x-4" aria-label={label}>
        {children}
      </ul>
    </div>
  );
}

const statusDots: Record<StatusTone, string> = {
  success: 'bg-emerald-400 text-emerald-300',
  warning: 'bg-amber-400 text-amber-300',
  danger: 'bg-rose-400 text-rose-300',
  default: 'bg-faint text-subtle',
};

// StatusDot is where a connector stands, as a dot and a word: green when the
// agents can use it, amber while the browser sign-in is open, red when it
// needs signing in again.
function StatusDot({ connector: c }: { connector: T.Connector }) {
  const status = connectorStatus(c);
  const [dot, text] = statusDots[status.tone].split(' ');
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap text-[12px] font-medium', text)} data-connector-state={status.tone}>
      <span className="relative flex size-2 shrink-0">
        {c.status === A.ConnectorConnecting && <span className={cn('absolute inset-0 animate-ping rounded-full opacity-60', dot)} />}
        <span className={cn('relative size-2 rounded-full', dot)} />
      </span>
      {status.label}
    </span>
  );
}

// ScopeBadge says whose the connector is: AgentBox's, for every project; a
// project's, for its agents; or one agent's own.
function ScopeBadge({ connector: c }: { connector: T.Connector }) {
  const t = useT();
  if (isWide(c)) {
    return (
      <Badge variant="brand" className="shrink-0">
        <Globe />
        {t('project.connectors.wideBadge')}
      </Badge>
    );
  }
  return (
    <Badge className="shrink-0">
      {c.scope === 'agent' ? <Bot /> : <FolderGit2 />}
      {c.scope === 'agent' ? t('project.connectors.scope.agent') : t('project.connectors.scope.project')}
    </Badge>
  );
}

// OverrideControl is a project's say on an AgentBox-wide connector: off, on,
// or inherit, which follows the switch in AgentBox's Settings.
function OverrideControl({ project, connector: c }: { project: string; connector: T.Connector }) {
  const t = useT();
  const queryClient = useQueryClient();
  const set = useMutation({
    mutationFn: (o: ConnectorOverride) => api.setConnectorOverride(project, c.name, overrideRequest(o)),
    onSuccess: (updated) => {
      queryClient.setQueryData<T.Connector[]>(['connectors', project], (list) => list?.map((x) => (x.name === updated.name && x.scope === updated.scope ? updated : x)));
      void queryClient.invalidateQueries({ queryKey: ['connectors'] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const current = set.isPending && set.variables ? set.variables : overrideOf(c);
  const options: [ConnectorOverride, string][] = [
    ['off', t('project.connectors.overrideOff')],
    ['inherit', t('project.connectors.overrideInherit')],
    ['on', t('project.connectors.overrideOn')],
  ];
  return (
    <div
      className="flex items-center rounded-lg border border-line-faint bg-surface p-0.5"
      role="radiogroup"
      aria-label={t('project.connectors.overrideAria', { name: c.name })}
      data-connector-override={current}
    >
      {options.map(([value, label]) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={current === value}
          disabled={set.isPending}
          onClick={() => current !== value && set.mutate(value)}
          className={cn(
            'rounded-md px-2.5 py-1 text-[11.5px] font-medium transition',
            current === value ? 'bg-brand-500/15 text-primary ring-1 ring-inset ring-brand-400/50' : 'text-subtle hover:text-primary',
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// sameConnector is the request that changes only whether it is given to
// agents: a PUT that left out how it signs in would default to OAuth, and
// changing that forgets the sign-in.
function sameConnector(c: T.Connector, enabled: boolean): T.SetConnectorRequest {
  return { url: c.url, auth: c.auth, secret: c.secret, header: c.header, scheme: c.scheme, enabled };
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

// whereItIs says which agents get the connector, the way Secrets says
// which hold a secret.
function whereItIs(c: T.Connector): string {
  const agents = c.agents ?? [];
  if (agents.length === 0) return translate('project.connectors.inNone');
  if (isWide(c) && c.project === '' && agents.length > 1) {
    const projects = new Set(agents.map((ref) => ref.split('/')[0])).size;
    if (projects > 1) return translate('project.connectors.inManyProjects', { count: agents.length, projects });
  }
  if (c.scope === 'agent') return translate('project.connectors.inThisAgent');
  if (agents.length === 1) return translate('project.connectors.inOne', { agent: agents[0].split('/')[1] });
  return translate('project.connectors.inMany', { count: agents.length });
}
