import { useState } from 'react';

import { getMetaValueItems, type DisplayMetadataEntry } from '../lib/alertMetadata';
import { useI18n } from '../lib/i18n';

interface ContextSummaryProps {
  entries: DisplayMetadataEntry[];
}

export function ContextSummary({ entries }: ContextSummaryProps) {
  const { t } = useI18n();
  const [expandedEntries, setExpandedEntries] = useState<Set<number>>(() => new Set());

  const toggleExpanded = (index: number) => {
    setExpandedEntries((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  return (
    <dl className="divide-y divide-gray-100 overflow-hidden rounded border border-gray-100 bg-gray-50 dark:divide-gray-800 dark:border-gray-800 dark:bg-gray-900/30">
      {entries.map((entry, index) => {
        const valueItems = getMetaValueItems(entry.value);
        const isExpanded = expandedEntries.has(index);
        const visibleItems = valueItems && !isExpanded ? valueItems.slice(0, 5) : valueItems;
        const hiddenCount = valueItems ? Math.max(0, valueItems.length - 5) : 0;
        return (
          <div
            key={`${entry.key}-${index}`}
            className="grid grid-cols-1 sm:grid-cols-[minmax(9rem,12rem)_1fr]"
          >
            <dt className="px-3 py-1.5 text-xs font-semibold break-all text-gray-500 dark:text-gray-400">
              {entry.key}
            </dt>
            <dd className="min-w-0 border-t border-gray-200 bg-white sm:border-t-0 sm:border-l dark:border-gray-800 dark:bg-gray-950">
              {visibleItems ? (
                <div className="h-full divide-y divide-gray-100 overflow-hidden dark:divide-gray-800">
                  {visibleItems.map((item, itemIndex) => (
                    <div
                      key={`${item}-${itemIndex}`}
                      className="px-3 py-1.5 font-mono text-xs leading-4 break-all text-gray-700 dark:text-gray-300"
                    >
                      {item}
                    </div>
                  ))}
                  {hiddenCount > 0 && (
                    <button
                      type="button"
                      onClick={() => toggleExpanded(index)}
                      className="w-full cursor-pointer px-3 py-2 text-left text-xs font-medium text-gray-500 hover:bg-gray-50 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-900 dark:hover:text-gray-200"
                    >
                      {isExpanded
                        ? t('pages.alerts.showFewerContextValues', { count: 5 })
                        : t('pages.alerts.showAllContextValues', {
                            total: hiddenCount + 5,
                            remaining: hiddenCount,
                          })}
                    </button>
                  )}
                </div>
              ) : (
                <span className="block px-3 py-1.5 font-mono text-xs leading-5 break-all text-gray-700 dark:text-gray-200">
                  {entry.formattedValue}
                </span>
              )}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
