import { AlertCircle, CheckCircle2, Database, ListChecks, RefreshCw } from 'lucide-react';
import { createPortal } from 'react-dom';

import { useI18n } from '../lib/i18n';
import type { AllowlistSyncProgress, InstanceSyncStatus, SyncStatus } from '../types';
import { InstanceIcon } from './InstanceIcon';

interface SyncOverlayProps {
  syncStatus: SyncStatus | null;
}

function translateSyncMessage(
  message: string | undefined,
  t: (key: string, values?: Record<string, string | number>) => string,
) {
  if (!message) {
    return t('components.syncOverlay.synchronizing');
  }

  if (message === 'Starting historical data sync...') {
    return t('components.syncOverlay.statusStarting');
  }

  const fixedMessages: Record<string, string> = {
    'Finalizing decision data...': 'components.syncOverlay.statusFinalizingDecisions',
    'Building search indexes...': 'components.syncOverlay.statusBuildingIndexes',
    'Preparing dashboard data for faster loading...':
      'components.syncOverlay.statusPreparingDashboard',
  };
  if (fixedMessages[message]) {
    return t(fixedMessages[message]);
  }

  const removedMatch = message.match(
    /^Removed (\d+) stale cached alerts and (\d+) stale cached decisions before sync\.$/,
  );
  if (removedMatch) {
    return t('components.syncOverlay.statusRemovedStale', {
      alerts: Number(removedMatch[1]),
      decisions: Number(removedMatch[2]),
    });
  }

  const syncingMatch = message.match(/^Syncing: (.+) \((\d+) alerts, (\d+) decisions\)$/);
  if (syncingMatch) {
    return t('components.syncOverlay.statusSyncingWindow', {
      window: syncingMatch[1],
      alerts: Number(syncingMatch[2]),
      decisions: Number(syncingMatch[3]),
    });
  }

  const fetchingMatch = message.match(
    /^Fetching: (.+) \((\d+) alerts and (\d+) decisions cached so far\)$/,
  );
  if (fetchingMatch) {
    return t('components.syncOverlay.statusFetchingWindow', {
      window: fetchingMatch[1],
      alerts: Number(fetchingMatch[2]),
      decisions: Number(fetchingMatch[3]),
    });
  }

  const processingMatch = message.match(
    /^Processing (\d+) alerts and (\d+) decisions from (.+)\.\.\.$/,
  );
  if (processingMatch) {
    return t('components.syncOverlay.statusProcessingWindow', {
      alerts: Number(processingMatch[1]),
      decisions: Number(processingMatch[2]),
      window: processingMatch[3],
    });
  }

  return message;
}

function instanceStatusMessage(
  instance: InstanceSyncStatus,
  t: (key: string, values?: Record<string, string | number>) => string,
) {
  if (instance.state === 'failed') {
    return instance.errors?.[0] || instance.message;
  }
  if (instance.state === 'complete' && instance.progress === 100) {
    return t('components.syncOverlay.statusComplete');
  }
  if (
    !instance.startedAt &&
    !instance.completedAt &&
    !instance.isSyncing &&
    instance.progress === 0
  ) {
    return t('components.syncOverlay.statusWaiting');
  }
  return translateSyncMessage(instance.message, t);
}

function AllowlistProgress({ progress }: { progress?: AllowlistSyncProgress }) {
  const { t } = useI18n();
  if (!progress) return null;
  const message =
    progress.state === 'complete'
      ? t('components.syncOverlay.allowlistsCached', {
          allowlists: (progress.allowlists ?? 0).toLocaleString(),
          entries: (progress.entries ?? 0).toLocaleString(),
        })
      : progress.state === 'failed'
        ? t('components.syncOverlay.allowlistsFailed', { error: progress.error || '' })
        : t(
            `components.syncOverlay.allowlists${progress.state === 'syncing' ? 'Syncing' : progress.state === 'unsupported' ? 'Unsupported' : 'Waiting'}`,
          );
  const tone =
    progress.state === 'failed'
      ? 'text-amber-700 dark:text-amber-300'
      : 'text-gray-500 dark:text-gray-400';
  return (
    <p className={`mt-1 flex min-w-0 items-center gap-1.5 text-xs ${tone}`} title={message}>
      {progress.state === 'syncing' ? (
        <RefreshCw className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden="true" />
      ) : progress.state === 'complete' ? (
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" aria-hidden="true" />
      ) : (
        <ListChecks className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      )}
      <span className="truncate">{message}</span>
    </p>
  );
}

