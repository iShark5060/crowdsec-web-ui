import {
  Trash2,
  Gavel,
  X,
  ExternalLink,
  Shield,
  ShieldBan,
  AlertCircle,
  Columns3,
  Loader2,
} from 'lucide-react';
import { useEffect, useLayoutEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useSearchParams, Link } from 'react-router-dom';

import { TABLE_COLUMN_DEFINITIONS, formatAlertMessage } from '../../../shared/contracts';
import {
  compileDecisionSearch,
  getSearchDateRange,
  getSearchHelpDefinition,
  replaceSearchDateRange,
  replaceSearchFacetSelection,
  serializeSearchNode,
  type SearchFacetSelection,
  type SearchDateRange,
  type SearchParseError,
} from '../../../shared/search';
import { AddDecisionModal } from '../components/AddDecisionModal';
import { CollapsibleSearchControls } from '../components/CollapsibleSearchControls';
import { CountryFlag } from '../components/CountryFlag';
import { HighlightedSearchInput } from '../components/HighlightedSearchInput';
import {
  QuickFilterDisabledNotice,
  QuickFilters,
  type QuickFilterDefinition,
  type QuickFilterSectionId,
} from '../components/QuickFilters';
import { SavedFiltersMenu } from '../components/SavedFiltersMenu';
import { ScenarioName } from '../components/ScenarioName';
import { SearchSyntaxModal } from '../components/SearchSyntaxModal';
import { TableColumnsModal } from '../components/TableColumnsModal';
import { TargetDisplay } from '../components/TargetDisplay';
import { TimeDisplay } from '../components/TimeDisplay';
import { Badge } from '../components/ui/Badge';
import { HorizontalScrollArea } from '../components/ui/HorizontalScrollArea';
import { Modal } from '../components/ui/Modal';
import { ResizableColumnHeader, TableColumnGroup } from '../components/ui/ResizableColumnHeader';
import { useRefresh } from '../contexts/useRefresh';
import {
  deleteDecision,
  bulkDeleteDecisions,
  cleanupByIp,
  fetchConfig,
  fetchDecisionsPaginated,
} from '../lib/api';
import { getBrowserTimeZone, useDateTime } from '../lib/dateTime';
import { getDecisionExpirationState } from '../lib/decisionExpiration';
import { useI18n, type I18nContextValue } from '../lib/i18n';
import { getQuickFilterCompatibility } from '../lib/quickFilterCompatibility';
import {
  DECISION_QUICK_FILTER_FIELDS,
  emptyStoredQuickFilters,
  getQuickFilterSimulation,
  getStoredQuickFilterSelection,
  loadStoredQuickFilters,
  mergeStoredQuickFiltersIntoQuery,
  quickFilterSimulationSelection,
  saveStoredQuickFilters,
  setStoredQuickFilterSelection,
  storedQuickFiltersEqual,
  syncStoredQuickFiltersFromSearch,
  type QuickFilterSimulationValue,
  type StoredQuickFilters,
} from '../lib/quickFilters';
import { useRecentFilter } from '../lib/savedFilters';
import { isSimulatedDecision, parseSimulationFilter } from '../lib/simulation';
import {
  loadStoredTableColumnOrders,
  loadStoredTableColumnPreferences,
  saveStoredTableColumnPreferences,
  STICKY_ACTIONS_CELL_CLASS_NAME,
  STICKY_ACTIONS_EXPIRED_CELL_CLASS_NAME,
  STICKY_ACTIONS_HEADER_CLASS_NAME,
} from '../lib/tableColumns';
import { useTableColumnWidths, type TableLayoutColumn } from '../lib/useTableColumnWidths';
import { getCountryCodesMatchingName, getCountryName } from '../lib/utils';
import type {
  ApiPermissionError,
  BulkDeleteResult,
  DecisionListItem,
  FacetField,
  InstanceEntityRef,
  InstanceOperationResult,
  InstanceSummary,
  TableColumnId,
  TableColumnPreferences,
} from '../types';

type DecisionDeleteAction =
  | { kind: 'single'; ref: InstanceEntityRef }
  | { kind: 'selected'; refs: InstanceEntityRef[] }
  | { kind: 'ip'; ip: string };

function decisionKey(decision: Pick<DecisionListItem, 'id' | 'instance_id'>): string {
  return `${decision.instance_id || 'default'}\u0000${String(decision.id)}`;
}

function decisionRef(decision: Pick<DecisionListItem, 'id' | 'instance_id'>): InstanceEntityRef {
  return { instance_id: decision.instance_id || 'default', id: String(decision.id) };
}

interface ErrorInfo {
  message: string;
  helpLink?: string;
  helpText?: string;
}

