import type { DisplayMetadataEntry } from '../lib/alertMetadata';

interface MetadataTableProps {
  entries: DisplayMetadataEntry[];
}

export function MetadataTable({ entries }: MetadataTableProps) {
  return (
    <div className="divide-y divide-gray-100 rounded border border-gray-200 bg-white dark:divide-gray-800 dark:border-gray-800 dark:bg-gray-950">
      {entries.map((entry, index) => (
        <div
          key={`${entry.key}-${index}`}
          className="grid grid-cols-[minmax(100px,auto)_1fr] gap-3 px-3 py-1.5 text-xs"
        >
          <span className="font-medium break-all text-gray-500">{entry.key}</span>
          <span className="font-mono break-all text-gray-700 dark:text-gray-300">
            {entry.formattedValue}
          </span>
        </div>
      ))}
    </div>
  );
}