export function SyncOverlay({ syncStatus }: SyncOverlayProps) {
  const { t } = useI18n();

  if (!syncStatus?.isSyncing) return null;

  const progress = syncStatus.progress || 0;
  const statusMessage = translateSyncMessage(syncStatus.message, t);
  const instances =
    syncStatus.instances?.length && syncStatus.instances.length > 1 ? syncStatus.instances : null;
  const finishedInstances =
    instances?.filter((instance) => Boolean(instance.completedAt)).length || 0;

  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div
        className={`acrylic rounded-2xl border p-8 ${instances ? 'max-w-lg' : 'max-w-md'} mx-4 w-full text-center`}
      >
        {/* Icon with animation */}
        <div className="relative mb-6 inline-flex items-center justify-center">
          <div
            className="absolute inset-0 animate-ping rounded-full bg-blue-500/20"
            style={{ animationDuration: '2s' }}
          ></div>
          <div className="relative rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 p-4">
            <Database className="h-8 w-8 text-white" />
          </div>
        </div>

        {/* Title */}
        <h2 className="mb-2 text-xl font-bold text-gray-900 dark:text-white">
          {t('components.syncOverlay.title')}
        </h2>
        <p className="mb-6 text-sm text-gray-600 dark:text-gray-400">
          {t('components.syncOverlay.description')}
        </p>

        {/* Progress bar */}
        <div className="relative mb-3 h-3 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
          <div
            className="animate-shimmer absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent"
            style={{
              backgroundSize: '200% 100%',
              animation: 'shimmer 1.5s infinite',
            }}
          />
        </div>

        {/* Progress text */}
        <div className="flex items-start justify-between gap-3 text-sm" aria-live="polite">
          <span className="flex min-w-0 flex-1 items-start gap-2 text-left text-gray-500 dark:text-gray-400">
            <RefreshCw className="mt-0.5 h-4 w-4 shrink-0 animate-spin" />
            {statusMessage}
          </span>
          <span className="shrink-0 font-semibold text-blue-600 dark:text-blue-400">
            {progress}%
          </span>
        </div>
        {!instances && <AllowlistProgress progress={syncStatus.allowlists} />}

        {instances && (
          <div className="mt-6 border-t border-gray-200 pt-4 text-left dark:border-gray-700">
            <p className="mb-3 text-xs font-medium tracking-wide text-gray-500 uppercase dark:text-gray-400">
              {t('components.syncOverlay.instancesProgress', {
                completed: finishedInstances,
                total: instances.length,
              })}
            </p>
            <div className="max-h-64 space-y-3 overflow-y-auto pr-1">
              {instances.map((instance, index) => {
                const failed = instance.state === 'failed';
                const complete = instance.state === 'complete' && instance.progress === 100;
                return (
                  <div
                    key={instance.instance_id}
                    className="rounded-lg bg-gray-50 p-3 dark:bg-gray-900/50"
                  >
                    <div className="flex items-center gap-2 text-sm">
                      <InstanceIcon icon={instance.icon} colorIndex={index} />
                      <span className="min-w-0 flex-1 truncate font-medium text-gray-800 dark:text-gray-100">
                        {instance.instance_name}
                      </span>
                      {failed ? (
                        <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
                      ) : complete ? (
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                      ) : instance.isSyncing ? (
                        <RefreshCw className="h-4 w-4 shrink-0 animate-spin text-blue-500" />
                      ) : null}
                      <span className="w-10 shrink-0 text-right text-xs font-semibold text-gray-600 dark:text-gray-300">
                        {instance.progress}%
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${failed ? 'bg-red-500' : complete ? 'bg-emerald-500' : 'bg-blue-500'}`}
                        style={{ width: `${instance.progress}%` }}
                      />
                    </div>
                    <p
                      className={`mt-1.5 truncate text-xs ${failed ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'}`}
                    >
                      {instanceStatusMessage(instance, t)}
                    </p>
                    <AllowlistProgress progress={instance.allowlists} />
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <style>{`
                @keyframes shimmer {
                    0% { transform: translateX(-100%); }
                    100% { transform: translateX(100%); }
                }
            `}</style>
    </div>,
    document.body,
  );
}