function ErrorBanner({ errorInfo, onDismiss }: { errorInfo: ErrorInfo; onDismiss?: () => void }) {
  const { t } = useI18n();

  return (
    <div
      role="alert"
      className="flex items-center justify-between rounded-md border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20"
    >
      <div className="flex items-center gap-2 text-red-700 dark:text-red-300">
        <AlertCircle size={16} className="flex-shrink-0" />
        <span className="text-sm">
          {errorInfo.message}
          {errorInfo.helpLink && (
            <>
              {' '}
              {t('common.seeReadme')}{' '}
              <a
                href={errorInfo.helpLink}
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-red-900 dark:hover:text-red-100"
              >
                {errorInfo.helpText || t('common.learnMore')}
              </a>
            </>
          )}
        </span>
      </div>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-200"
          aria-label={t('common.dismissError')}
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
}

function TableLoadingRow({ colSpan, label }: { colSpan: number; label: string }) {
  return (
    <tr>
      <td
        colSpan={colSpan}
        className="bg-primary-50/60 dark:bg-primary-900/10 px-6 py-4 text-center"
      >
        <span
          className="text-primary-700 dark:text-primary-300 inline-flex items-center justify-center gap-2 text-sm font-medium"
          aria-live="polite"
        >
          <Loader2 size={16} className="animate-spin" aria-hidden="true" />
          {label}
        </span>
      </td>
    </tr>
  );
}

function toErrorInfo(error: unknown, fallbackMessage: string): ErrorInfo {
  const apiError = error as Partial<ApiPermissionError> | undefined;

  return {
    message: typeof apiError?.message === 'string' ? apiError.message : fallbackMessage,
    helpLink: typeof apiError?.helpLink === 'string' ? apiError.helpLink : undefined,
    helpText: typeof apiError?.helpText === 'string' ? apiError.helpText : undefined,
  };
}

function isDecisionExpired(decision: DecisionListItem, nowMs: number): boolean {
  return getDecisionExpirationState(decision, nowMs).isExpired;
}

function summarizeDeleteResult(result: BulkDeleteResult, t: I18nContextValue['t']): string | null {
  if (result.failed.length === 0) {
    return null;
  }

  const deletedParts: string[] = [];
  if (result.deleted_alerts > 0) {
    deletedParts.push(t('pages.alerts.deletedAlerts', { count: result.deleted_alerts }));
  }
  if (result.deleted_decisions > 0) {
    deletedParts.push(t('pages.alerts.deletedDecisions', { count: result.deleted_decisions }));
  }

  const deletedText =
    deletedParts.length > 0
      ? t('pages.alerts.deletedSummaryPrefix', { items: deletedParts.join(` ${t('common.and')} `) })
      : '';
  return `${deletedText}${t('pages.alerts.itemsFailedToDelete', { count: result.failed.length })}`;
}

function combineDeleteResults(results: BulkDeleteResult[]): BulkDeleteResult {
  return results.reduce<BulkDeleteResult>(
    (combined, result) => ({
      requested_alerts: combined.requested_alerts + result.requested_alerts,
      requested_decisions: combined.requested_decisions + result.requested_decisions,
      deleted_alerts: combined.deleted_alerts + result.deleted_alerts,
      deleted_decisions: combined.deleted_decisions + result.deleted_decisions,
      failed: [...combined.failed, ...result.failed],
      instance_results: [...(combined.instance_results || []), ...(result.instance_results || [])],
      ip: combined.ip || result.ip,
    }),
    {
      requested_alerts: 0,
      requested_decisions: 0,
      deleted_alerts: 0,
      deleted_decisions: 0,
      failed: [],
    },
  );
}

export function Decisions() {
  const { language, t } = useI18n();
  const { timeZone } = useDateTime();
  const { refreshSignal } = useRefresh();
  const [facetRefreshKey, setFacetRefreshKey] = useState(refreshSignal);
  const [searchParams, setSearchParams] = useSearchParams();
  const [quickFiltersOpen, setQuickFiltersOpen] = useState(false);
  const [persistedQuickFilters, setPersistedQuickFilters] = useState<StoredQuickFilters>(() =>
    loadStoredQuickFilters(),
  );
  const persistedQuickFiltersRef = useRef(persistedQuickFilters);
  const [initialQueryParam] = useState(() =>
    mergeStoredQuickFiltersIntoQuery(
      'decisions',
      searchParams.get('q') ?? '',
      persistedQuickFilters,
    ),
  );
  const [decisions, setDecisions] = useState<DecisionListItem[]>([]);
  const [lookbackHours, setLookbackHours] = useState(168);
  const [simulationsEnabled, setSimulationsEnabled] = useState(false);
  const [canManageEnforcement, setCanManageEnforcement] = useState(false);
  const [multipleInstances, setMultipleInstances] = useState(false);
  const [instanceNames, setInstanceNames] = useState<Record<string, string>>({});
  const [instances, setInstances] = useState<InstanceSummary[]>([]);
  const [tableColumnPreferences, setTableColumnPreferences] = useState<TableColumnPreferences>(() =>
    loadStoredTableColumnPreferences(),
  );
  const [showColumnsModal, setShowColumnsModal] = useState(false);
  const [searchDraft, setSearchDraft] = useState(initialQueryParam);
  const [debouncedSearchDraft, setDebouncedSearchDraft] = useState(initialQueryParam);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [showSearchSyntaxModal, setShowSearchSyntaxModal] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [hasLoadedDecisions, setHasLoadedDecisions] = useState(false);
  const [backgroundLoading, setBackgroundLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalDecisions, setTotalDecisions] = useState(0);
  const [totalUnfilteredDecisions, setTotalUnfilteredDecisions] = useState(0);
  const [selectableDecisionIds, setSelectableDecisionIds] = useState<string[]>([]);
  const [pendingDeleteAction, setPendingDeleteAction] = useState<DecisionDeleteAction | null>(null);
  const [selectedDecisionIds, setSelectedDecisionIds] = useState<string[]>([]);
  const [deleteInProgress, setDeleteInProgress] = useState(false);
  const [errorInfo, setErrorInfo] = useState<ErrorInfo | null>(null);
  const [pendingDeleteErrorInfo, setPendingDeleteErrorInfo] = useState<ErrorInfo | null>(null);
  const [retryCleanupInstances, setRetryCleanupInstances] = useState<InstanceOperationResult[]>([]);
  const alertIdFilter = searchParams.get('alert_id');
  const queryParam = searchParams.get('q');
  useRecentFilter(queryParam ?? '', 'decisions', quickFiltersOpen);
  const dateStartParam = searchParams.get('dateStart') ?? '';
  const dateEndParam = searchParams.get('dateEnd') ?? '';
  const includeExpiredParam = searchParams.get('include_expired') === 'true';
  const simulationFilter = simulationsEnabled
    ? parseSimulationFilter(searchParams.get('simulation'))
    : 'all';
  // Default: hide duplicates unless explicitly set to false OR viewing a specific alert's decisions
  const showDuplicates = searchParams.get('hide_duplicates') === 'false' || !!alertIdFilter;

  const PAGE_SIZE = 50;
  const hasMoreDecisions = currentPage < totalPages;
  // Intersection Observer for infinite scroll
  const observer = useRef<IntersectionObserver | null>(null);
  const selectAllDecisionsRef = useRef<HTMLInputElement | null>(null);
  const currentPageRef = useRef(1);
  const inFlightLoadKeysRef = useRef(new Map<string, number>());
  const loadRequestSequenceRef = useRef(0);
  const lastCompletedLoadRef = useRef<{ key: string; completedAt: number } | null>(null);
  const loadDecisionsRef = useRef<
    (options?: {
      isBackground?: boolean;
      page?: number;
      append?: boolean;
      preserveLoadedPages?: boolean;
      refreshConfig?: boolean;
      forceRefresh?: boolean;
    }) => Promise<void>
  >(async () => {});
  const lastRefreshSignalRef = useRef(refreshSignal);
  const configRef = useRef<{
    lookbackHours: number;
    simulationsEnabled: boolean;
    canManageEnforcement: boolean;
    multipleInstances: boolean;
    instanceNames: Record<string, string>;
    instances: InstanceSummary[];
  } | null>(null);
  const hasLoadedDecisionsRef = useRef(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const searchDraftRef = useRef(searchDraft);
  const searchSelectionRef = useRef({ start: 0, end: 0 });
  const pendingSearchFocusRef = useRef<number | null>(null);
  const skipSearchParamSyncRef = useRef<string | null>(null);
  const searchDebounceTimeoutRef = useRef<number | null>(null);
  const initialQueryHydratedRef = useRef(false);
  const searchValidationFeatures = useMemo(
    () => ({ machineEnabled: true, originEnabled: true }),
    [],
  );
  const searchDateOptions = useMemo(
    () => ({
      timezoneOffsetMinutes: new Date().getTimezoneOffset(),
      timeZone: timeZone || getBrowserTimeZone(),
    }),
    [timeZone],
  );
  const compiledSearch = useMemo(
    () => compileDecisionSearch(debouncedSearchDraft, searchValidationFeatures, searchDateOptions),
    [debouncedSearchDraft, searchDateOptions, searchValidationFeatures],
  );
  const appliedQuery = compiledSearch.ok ? debouncedSearchDraft.trim() : (queryParam?.trim() ?? '');
  const queryError: SearchParseError | null = compiledSearch.ok ? null : compiledSearch.error;
  const quickFilterCompatibility = compiledSearch.ok
    ? getQuickFilterCompatibility(compiledSearch.ast, DECISION_QUICK_FILTER_FIELDS)
    : { compatible: false as const, reason: 'syntax-error' as const };
  const quickFilterDisabledReason = quickFilterCompatibility.compatible
    ? undefined
    : t(`components.quickFilters.disabled.${quickFilterCompatibility.reason}`);
  const updatePersistedQuickFilters = useCallback(
    (update: (current: StoredQuickFilters) => StoredQuickFilters) => {
      const current = persistedQuickFiltersRef.current;
      const next = update(current);
      if (storedQuickFiltersEqual(current, next)) return;
      persistedQuickFiltersRef.current = next;
      saveStoredQuickFilters(next);
      setPersistedQuickFilters(next);
    },
    [],
  );

  useLayoutEffect(() => {
    if (initialQueryHydratedRef.current) return;
    initialQueryHydratedRef.current = true;
    const currentQuery = searchParams.get('q') ?? '';
    if (currentQuery === initialQueryParam) return;

    const nextParams = new URLSearchParams(searchParams);
    if (initialQueryParam) nextParams.set('q', initialQueryParam);
    else nextParams.delete('q');
    skipSearchParamSyncRef.current = initialQueryParam;
    setSearchParams(nextParams);
  }, [initialQueryParam, searchParams, setSearchParams]);
  const searchHelp = useMemo(
    () => getSearchHelpDefinition('decisions', searchValidationFeatures, { decisions }),
    [decisions, searchValidationFeatures],
  );
  const combinedScope = (searchParams.get('instance') || 'all') === 'all' && multipleInstances;
  const visibleDecisionColumns = useMemo(() => {
    const configured = tableColumnPreferences.decisions;
    return combinedScope && !configured.includes('instance')
      ? ['instance' as TableColumnId, ...configured]
      : configured;
  }, [combinedScope, tableColumnPreferences.decisions]);
  const decisionColumnDefinitionById = useMemo(
    () =>
      new Map<TableColumnId, (typeof TABLE_COLUMN_DEFINITIONS.decisions)[number]>(
        TABLE_COLUMN_DEFINITIONS.decisions.map((column) => [column.id, column]),
      ),
    [],
  );
  const visibleDecisionColumnCount = visibleDecisionColumns.length;
  const decisionTableColSpan = visibleDecisionColumnCount + (canManageEnforcement ? 2 : 0);
  const decisionTableRef = useRef<HTMLTableElement>(null);
  const decisionColumnWidths = useTableColumnWidths('decisions', decisionTableRef, [
    ...(canManageEnforcement ? [{ id: 'select', fixedWidth: 64 }] : []),
    ...visibleDecisionColumns.map((id): TableLayoutColumn => ({ id })),
    ...(canManageEnforcement ? [{ id: 'actions', fixedWidth: 128 }] : []),
  ]);
  const cancelSearchDebounce = useCallback(() => {
    if (searchDebounceTimeoutRef.current !== null) {
      window.clearTimeout(searchDebounceTimeoutRef.current);
      searchDebounceTimeoutRef.current = null;
    }
  }, []);

  const buildServerFilters = useCallback(
    (requestedSimulationFilter = simulationFilter): Record<string, string> => {
      const filters: Record<string, string> = {
        tz_offset: String(new Date().getTimezoneOffset()),
      };
      const browserTimeZone = getBrowserTimeZone();
      if (browserTimeZone) filters.browser_tz = browserTimeZone;
      filters.instance = searchParams.get('instance') || 'all';
      if (appliedQuery) filters.q = appliedQuery;
      if (dateStartParam) filters.dateStart = dateStartParam;
      if (dateEndParam) filters.dateEnd = dateEndParam;
      if (alertIdFilter) filters.alert_id = alertIdFilter;
      if (includeExpiredParam) filters.include_expired = 'true';
      if (requestedSimulationFilter !== 'all') filters.simulation = requestedSimulationFilter;
      if (showDuplicates) filters.hide_duplicates = 'false';
      return filters;
    },
    [
      alertIdFilter,
      appliedQuery,
      dateEndParam,
      dateStartParam,
      includeExpiredParam,
      searchParams,
      showDuplicates,
      simulationFilter,
    ],
  );
  const facetFilters = useMemo(
    () => buildServerFilters(simulationFilter),
    [buildServerFilters, simulationFilter],
  );
  const quickFilterConfig = useMemo<{
    fields: QuickFilterDefinition[];
    sectionOrder: QuickFilterSectionId[];
    hiddenSectionOrder: QuickFilterSectionId[];
    unavailableSectionOrder: QuickFilterSectionId[];
  }>(() => {
    const fieldByColumn: Partial<Record<TableColumnId, FacetField>> = {
      id: 'id',
      instance: 'instance',
      scenario: 'scenario',
      kind: 'kind',
      country: 'country',
      region: 'region',
      city: 'city',
      as: 'as',
      source: 'ip',
      action: 'action',
      expiration: 'status',
      target: 'target',
      machine: 'machine',
      origin: 'origin',
      alert: 'alert',
    };
    const fields: QuickFilterDefinition[] = [];
    const sectionOrder: QuickFilterSectionId[] = [];
    const hiddenSectionOrder: QuickFilterSectionId[] = [];
    const unavailableSectionOrder: QuickFilterSectionId[] = [];
    const visibleColumnIds = new Set(visibleDecisionColumns);
    const addColumn = (column: TableColumnId, order: QuickFilterSectionId[]) => {
      if (column === 'time') {
        order.push('date');
        return;
      }
      const field = fieldByColumn[column];
      if (!field) return;
      fields.push({
        field,
        label: t(`tableColumns.${column}`),
        ...(field === 'status' ? { defaultSelection: { included: ['active'], excluded: [] } } : {}),
      });
      order.push(field);
    };
    for (const column of visibleDecisionColumns) {
      addColumn(column, sectionOrder);
    }
    for (const column of loadStoredTableColumnOrders(
      'decisions',
      tableColumnPreferences.decisions,
    )) {
      if (!visibleColumnIds.has(column)) addColumn(column, hiddenSectionOrder);
    }
    const decisionFields = new Set(fields.map(({ field }) => field));
    const alertFieldByColumn: Partial<Record<TableColumnId, FacetField>> = {
      id: 'id',
      instance: 'instance',
      scenario: 'scenario',
      country: 'country',
      region: 'region',
      city: 'city',
      as: 'as',
      source: 'ip',
      target: 'target',
      machine: 'machine',
      origin: 'origin',
      decisions: 'decision',
    };
    const orderedAlertColumns = loadStoredTableColumnOrders(
      'alerts',
      tableColumnPreferences.alerts,
    );
    for (const column of orderedAlertColumns) {
      const field = alertFieldByColumn[column];
      if (!field || decisionFields.has(field)) continue;
      fields.push({
        field,
        label: t(`tableColumns.${column}`),
        applicable: false,
      });
      unavailableSectionOrder.push(field);
      decisionFields.add(field);
    }
    return { fields, sectionOrder, hiddenSectionOrder, unavailableSectionOrder };
  }, [t, tableColumnPreferences.alerts, tableColumnPreferences.decisions, visibleDecisionColumns]);
  const quickFilterDateRange = useMemo(() => {
    const range = compiledSearch.ok
      ? getSearchDateRange(compiledSearch.ast)
      : { start: '', end: '' };
    return {
      start: range.start || dateStartParam,
      end: range.end || dateEndParam,
    };
  }, [compiledSearch, dateEndParam, dateStartParam]);
  const applicableQuickFilterFields = useMemo(
    () => new Set<FacetField>(DECISION_QUICK_FILTER_FIELDS),
    [],
  );

  useEffect(() => {
    if (!compiledSearch.ok || !quickFilterCompatibility.compatible) return;
    const current = persistedQuickFiltersRef.current;
    const next = syncStoredQuickFiltersFromSearch(
      current,
      'decisions',
      compiledSearch.ast,
      quickFilterDateRange,
    );
    if (storedQuickFiltersEqual(current, next)) return;
    persistedQuickFiltersRef.current = next;
    saveStoredQuickFilters(next);
  }, [compiledSearch, quickFilterCompatibility.compatible, quickFilterDateRange]);

  const getFacetSelection = useCallback(
    (field: FacetField, selection: SearchFacetSelection): SearchFacetSelection => {
      if (!applicableQuickFilterFields.has(field)) {
        return getStoredQuickFilterSelection(persistedQuickFilters, field);
      }
      if (
        field === 'status' &&
        !includeExpiredParam &&
        selection.included.length === 0 &&
        selection.excluded.length === 0
      ) {
        return { included: ['active'], excluded: [] };
      }
      return selection;
    },
    [applicableQuickFilterFields, includeExpiredParam, persistedQuickFilters],
  );
  const quickFilterSimulation = getQuickFilterSimulation(
    compiledSearch.ok ? compiledSearch.ast : null,
    simulationFilter,
  );
  const applyFacetSelection = useCallback(
    (field: FacetField, requestedSelection: SearchFacetSelection) => {
      if (!applicableQuickFilterFields.has(field)) {
        updatePersistedQuickFilters((current) =>
          setStoredQuickFilterSelection(current, field, requestedSelection),
        );
        return;
      }
      const currentQuery = searchParams.get('q') ?? '';
      const currentSearch = compileDecisionSearch(
        currentQuery,
        searchValidationFeatures,
        searchDateOptions,
      );
      if (!currentSearch.ok) return;

      const nextParams = new URLSearchParams(searchParams);
      let selection = requestedSelection;
      if (field === 'status') {
        const includesActive = selection.included.includes('active');
        const includesExpired = selection.included.includes('expired');
        const excludesActive = selection.excluded.includes('active');
        const excludesExpired = selection.excluded.includes('expired');
        if (includesActive && includesExpired) {
          selection = { included: [], excluded: [] };
          nextParams.set('include_expired', 'true');
        } else if (excludesExpired && !excludesActive && selection.included.length === 0) {
          selection = { included: [], excluded: [] };
          nextParams.delete('include_expired');
        } else if (includesExpired || excludesActive) {
          nextParams.set('include_expired', 'true');
        } else {
          nextParams.delete('include_expired');
        }
      }
      updatePersistedQuickFilters((current) =>
        setStoredQuickFilterSelection(current, field, selection),
      );

      const nextQuery = serializeSearchNode(
        replaceSearchFacetSelection(currentSearch.ast, field, selection),
      );
      if (nextQuery) nextParams.set('q', nextQuery);
      else nextParams.delete('q');

      cancelSearchDebounce();
      searchDraftRef.current = nextQuery;
      searchSelectionRef.current = { start: nextQuery.length, end: nextQuery.length };
      skipSearchParamSyncRef.current = nextQuery;
      setSearchDraft(nextQuery);
      setDebouncedSearchDraft(nextQuery);
      setSearchParams(nextParams);
    },
    [
      cancelSearchDebounce,
      applicableQuickFilterFields,
      searchDateOptions,
      searchParams,
      searchValidationFeatures,
      setSearchParams,
      updatePersistedQuickFilters,
    ],
  );
  const applySimulationSelection = useCallback(
    (simulation: QuickFilterSimulationValue) => {
      const currentQuery = searchParams.get('q') ?? '';
      const currentSearch = compileDecisionSearch(
        currentQuery,
        searchValidationFeatures,
        searchDateOptions,
      );
      if (!currentSearch.ok) return;

      const nextQuery = serializeSearchNode(
        replaceSearchFacetSelection(
          currentSearch.ast,
          'sim',
          quickFilterSimulationSelection(simulation),
        ),
      );
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete('simulation');
      if (nextQuery) nextParams.set('q', nextQuery);
      else nextParams.delete('q');

      cancelSearchDebounce();
      searchDraftRef.current = nextQuery;
      searchSelectionRef.current = { start: nextQuery.length, end: nextQuery.length };
      skipSearchParamSyncRef.current = nextQuery;
      setSearchDraft(nextQuery);
      setDebouncedSearchDraft(nextQuery);
      setSearchParams(nextParams);
      updatePersistedQuickFilters((current) => ({ ...current, simulation }));
    },
    [
      cancelSearchDebounce,
      searchDateOptions,
      searchParams,
      searchValidationFeatures,
      setSearchParams,
      updatePersistedQuickFilters,
    ],
  );
  const applyDateRange = useCallback(
    (range: SearchDateRange) => {
      updatePersistedQuickFilters((current) => ({ ...current, dateRange: range }));
      const currentQuery = searchParams.get('q') ?? '';
      const currentSearch = compileDecisionSearch(
        currentQuery,
        searchValidationFeatures,
        searchDateOptions,
      );
      if (!currentSearch.ok) return;

      const nextQuery = serializeSearchNode(replaceSearchDateRange(currentSearch.ast, range));
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete('dateStart');
      nextParams.delete('dateEnd');
      if (nextQuery) nextParams.set('q', nextQuery);
      else nextParams.delete('q');

      cancelSearchDebounce();
      searchDraftRef.current = nextQuery;
      searchSelectionRef.current = { start: nextQuery.length, end: nextQuery.length };
      skipSearchParamSyncRef.current = nextQuery;
      setSearchDraft(nextQuery);
      setDebouncedSearchDraft(nextQuery);
      setSearchParams(nextParams);
    },
    [
      cancelSearchDebounce,
      searchDateOptions,
      searchParams,
      searchValidationFeatures,
      setSearchParams,
      updatePersistedQuickFilters,
    ],
  );
  const clearQuickFilters = useCallback(() => {
    const currentQuery = searchParams.get('q') ?? '';
    const currentSearch = compileDecisionSearch(
      currentQuery,
      searchValidationFeatures,
      searchDateOptions,
    );
    if (!currentSearch.ok) return;

    let nextSearchAst = currentSearch.ast;
    for (const field of DECISION_QUICK_FILTER_FIELDS) {
      nextSearchAst = replaceSearchFacetSelection(nextSearchAst, field, {
        included: [],
        excluded: [],
      });
    }
    nextSearchAst = replaceSearchFacetSelection(nextSearchAst, 'sim', {
      included: [],
      excluded: [],
    });
    nextSearchAst = replaceSearchDateRange(nextSearchAst, { start: '', end: '' });
    const nextQuery = serializeSearchNode(nextSearchAst);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('dateStart');
    nextParams.delete('dateEnd');
    nextParams.delete('include_expired');
    nextParams.delete('simulation');
    if (nextQuery) nextParams.set('q', nextQuery);
    else nextParams.delete('q');

    cancelSearchDebounce();
    searchDraftRef.current = nextQuery;
    searchSelectionRef.current = { start: nextQuery.length, end: nextQuery.length };
    skipSearchParamSyncRef.current = nextQuery;
    setSearchDraft(nextQuery);
    setDebouncedSearchDraft(nextQuery);
    setSearchParams(nextParams);
    updatePersistedQuickFilters(() => emptyStoredQuickFilters());
  }, [
    cancelSearchDebounce,
    searchDateOptions,
    searchParams,
    searchValidationFeatures,
    setSearchParams,
    updatePersistedQuickFilters,
  ]);
  const formatFacetValue = useCallback(
    (field: FacetField, value: string) => {
      if (field === 'country') return getCountryName(value, language) || value;
      if (field === 'instance') return instanceNames[value] || value;
      if (field === 'status') {
        return value === 'active' ? t('common.active') : t('pages.decisions.expired');
      }
      return value;
    },
    [instanceNames, language, t],
  );
  const getFacetSearchValues = useCallback(
    (field: FacetField, search: string) => {
      if (field === 'country') return getCountryCodesMatchingName(search, language);
      if (field !== 'instance') return [];
      const normalizedSearch = search.trim().toLocaleLowerCase(language);
      return Object.entries(instanceNames)
        .filter(([, name]) => name.toLocaleLowerCase(language).includes(normalizedSearch))
        .map(([id]) => id);
    },
    [instanceNames, language],
  );

  const loadConfig = useCallback(async (refresh = false) => {
    if (!refresh && configRef.current) {
      return configRef.current;
    }

    const configData = await fetchConfig();
    const nextConfig = {
      lookbackHours: configData.lookback_hours,
      simulationsEnabled: configData.simulations_enabled === true,
      canManageEnforcement: configData.permissions?.can_manage_enforcement !== false,
      multipleInstances: (configData.instances?.length || 0) > 1,
      instanceNames: Object.fromEntries(
        (configData.instances || []).map((instance) => [instance.id, instance.name]),
      ),
      instances: configData.instances || [],
    };

    configRef.current = nextConfig;
    setLookbackHours(nextConfig.lookbackHours);
    setSimulationsEnabled(nextConfig.simulationsEnabled);
    setCanManageEnforcement(nextConfig.canManageEnforcement);
    setMultipleInstances(nextConfig.multipleInstances);
    setInstanceNames(nextConfig.instanceNames);
    setInstances(nextConfig.instances);

    return nextConfig;
  }, []);

  const saveDecisionColumns = useCallback((visiblePreferences: TableColumnId[]) => {
    setTableColumnPreferences((currentPreferences) => {
      const nextPreferences = {
        ...currentPreferences,
        decisions: visiblePreferences,
      };
      saveStoredTableColumnPreferences(nextPreferences);
      return nextPreferences;
    });
    setShowColumnsModal(false);
  }, []);

  const loadDecisions = useCallback(
    async ({
      isBackground = false,
      page = 1,
      append = false,
      preserveLoadedPages = false,
      refreshConfig = false,
      forceRefresh = false,
    }: {
      isBackground?: boolean;
      page?: number;
      append?: boolean;
      preserveLoadedPages?: boolean;
      refreshConfig?: boolean;
      forceRefresh?: boolean;
    } = {}) => {
      const loadKey = JSON.stringify({
        page,
        append,
        preserveLoadedPages,
        loadedPage: preserveLoadedPages ? currentPageRef.current : undefined,
        filter: appliedQuery,
        search: searchParams.toString(),
        refreshConfig,
      });
      const lastCompletedLoad = lastCompletedLoadRef.current;
      if (
        inFlightLoadKeysRef.current.has(loadKey) ||
        (!forceRefresh &&
          lastCompletedLoad?.key === loadKey &&
          Date.now() - lastCompletedLoad.completedAt < 250)
      ) {
        return;
      }

      const requestId = ++loadRequestSequenceRef.current;
      const isCurrentRequest = () => requestId === loadRequestSequenceRef.current;
      inFlightLoadKeysRef.current.set(loadKey, requestId);
      if (!append) setLoadingMore(false);
      let completedSuccessfully = false;
      const shouldBlockWithInitialLoading =
        !append && !isBackground && !hasLoadedDecisionsRef.current;
      if (append) {
        setLoadingMore(true);
      } else if (shouldBlockWithInitialLoading) {
        setInitialLoading(true);
      } else {
        setBackgroundLoading(true);
      }
      try {
        const configData = await loadConfig(refreshConfig || !configRef.current);
        if (!isCurrentRequest()) return;
        const requestedSimulationFilter =
          configData.simulationsEnabled === true
            ? parseSimulationFilter(searchParams.get('simulation'))
            : 'all';
        const filters = buildServerFilters(requestedSimulationFilter);
        const decisionsResult = await fetchDecisionsPaginated(page, PAGE_SIZE, filters);
        if (!isCurrentRequest()) return;
        let decisionsData = decisionsResult.data;
        let nextPage = decisionsResult.pagination.page;

        if (!append && preserveLoadedPages) {
          const loadedPageCount = Math.max(1, currentPageRef.current);
          const maxPageToRefresh = Math.max(
            1,
            Math.min(loadedPageCount, decisionsResult.pagination.total_pages || 1),
          );
          if (maxPageToRefresh > 1) {
            const remainingPages = await Promise.all(
              Array.from({ length: maxPageToRefresh - 1 }, (_, index) =>
                fetchDecisionsPaginated(index + 2, PAGE_SIZE, filters),
              ),
            );
            decisionsData = [decisionsResult, ...remainingPages].flatMap((result) => result.data);
          }
          nextPage = maxPageToRefresh;
        }

        if (!isCurrentRequest()) return;
        setDecisions((current) => (append ? [...current, ...decisionsData] : decisionsData));
        currentPageRef.current = append ? decisionsResult.pagination.page : nextPage;
        setCurrentPage(currentPageRef.current);
        setTotalPages(decisionsResult.pagination.total_pages);
        setTotalDecisions(decisionsResult.pagination.total);
        setTotalUnfilteredDecisions(decisionsResult.pagination.unfiltered_total);
        const nextSelectableIds = decisionsData
          .filter((decision) => !isDecisionExpired(decision, Date.now()))
          .map(decisionKey);
        setSelectableDecisionIds((current) =>
          append ? Array.from(new Set([...current, ...nextSelectableIds])) : nextSelectableIds,
        );
        if (!append) {
          setSelectedDecisionIds((current) =>
            current.filter((id) => nextSelectableIds.includes(id)),
          );
        }
        hasLoadedDecisionsRef.current = true;
        setHasLoadedDecisions(true);

        completedSuccessfully = true;
      } catch (error) {
        console.error(error);
      } finally {
        if (inFlightLoadKeysRef.current.get(loadKey) === requestId)
          inFlightLoadKeysRef.current.delete(loadKey);
        if (isCurrentRequest()) {
          if (completedSuccessfully) {
            lastCompletedLoadRef.current = { key: loadKey, completedAt: Date.now() };
          }
          if (append) setLoadingMore(false);
          if (shouldBlockWithInitialLoading) {
            setInitialLoading(false);
          } else {
            setBackgroundLoading(false);
          }
        }
      }
    },
    [appliedQuery, buildServerFilters, loadConfig, searchParams],
  );

  useLayoutEffect(
    () => () => {
      loadRequestSequenceRef.current += 1;
      inFlightLoadKeysRef.current.clear();
      lastCompletedLoadRef.current = null;
    },
    [loadDecisions],
  );

  useEffect(() => {
    loadDecisionsRef.current = loadDecisions;
  }, [loadDecisions]);

  useEffect(() => {
    const intervalId = window.setInterval(() => setNowMs(Date.now()), 1_000);
    return () => window.clearInterval(intervalId);
  }, []);

  const lastDecisionElementRef = useCallback(
    (node: HTMLTableRowElement | null) => {
      if (initialLoading || backgroundLoading || loadingMore || !hasMoreDecisions) return;
      if (observer.current) observer.current.disconnect();
      observer.current = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting) {
          void loadDecisions({ isBackground: true, page: currentPage + 1, append: true });
        }
      });
      if (node) observer.current.observe(node);
    },
    [backgroundLoading, currentPage, hasMoreDecisions, initialLoading, loadDecisions, loadingMore],
  );

  // Sync "q" param to filter state
  useEffect(() => {
    const queryParam = searchParams.get('q');
    const nextQuery = queryParam ?? '';
    if (skipSearchParamSyncRef.current !== null) {
      if (skipSearchParamSyncRef.current === nextQuery) {
        skipSearchParamSyncRef.current = null;
      }
      return;
    }
    cancelSearchDebounce();
    searchDraftRef.current = nextQuery;
    setSearchDraft((current) => (current === nextQuery ? current : nextQuery));
    setDebouncedSearchDraft((current) => (current === nextQuery ? current : nextQuery));
    searchSelectionRef.current = { start: nextQuery.length, end: nextQuery.length };
  }, [cancelSearchDebounce, searchParams]);

  useEffect(() => {
    searchDraftRef.current = searchDraft;
  }, [searchDraft]);

  useLayoutEffect(() => {
    if (showSearchSyntaxModal) {
      return;
    }

    const caretPosition = pendingSearchFocusRef.current;
    if (caretPosition === null) {
      return;
    }

    const input = searchInputRef.current;
    if (!input) {
      return;
    }

    input.focus();
    input.setSelectionRange(caretPosition, caretPosition);
    searchSelectionRef.current = { start: caretPosition, end: caretPosition };
    pendingSearchFocusRef.current = null;
  }, [searchDraft, showSearchSyntaxModal]);

  const updateSearchSelection = useCallback(
    (start: number | null, end: number | null, fallbackLength: number) => {
      const nextStart = Math.min(start ?? fallbackLength, fallbackLength);
      const nextEnd = Math.min(end ?? nextStart, fallbackLength);
      searchSelectionRef.current = { start: nextStart, end: nextEnd };
    },
    [],
  );

  const updateSearchSelectionFromInput = useCallback(
    (input: HTMLInputElement) => {
      updateSearchSelection(input.selectionStart, input.selectionEnd, input.value.length);
    },
    [updateSearchSelection],
  );

  const getSearchInsertionRange = useCallback(
    (currentValue: string) => {
      const input = searchInputRef.current;
      if (
        input &&
        document.activeElement === input &&
        input.selectionStart !== null &&
        input.selectionEnd !== null
      ) {
        updateSearchSelection(input.selectionStart, input.selectionEnd, currentValue.length);
      }

      const { start, end } = searchSelectionRef.current;
      return {
        start: Math.min(start, currentValue.length),
        end: Math.min(end, currentValue.length),
      };
    },
    [updateSearchSelection],
  );

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadDecisions({ refreshConfig: true });
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [loadDecisions]);

  useEffect(() => {
    if (refreshSignal <= lastRefreshSignalRef.current) {
      return;
    }

    lastRefreshSignalRef.current = refreshSignal;
    void loadDecisionsRef
      .current({
        isBackground: true,
        page: 1,
        preserveLoadedPages: true,
        refreshConfig: true,
      })
      .finally(() => setFacetRefreshKey(refreshSignal));
  }, [refreshSignal]);

  useEffect(() => {
    if (searchDraft === debouncedSearchDraft) {
      cancelSearchDebounce();
      return;
    }

    const timeoutId = window.setTimeout(() => {
      searchDebounceTimeoutRef.current = null;
      setDebouncedSearchDraft(searchDraft);
    }, 300);
    searchDebounceTimeoutRef.current = timeoutId;

    return () => {
      if (searchDebounceTimeoutRef.current === timeoutId) {
        window.clearTimeout(timeoutId);
        searchDebounceTimeoutRef.current = null;
      }
    };
  }, [cancelSearchDebounce, debouncedSearchDraft, searchDraft]);

  useEffect(() => {
    if (!compiledSearch.ok) {
      return;
    }

    const nextQuery = debouncedSearchDraft.trim();
    const currentQuery = searchParams.get('q') ?? '';

    if (skipSearchParamSyncRef.current === nextQuery) {
      return;
    }
    if (currentQuery === nextQuery) {
      return;
    }

    const nextParams = new URLSearchParams(searchParams);
    if (nextQuery) {
      nextParams.set('q', nextQuery);
    } else {
      nextParams.delete('q');
    }
    if (nextParams.toString() !== searchParams.toString()) {
      skipSearchParamSyncRef.current = nextQuery;
      setSearchParams(nextParams);
    }
  }, [compiledSearch, debouncedSearchDraft, searchParams, setSearchParams]);

  const openAddDecision = () => setShowAddModal(true);

  // Trigger modal instead of window.confirm
  const requestDelete = (decision: DecisionListItem) => {
    setPendingDeleteErrorInfo(null);
    setPendingDeleteAction({ kind: 'single', ref: decisionRef(decision) });
  };

  const confirmDelete = async () => {
    if (!pendingDeleteAction) return;
    setDeleteInProgress(true);
    setErrorInfo(null);
    setPendingDeleteErrorInfo(null);
    try {
      let resultMessage: string | null = null;

      if (pendingDeleteAction.kind === 'single') {
        const instanceScope = searchParams.get('instance');
        await deleteDecision(
          pendingDeleteAction.ref.id,
          multipleInstances || (instanceScope && instanceScope !== 'all')
            ? pendingDeleteAction.ref.instance_id
            : undefined,
        );
        setSelectedDecisionIds((prev) =>
          prev.filter(
            (id) =>
              id !== `${pendingDeleteAction.ref.instance_id}\u0000${pendingDeleteAction.ref.id}`,
          ),
        );
      } else if (pendingDeleteAction.kind === 'selected') {
        const result = await bulkDeleteDecisions(
          multipleInstances
            ? pendingDeleteAction.refs
            : pendingDeleteAction.refs.map((ref) => ref.id),
        );
        resultMessage = summarizeDeleteResult(result, t);
        setSelectedDecisionIds([]);
      } else {
        const instanceScope = searchParams.get('instance');
        const result =
          retryCleanupInstances.length > 0
            ? combineDeleteResults(
                await Promise.all(
                  retryCleanupInstances.map((instance) =>
                    cleanupByIp({
                      ip: pendingDeleteAction.ip,
                      scope: 'instance',
                      instance_id: instance.instance_id,
                    }),
                  ),
                ),
              )
            : await cleanupByIp(
                !instanceScope && !multipleInstances
                  ? pendingDeleteAction.ip
                  : instanceScope === 'all' || !instanceScope
                    ? { ip: pendingDeleteAction.ip, scope: 'all' }
                    : { ip: pendingDeleteAction.ip, scope: 'instance', instance_id: instanceScope },
              );
        resultMessage = summarizeDeleteResult(result, t);
        setSelectedDecisionIds([]);
        if (
          result.deleted_alerts === 0 &&
          result.deleted_decisions === 0 &&
          result.failed.length === 0
        ) {
          resultMessage = t('pages.alerts.noAlertsOrDecisionsForIp', {
            ip: pendingDeleteAction.ip,
          });
        }
        const failedInstances =
          result.instance_results?.filter((instance) => !instance.success) || [];
        if (failedInstances.length > 0) {
          const succeededNames =
            result.instance_results
              ?.filter((instance) => instance.success)
              .map((instance) => instance.instance_name) || [];
          setRetryCleanupInstances(failedInstances);
          setPendingDeleteErrorInfo({
            message: `${succeededNames.length > 0 ? `Succeeded: ${succeededNames.join(', ')}. ` : ''}Failed: ${failedInstances.map((instance) => instance.instance_name).join(', ')}.`,
          });
          await loadDecisions({ page: 1, refreshConfig: true });
          return;
        }
        setRetryCleanupInstances([]);
      }

      setPendingDeleteAction(null);
      setPendingDeleteErrorInfo(null);
      await loadDecisions({ page: 1, refreshConfig: true });
      if (resultMessage) {
        setErrorInfo({ message: resultMessage });
      }
    } catch (error) {
      const fallbackMessage =
        pendingDeleteAction.kind === 'single'
          ? t('pages.decisions.deleteFailed')
          : pendingDeleteAction.kind === 'selected'
            ? t('pages.decisions.deleteSelectedFailed')
            : t('pages.alerts.deleteIpFailed');
      console.error('Failed to delete decision entries', error);
      setPendingDeleteErrorInfo(toErrorInfo(error, fallbackMessage));
    } finally {
      setDeleteInProgress(false);
    }
  };

  const cancelPendingDelete = () => {
    setPendingDeleteAction(null);
    setPendingDeleteErrorInfo(null);
    setRetryCleanupInstances([]);
  };

  const toggleDecisionSelection = (decisionId: string) => {
    setSelectedDecisionIds((prev) =>
      prev.includes(decisionId) ? prev.filter((id) => id !== decisionId) : [...prev, decisionId],
    );
  };

  const applySavedFilter = useCallback(
    (query: string) => {
      cancelSearchDebounce();
      searchDraftRef.current = query;
      setSearchDraft(query);
      setDebouncedSearchDraft(query);
      searchSelectionRef.current = { start: query.length, end: query.length };
      const currentQuery = searchParams.get('q') ?? '';
      skipSearchParamSyncRef.current = currentQuery === query ? null : query;
      if (currentQuery !== query) {
        const nextParams = new URLSearchParams(searchParams);
        nextParams.set('q', query);
        setSearchParams(nextParams);
      }
    },
    [cancelSearchDebounce, searchParams, setSearchParams],
  );

  const applySearchExample = useCallback(
    (query: string) => {
      cancelSearchDebounce();
      searchDraftRef.current = query;
      setSearchDraft(query);
      setDebouncedSearchDraft(query);
      pendingSearchFocusRef.current = query.length;
      setShowSearchSyntaxModal(false);
    },
    [cancelSearchDebounce],
  );

  const insertSearchSnippet = useCallback(
    (snippet: string) => {
      const currentValue = searchInputRef.current?.value ?? searchDraftRef.current;
      const { start, end } = getSearchInsertionRange(currentValue);
      const nextCaretPosition = start + snippet.length;
      const nextQuery = `${currentValue.slice(0, start)}${snippet}${currentValue.slice(end)}`;

      cancelSearchDebounce();
      searchDraftRef.current = nextQuery;
      searchSelectionRef.current = { start: nextCaretPosition, end: nextCaretPosition };
      setSearchDraft(nextQuery);
      setDebouncedSearchDraft(nextQuery);
      pendingSearchFocusRef.current = nextCaretPosition;
      setShowSearchSyntaxModal(false);
    },
    [cancelSearchDebounce, getSearchInsertionRange],
  );

  const clearFilter = useCallback(() => {
    cancelSearchDebounce();
    searchDraftRef.current = '';
    setSearchDraft('');
    setDebouncedSearchDraft('');
    pendingSearchFocusRef.current = null;
    searchSelectionRef.current = { start: 0, end: 0 };
    skipSearchParamSyncRef.current = '';
    const instance = searchParams.get('instance');
    setSearchParams(instance ? { instance } : {});
  }, [cancelSearchDebounce, searchParams, setSearchParams]);

  const removeParam = (key: string) => {
    const newParams = new URLSearchParams(searchParams);
    newParams.delete(key);
    setSearchParams(newParams);
  };

  const toggleExpired = () => {
    const newValue = !includeExpiredParam;

    // Update URL params
    const newParams = new URLSearchParams(searchParams);
    if (newValue) {
      newParams.set('include_expired', 'true');
    } else {
      newParams.delete('include_expired');
    }
    setSearchParams(newParams);
  };

  const filteredDecisions = decisions;
  const visibleExpiredDecisionIds = new Set(
    filteredDecisions.filter((decision) => isDecisionExpired(decision, nowMs)).map(decisionKey),
  );
  const activeSelectableDecisionIds = selectableDecisionIds.filter(
    (id) => !visibleExpiredDecisionIds.has(id),
  );
  const selectedFilteredDecisionIds = activeSelectableDecisionIds.filter((id) =>
    selectedDecisionIds.includes(id),
  );
  const selectedFilteredDecisionRefs = filteredDecisions
    .filter((decision) => selectedFilteredDecisionIds.includes(decisionKey(decision)))
    .map(decisionRef);
  const allFilteredDecisionsSelected =
    activeSelectableDecisionIds.length > 0 &&
    selectedFilteredDecisionIds.length === activeSelectableDecisionIds.length;
  const someFilteredDecisionsSelected =
    selectedFilteredDecisionIds.length > 0 && !allFilteredDecisionsSelected;

  useEffect(() => {
    if (selectAllDecisionsRef.current) {
      selectAllDecisionsRef.current.indeterminate = someFilteredDecisionsSelected;
    }
  }, [someFilteredDecisionsSelected]);

  const toggleAllFilteredDecisions = () => {
    setSelectedDecisionIds((prev) => {
      if (allFilteredDecisionsSelected) {
        return prev.filter((id) => !activeSelectableDecisionIds.includes(id));
      }

      return Array.from(new Set([...prev, ...activeSelectableDecisionIds]));
    });
  };

  const visibleDecisions = filteredDecisions;
  const selectedDecisionCount = selectedFilteredDecisionIds.length;
  const deleteActionTitle =
    pendingDeleteAction?.kind === 'single'
      ? t('pages.decisions.deleteDecisionTitle')
      : pendingDeleteAction?.kind === 'selected'
        ? t('pages.decisions.deleteSelectedTitle')
        : pendingDeleteAction?.kind === 'ip'
          ? t('pages.alerts.deleteAllIpTitle')
          : t('common.delete');
  const pendingDecisionId =
    pendingDeleteAction?.kind === 'single' ? pendingDeleteAction.ref.id : null;
  const pendingIp = pendingDeleteAction?.kind === 'ip' ? pendingDeleteAction.ip : null;
  const summaryText =
    initialLoading && !hasLoadedDecisions
      ? t('pages.decisions.loading')
      : totalDecisions !== totalUnfilteredDecisions
        ? t('pages.decisions.summaryFiltered', {
            count: visibleDecisions.length,
            total: totalDecisions,
            unfiltered: totalUnfilteredDecisions,
          })
        : t('pages.decisions.summary', { count: visibleDecisions.length, total: totalDecisions });
  const tableBusy = initialLoading || backgroundLoading || loadingMore;
  const quickFilterProps = {
    page: 'decisions' as const,
    fields: quickFilterConfig.fields,
    sectionOrder: quickFilterConfig.sectionOrder,
    hiddenSectionOrder: quickFilterConfig.hiddenSectionOrder,
    unavailableSectionOrder: quickFilterConfig.unavailableSectionOrder,
    filters: facetFilters,
    searchAst: compiledSearch.ok ? compiledSearch.ast : null,
    onSelectionChange: applyFacetSelection,
    dateRange: quickFilterDateRange,
    onDateRangeChange: applyDateRange,
    onClearAll: clearQuickFilters,
    lookbackHours,
    simulation: simulationsEnabled
      ? { value: quickFilterSimulation, onChange: applySimulationSelection }
      : undefined,
    getSelection: getFacetSelection,
    formatValue: formatFacetValue,
    getSearchValues: getFacetSearchValues,
    busy: tableBusy,
    refreshKey: facetRefreshKey,
    disabledReason: quickFilterDisabledReason,
  };

  return (
    <div className="space-y-6">
      <div
        data-testid="decisions-summary"
        className="flex min-h-[1.5rem] items-center justify-between gap-3 text-sm text-gray-500"
      >
        <span>{summaryText}</span>
        <span
          className={`inline-flex items-center gap-2 text-xs transition-opacity ${backgroundLoading ? 'opacity-100' : 'opacity-0'}`}
          aria-live="polite"
        >
          <span className="bg-primary-500 h-2 w-2 animate-pulse rounded-full" aria-hidden="true" />
          {t('common.refreshing')}
        </span>
      </div>

      {canManageEnforcement && (
        <div className="flex items-center gap-3">
          <button
            onClick={openAddDecision}
            className="bg-primary-600 hover:bg-primary-700 flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium text-white transition-colors"
          >
            <Gavel size={16} />
            {t('pages.decisions.addDecision')}
          </button>
          <button
            onClick={() => {
              setPendingDeleteErrorInfo(null);
              setPendingDeleteAction({ kind: 'selected', refs: selectedFilteredDecisionRefs });
            }}
            disabled={selectedDecisionCount === 0}
            className="rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t('pages.decisions.deleteSelected')}
          </button>
        </div>
      )}

      {/* Error Message */}
      {errorInfo && <ErrorBanner errorInfo={errorInfo} onDismiss={() => setErrorInfo(null)} />}

      {/* Show active filters */}
      {(includeExpiredParam ||
        !includeExpiredParam ||
        appliedQuery ||
        alertIdFilter ||
        (simulationsEnabled && simulationFilter !== 'all')) && (
        <div className="flex flex-wrap gap-2">
          {appliedQuery && (
            <Badge variant="secondary" className="flex max-w-full items-center gap-1">
              <span className="font-semibold">{t('common.search')}:</span>
              <span className="max-w-[320px] truncate font-mono text-xs">{appliedQuery}</span>
              <button
                onClick={() => {
                  const nextParams = new URLSearchParams(searchParams);
                  nextParams.delete('q');
                  cancelSearchDebounce();
                  setSearchDraft('');
                  setDebouncedSearchDraft('');
                  setSearchParams(nextParams);
                }}
                className="ml-1 hover:text-red-500"
              >
                &times;
              </button>
            </Badge>
          )}
          {!includeExpiredParam && (
            <Badge variant="secondary" className="flex items-center gap-1">
              <span className="font-semibold">{t('common.hide')}:</span> {t('common.inactive')}
              <button onClick={toggleExpired} className="ml-1 hover:text-red-500">
                &times;
              </button>
            </Badge>
          )}
          {!showDuplicates && (
            <Badge variant="secondary" className="flex items-center gap-1">
              <span className="font-semibold">{t('common.hide')}:</span>{' '}
              {t('pages.decisions.duplicates')}
              <button
                onClick={() => {
                  const newParams = new URLSearchParams(searchParams);
                  newParams.set('hide_duplicates', 'false');
                  setSearchParams(newParams);
                }}
                className="ml-1 hover:text-red-500"
              >
                &times;
              </button>
            </Badge>
          )}
          {alertIdFilter && (
            <Badge variant="secondary" className="flex max-w-full items-center gap-1">
              <span className="font-semibold">{t('tableColumns.alert')}:</span>
              <span className="max-w-[320px] truncate" title={alertIdFilter}>
                #{alertIdFilter.split(',').join(', #')}
              </span>
              <button onClick={() => removeParam('alert_id')} className="ml-1 hover:text-red-500">
                &times;
              </button>
            </Badge>
          )}
          {simulationsEnabled && simulationFilter !== 'all' && (
            <Badge variant="secondary" className="flex items-center gap-1">
              <span className="font-semibold">{t('pages.dashboard.simulation')}:</span>{' '}
              {simulationFilter}
              <button onClick={() => removeParam('simulation')} className="ml-1 hover:text-red-500">
                &times;
              </button>
            </Badge>
          )}

          {/* Show Reset button if we have any active filters OR if we are showing expired/duplicates (non-default state) */}
          {(appliedQuery ||
            alertIdFilter ||
            includeExpiredParam ||
            showDuplicates ||
            (simulationsEnabled && simulationFilter !== 'all')) && (
            <button
              onClick={clearFilter}
              className="text-xs text-gray-500 underline hover:text-gray-900 dark:hover:text-gray-300"
            >
              {t('common.resetAllFilters')}
            </button>
          )}
        </div>
      )}

      <div className="space-y-2">
        <div className="flex flex-wrap items-start gap-x-1.5 gap-y-2 min-[360px]:gap-x-2 sm:flex-nowrap">
          <button
            type="button"
            onClick={() => setShowColumnsModal(true)}
            className="mr-auto inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-gray-300 bg-white px-3 text-gray-600 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
            aria-label={t('components.tableColumns.chooseDecisionColumns')}
            title={t('components.tableColumns.chooseColumns')}
          >
            <Columns3 size={18} />
          </button>
          <div className="contents sm:ml-auto sm:flex sm:min-w-0 sm:flex-1 sm:items-start sm:justify-end sm:gap-2">
            <CollapsibleSearchControls
              inputRef={searchInputRef}
              onHelp={() => setShowSearchSyntaxModal(true)}
              forceExpanded={Boolean(quickFilterDisabledReason)}
              stackInputOnMobile
              footer={
                queryError || quickFilterDisabledReason ? (
                  <div className="space-y-1">
                    {queryError && (
                      <p
                        id="decisions-search-error"
                        className="text-xs text-red-600 dark:text-red-400"
                      >
                        {t('common.searchSyntaxError', {
                          position: queryError.position + 1,
                          message: queryError.message,
                        })}
                      </p>
                    )}
                    {quickFilterDisabledReason && (
                      <QuickFilterDisabledNotice reason={quickFilterDisabledReason} />
                    )}
                  </div>
                ) : undefined
              }
            >
              <HighlightedSearchInput
                ref={searchInputRef}
                searchPage="decisions"
                showSearchIcon={false}
                containerClassName="sm:rounded-r-none"
                className="sm:rounded-r-none"
                searchFeatures={searchValidationFeatures}
                placeholder={t('pages.decisions.filterPlaceholder')}
                value={searchDraft}
                error={queryError}
                onChange={(e) => {
                  searchDraftRef.current = e.target.value;
                  setSearchDraft(e.target.value);
                  updateSearchSelectionFromInput(e.target);
                }}
                onClick={(e) => updateSearchSelectionFromInput(e.currentTarget)}
                onKeyUp={(e) => updateSearchSelectionFromInput(e.currentTarget)}
                onSelect={(e) => updateSearchSelectionFromInput(e.currentTarget)}
                aria-invalid={queryError ? 'true' : 'false'}
                aria-describedby={queryError ? 'decisions-search-error' : undefined}
              />
            </CollapsibleSearchControls>
            <SavedFiltersMenu page="decisions" query={searchDraft} onApply={applySavedFilter} />
            <QuickFilters {...quickFilterProps} onOpenChange={setQuickFiltersOpen} />
          </div>
        </div>
      </div>

      <div className="acrylic overflow-clip rounded-lg border" aria-busy={tableBusy}>
        <HorizontalScrollArea>
          <table
            ref={decisionTableRef}
            {...decisionColumnWidths.tableProps}
            className="min-w-full divide-y divide-gray-200 dark:divide-gray-700"
          >
            <TableColumnGroup columnWidths={decisionColumnWidths} />
            <thead className="bg-gray-50 dark:bg-gray-900/50">
              <tr>
                {canManageEnforcement && (
                  <th className="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400">
                    <input
                      ref={selectAllDecisionsRef}
                      type="checkbox"
                      aria-label={t('pages.decisions.selectAllFiltered')}
                      checked={allFilteredDecisionsSelected}
                      disabled={activeSelectableDecisionIds.length === 0}
                      onChange={toggleAllFilteredDecisions}
                      className="text-primary-600 focus:ring-primary-500 h-4 w-4 rounded border-gray-300"
                    />
                  </th>
                )}
                {visibleDecisionColumns.map((columnId) => {
                  const column = decisionColumnDefinitionById.get(columnId);
                  if (!column) {
                    return null;
                  }

                  return (
                    <ResizableColumnHeader
                      key={columnId}
                      columnId={columnId}
                      label={t(`tableColumns.${column.id}`, { defaultValue: column.label })}
                      columnWidths={decisionColumnWidths}
                      className="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400"
                    />
                  );
                })}
                {canManageEnforcement && (
                  <th
                    className={`px-6 py-3 text-right text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400 ${STICKY_ACTIONS_HEADER_CLASS_NAME}`}
                  >
                    {t('tableColumns.actions')}
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
              {initialLoading && visibleDecisions.length === 0 ? (
                <tr>
                  <td
                    colSpan={decisionTableColSpan}
                    className="px-6 py-4 text-center text-sm text-gray-500"
                  >
                    {t('pages.decisions.loading')}
                  </td>
                </tr>
              ) : visibleDecisions.length === 0 ? (
                <tr>
                  <td
                    colSpan={decisionTableColSpan}
                    className="px-6 py-4 text-center text-sm text-gray-500"
                  >
                    {alertIdFilter
                      ? t('pages.decisions.noDecisionsForAlert')
                      : t('pages.decisions.noDecisions')}
                  </td>
                </tr>
              ) : (
                visibleDecisions.map((decision, index) => {
                  const expirationState = getDecisionExpirationState(decision, nowMs);
                  const decisionDuration = expirationState.label;
                  const isExpired = expirationState.isExpired;
                  const rowClasses = isExpired
                    ? 'group hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors opacity-60 bg-gray-50 dark:bg-gray-900/20'
                    : 'group hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors';

                  const isLastElement = index === visibleDecisions.length - 1;
                  const rowKey = decisionKey(decision);
                  const isSelected = selectedDecisionIds.includes(rowKey);

                  return (
                    <tr
                      key={`${rowKey}-${decision.detail.duration}`}
                      className={rowClasses}
                      ref={isLastElement ? lastDecisionElementRef : null}
                    >
                      {canManageEnforcement && (
                        <td className="px-6 py-4 text-sm whitespace-nowrap">
                          <input
                            type="checkbox"
                            aria-label={t('pages.decisions.selectDecision', { id: decision.id })}
                            checked={isSelected}
                            disabled={isExpired}
                            onChange={() => toggleDecisionSelection(rowKey)}
                            className="text-primary-600 focus:ring-primary-500 h-4 w-4 rounded border-gray-300 disabled:cursor-not-allowed disabled:opacity-50"
                          />
                        </td>
                      )}
                      {visibleDecisionColumns.map((columnId) => {
                        switch (columnId) {
                          case 'instance':
                            return (
                              <td
                                key={columnId}
                                className="px-6 py-4 text-sm whitespace-nowrap text-gray-900 dark:text-gray-100"
                              >
                                <Badge variant="secondary">
                                  {decision.instance_name || decision.instance_id || 'default'}
                                </Badge>
                              </td>
                            );
                          case 'id':
                            return (
                              <td
                                key={columnId}
                                className="px-6 py-4 font-mono text-sm whitespace-nowrap text-gray-900 dark:text-gray-100"
                              >
                                #{decision.id}
                              </td>
                            );
                          case 'time':
                            return (
                              <td
                                key={columnId}
                                className="px-6 py-4 text-sm whitespace-nowrap text-gray-900 dark:text-gray-100"
                              >
                                <TimeDisplay timestamp={decision.created_at} />
                              </td>
                            );
                          case 'scenario':
                            return (
                              <td
                                key={columnId}
                                className="max-w-[200px] px-6 py-4 text-sm text-gray-900 dark:text-gray-100"
                                title={decision.detail.reason}
                              >
                                <ScenarioName
                                  name={decision.detail.reason}
                                  showLink={true}
                                  simulated={simulationsEnabled && isSimulatedDecision(decision)}
                                />
                              </td>
                            );
                          case 'target':
                            return (
                              <td
                                key={columnId}
                                className="max-w-[180px] px-6 py-4 text-sm text-gray-900 dark:text-gray-100"
                              >
                                <TargetDisplay
                                  target={decision.detail.target}
                                  targetCount={decision.detail.target_count}
                                />
                              </td>
                            );
                          case 'country':
                            return (
                              <td
                                key={columnId}
                                className="px-6 py-4 align-middle text-sm text-gray-900 dark:text-gray-100"
                              >
                                {decision.detail.country &&
                                decision.detail.country !== 'Unknown' ? (
                                  <div
                                    className="flex items-center gap-2"
                                    title={decision.detail.country}
                                  >
                                    <CountryFlag code={decision.detail.country} />
                                    <span>{getCountryName(decision.detail.country, language)}</span>
                                  </div>
                                ) : (
                                  '-'
                                )}
                              </td>
                            );
                          case 'city':
                            return (
                              <td
                                key={columnId}
                                className="max-w-[160px] truncate px-6 py-4 text-sm text-gray-900 dark:text-gray-100"
                                title={decision.detail.city}
                              >
                                {decision.detail.city || '-'}
                              </td>
                            );
                          case 'region':
                            return (
                              <td
                                key={columnId}
                                className="max-w-[180px] truncate px-6 py-4 text-sm text-gray-900 dark:text-gray-100"
                                title={decision.detail.region}
                              >
                                {decision.detail.region || '-'}
                              </td>
                            );
                          case 'as':
                            return (
                              <td
                                key={columnId}
                                className="max-w-[150px] truncate px-6 py-4 text-sm text-gray-900 dark:text-gray-100"
                                title={decision.detail.as}
                              >
                                {decision.detail.as && decision.detail.as !== 'Unknown'
                                  ? decision.detail.as
                                  : '-'}
                              </td>
                            );
                          case 'source':
                            return (
                              <td
                                key={columnId}
                                className="max-w-[200px] truncate px-6 py-4 font-mono text-sm text-gray-900 dark:text-gray-100"
                                title={decision.value}
                              >
                                {decision.value}
                              </td>
                            );
                          case 'action':
                            return (
                              <td
                                key={columnId}
                                className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100"
                              >
                                <Badge variant="danger">{decision.detail.action || 'ban'}</Badge>
                              </td>
                            );
                          case 'expiration':
                            return (
                              <td
                                key={columnId}
                                className="px-6 py-4 text-sm whitespace-nowrap text-gray-900 dark:text-gray-100"
                              >
                                {isExpired ? '0s' : decisionDuration}
                                {isExpired && (
                                  <span className="ml-2 text-xs text-red-500 dark:text-red-400">
                                    {t('pages.decisions.expired')}
                                  </span>
                                )}
                              </td>
                            );
                          case 'machine':
                            return (
                              <td
                                key={columnId}
                                className="max-w-[120px] truncate px-6 py-4 text-sm text-gray-500 dark:text-gray-400"
                                title={decision.machine}
                              >
                                {decision.machine || '-'}
                              </td>
                            );
                          case 'origin':
                            return (
                              <td
                                key={columnId}
                                className="max-w-[120px] truncate px-6 py-4 text-sm text-gray-500 dark:text-gray-400"
                                title={decision.detail.origin}
                              >
                                {decision.detail.origin || '-'}
                              </td>
                            );
                          case 'message': {
                            const message = formatAlertMessage(decision.message);
                            return (
                              <td
                                key={columnId}
                                className="max-w-[260px] truncate px-6 py-4 text-sm text-gray-900 dark:text-gray-100"
                                title={message}
                              >
                                {message || '-'}
                              </td>
                            );
                          }
                          case 'kind':
                            return (
                              <td
                                key={columnId}
                                className="px-6 py-4 align-middle text-sm text-gray-900 dark:text-gray-100"
                              >
                                {decision.kind || '-'}
                              </td>
                            );
                          case 'alert':
                            return (
                              <td key={columnId} className="px-6 py-4 text-sm whitespace-nowrap">
                                {decision.detail.alert_id ? (
                                  <Link
                                    to={`/alerts?${new URLSearchParams({
                                      id: String(decision.detail.alert_id),
                                      instance: decision.instance_id || 'default',
                                    }).toString()}`}
                                    className="bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300 hover:bg-primary-100 dark:hover:bg-primary-900/30 border-primary-200 dark:border-primary-800 inline-flex items-center gap-2 rounded-full border px-2 py-1 transition-colors"
                                    title={t('pages.decisions.viewAlert', {
                                      id: decision.detail.alert_id,
                                    })}
                                  >
                                    <Shield size={14} className="fill-current" />
                                    <span className="text-xs font-semibold">
                                      {t('tableColumns.alert')}
                                    </span>
                                    <ExternalLink size={12} className="ml-0.5" />
                                  </Link>
                                ) : (
                                  <span className="text-gray-400">-</span>
                                )}
                              </td>
                            );
                          default:
                            return null;
                        }
                      })}
                      {canManageEnforcement && (
                        <td
                          className={`px-6 py-4 text-right text-sm font-medium whitespace-nowrap ${isExpired ? STICKY_ACTIONS_EXPIRED_CELL_CLASS_NAME : STICKY_ACTIONS_CELL_CLASS_NAME}`}
                        >
                          <div className="flex items-center justify-end gap-2">
                            {decision.value && (
                              <button
                                onClick={() => {
                                  setPendingDeleteErrorInfo(null);
                                  setPendingDeleteAction({ kind: 'ip', ip: decision.value || '' });
                                }}
                                className="relative z-10 cursor-pointer rounded-full p-2 text-red-600 transition-colors hover:bg-red-50 hover:text-red-900 dark:text-red-400 dark:hover:bg-red-900/20 dark:hover:text-red-300"
                                title={t('common.deleteAllForIp', { value: decision.value })}
                                aria-label={t('common.deleteAllForIp', { value: decision.value })}
                              >
                                <ShieldBan size={16} aria-hidden="true" />
                              </button>
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                requestDelete(decision);
                              }}
                              disabled={isExpired}
                              className={`relative z-10 cursor-pointer rounded-full p-2 transition-colors ${isExpired ? 'cursor-not-allowed bg-gray-100 text-gray-300 dark:bg-gray-800 dark:text-gray-600' : 'text-red-600 hover:bg-red-50 hover:text-red-900 dark:text-red-400 dark:hover:bg-red-900/20 dark:hover:text-red-300'}`}
                              title={
                                isExpired
                                  ? t('pages.decisions.alreadyExpired')
                                  : t('pages.decisions.deleteDecision')
                              }
                              aria-label={
                                isExpired
                                  ? t('pages.decisions.alreadyExpired')
                                  : t('pages.decisions.deleteDecision')
                              }
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
              {loadingMore && visibleDecisions.length > 0 && (
                <TableLoadingRow
                  colSpan={decisionTableColSpan}
                  label={t('pages.decisions.loadingMore')}
                />
              )}
            </tbody>
          </table>
        </HorizontalScrollArea>
      </div>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={!!pendingDeleteAction}
        onClose={() => {
          if (!deleteInProgress) {
            cancelPendingDelete();
          }
        }}
        title={deleteActionTitle}
        maxWidth="max-w-sm"
        showCloseButton={false}
      >
        <p className="mb-6 text-gray-600 dark:text-gray-300">
          {pendingDecisionId ? (
            <>
              {t('pages.decisions.deleteDecisionConfirmPrefix')}{' '}
              <span className="font-mono text-sm font-bold">#{pendingDecisionId}</span>?{' '}
              {t('common.actionCannotBeUndone')}
            </>
          ) : pendingIp ? (
            <>
              {t('common.deleteIpConfirmPrefix')}{' '}
              <span className="font-mono text-sm font-bold">{pendingIp}</span>?{' '}
              {t('common.actionCannotBeUndone')}
            </>
          ) : (
            <>
              {t('pages.decisions.deleteSelectedConfirm', {
                count: selectedFilteredDecisionIds.length,
              })}
            </>
          )}
        </p>
        {pendingDeleteErrorInfo && (
          <div className="mb-6">
            <ErrorBanner errorInfo={pendingDeleteErrorInfo} />
          </div>
        )}
        <div className="flex justify-end gap-3">
          <button
            onClick={cancelPendingDelete}
            disabled={deleteInProgress}
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={confirmDelete}
            disabled={deleteInProgress}
            className="rounded-md border border-transparent bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          >
            {deleteInProgress
              ? t('common.deleting')
              : retryCleanupInstances.length > 0
                ? 'Retry failed instances'
                : t('common.delete')}
          </button>
        </div>
      </Modal>

      {showAddModal && (
        <AddDecisionModal
          initialDecision={{ ip: '', duration: '4h', reason: 'manual' }}
          instances={instances}
          multipleInstances={multipleInstances}
          currentInstanceId={
            searchParams.get('instance') && searchParams.get('instance') !== 'all'
              ? searchParams.get('instance')!
              : undefined
          }
          currentInstanceName={instanceNames[searchParams.get('instance') || '']}
          defaultAllInstances={
            !searchParams.get('instance') || searchParams.get('instance') === 'all'
          }
          onClose={() => setShowAddModal(false)}
          onDecisionAdded={() =>
            loadDecisions({ page: 1, refreshConfig: true, forceRefresh: true })
          }
        />
      )}
      <SearchSyntaxModal
        help={searchHelp}
        searchFeatures={searchValidationFeatures}
        isOpen={showSearchSyntaxModal}
        onClose={() => setShowSearchSyntaxModal(false)}
        onSelectExample={applySearchExample}
        onInsertSnippet={insertSearchSnippet}
      />
      <TableColumnsModal
        isOpen={showColumnsModal}
        table="decisions"
        columnPreferences={tableColumnPreferences.decisions}
        onClose={() => setShowColumnsModal(false)}
        hasCustomWidths={decisionColumnWidths.hasCustomWidths}
        onResetWidths={decisionColumnWidths.resetWidths}
        onSave={saveDecisionColumns}
      />
    </div>
  );
}
