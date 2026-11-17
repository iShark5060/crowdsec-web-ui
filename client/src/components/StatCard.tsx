import { ExternalLink } from 'lucide-react';
import type { LucideProps } from 'lucide-react';
import { useMemo } from 'react';
import type { ComponentType, ReactNode } from 'react';

import { useI18n } from '../lib/i18n';
import type { StatListItem } from '../types';
import { CountryFlag } from './CountryFlag';
import { Card, CardContent, CardHeader, CardTitle } from './ui/Card';

interface StatCardProps<TItem extends StatListItem> {
  title: string;
  icon?: ComponentType<LucideProps>;
  items: TItem[];
  emptyMessage?: string;
  onSelect?: (item: TItem) => void;
  selectedValue?: string | null;
  selectedValues?: string[];
  renderLabel?: (item: TItem) => ReactNode;
  getExternalLink?: (item: TItem) => string | null;
  total?: number;
  selectionDisabledReason?: string;
  headerAction?: ReactNode;
}

/**
 * StatCard component for displaying top statistics
 */
export function StatCard<TItem extends StatListItem>({
  title,
  icon: Icon,
  items,
  emptyMessage,
  onSelect, // Changed from getLink to generic onSelect
  selectedValue, // The currently selected value for highlighting
  selectedValues = [],
  renderLabel, // Optional function to render custom label content
  getExternalLink,
  total, // Optional total count to calculate percentages against global total instead of visible items
  selectionDisabledReason,
  headerAction,
}: StatCardProps<TItem>) {
  const { t } = useI18n();
  const resolvedEmptyMessage = emptyMessage ?? t('common.noDataAvailable');

  // Calculate total for percentages
  const denominator = useMemo(() => {
    if (total !== undefined) return total;
    return items.reduce((sum, item) => sum + item.count, 0);
  }, [items, total]);

  return (
    <Card className="h-full">
      <CardHeader className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2 text-lg">
          {Icon && <Icon className="text-primary-600 dark:text-primary-400 h-5 w-5" />}
          {title}
        </CardTitle>
        {headerAction}
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="py-4 text-center text-sm text-gray-500 dark:text-gray-400">
            {resolvedEmptyMessage}
          </p>
        ) : (
          <div className="space-y-2">
            {items.map((item, idx) => {
              const isSelected =
                selectedValue === item.value ||
                selectedValue === item.label ||
                selectedValues.includes(item.value ?? item.label);
              const percent =
                denominator > 0 ? ((item.count / denominator) * 100).toFixed(1) : '0.0';

              const handleRowClick = () => {
                if (onSelect && !selectionDisabledReason) {
                  onSelect(item);
                }
              };

              const hubUrl = getExternalLink ? getExternalLink(item) : null;

              return (
                <div
                  key={idx}
                  onClick={handleRowClick}
                  role={onSelect ? 'button' : undefined}
                  aria-pressed={onSelect ? isSelected : undefined}
                  tabIndex={onSelect ? 0 : undefined}
                  onKeyDown={(event) => {
                    if (
                      event.target !== event.currentTarget ||
                      !onSelect ||
                      (event.key !== 'Enter' && event.key !== ' ')
                    )
                      return;
                    event.preventDefault();
                    handleRowClick();
                  }}
                  aria-disabled={selectionDisabledReason ? 'true' : undefined}
                  title={selectionDisabledReason}
                  className={`focus-visible:outline-primary-500 flex items-center justify-between rounded-lg border p-2 transition-colors focus-visible:outline-2 ${
                    !onSelect
                      ? ''
                      : selectionDisabledReason
                        ? 'cursor-not-allowed opacity-70'
                        : 'cursor-pointer'
                  } ${
                    isSelected
                      ? 'bg-primary-50 dark:bg-primary-900/40 border-primary-200 dark:border-primary-800'
                      : `border-transparent ${!onSelect || selectionDisabledReason ? '' : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'}`
                  }`}
                >
                  <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
                    <span
                      className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                        isSelected
                          ? 'bg-primary-600 text-white'
                          : 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                      }`}
                    >
                      {idx + 1}
                    </span>
                    {item.countryCode && <CountryFlag code={item.countryCode} />}
                    <div className="min-w-0 flex-1">
                      {renderLabel ? (
                        renderLabel(item)
                      ) : (
                        <span
                          className={`truncate text-sm font-medium ${isSelected ? 'text-primary-900 dark:text-white' : 'text-gray-900 dark:text-gray-100'}`}
                          title={item.label}
                        >
                          {item.label}
                        </span>
                      )}
                    </div>
                    {hubUrl && !renderLabel && (
                      <a
                        href={hubUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="hover:text-primary-600 dark:hover:text-primary-400 ml-1 flex-shrink-0 p-1 text-gray-400 transition-colors"
                        title={t('components.statCard.viewOnHub')}
                      >
                        <ExternalLink size={12} />
                      </a>
                    )}
                  </div>
                  <div className="ml-2 flex flex-shrink-0 flex-col items-end">
                    <span
                      className={`text-sm font-bold ${
                        isSelected
                          ? 'text-primary-800 dark:text-primary-100'
                          : 'text-gray-900 dark:text-white'
                      }`}
                    >
                      {item.count.toLocaleString()}
                    </span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">{percent}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
