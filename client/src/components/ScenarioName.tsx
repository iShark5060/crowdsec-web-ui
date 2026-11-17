import { ExternalLink } from 'lucide-react';

import { useI18n } from '../lib/i18n';
import { getHubUrl } from '../lib/utils';
import { Badge } from './ui/Badge';

interface ScenarioNameProps {
  name?: string | null;
  reason?: string | null;
  showLink?: boolean;
  showReason?: boolean;
  className?: string;
  simulated?: boolean;
  size?: 'sm' | 'lg';
}

export function ScenarioName({
  name,
  reason,
  showLink = false,
  showReason = false,
  className = '',
  simulated = false,
  size = 'sm',
}: ScenarioNameProps) {
  const { t } = useI18n();

  if (!name) return null;

  // Split by first slash
  const firstSlashIndex = name.indexOf('/');
  let namespace = '';
  let shortName = name;

  if (firstSlashIndex !== -1) {
    namespace = name.substring(0, firstSlashIndex); // exclude the slash
    shortName = name.substring(firstSlashIndex + 1);
  }

  const hubUrl = showLink ? getHubUrl(name) : null;

  return (
    <div className={`flex min-w-0 flex-col items-start leading-tight ${className}`}>
      {namespace && (
        <span
          className={`${size === 'lg' ? 'text-sm' : 'text-xs'} max-w-full truncate leading-none font-normal text-gray-500 dark:text-gray-400`}
          title={namespace}
        >
          {namespace}
        </span>
      )}
      <div className="flex w-full min-w-0 items-center gap-1">
        <span
          className={`truncate font-medium text-gray-900 dark:text-gray-100 ${size === 'lg' ? 'text-lg leading-snug' : 'text-sm leading-tight'} min-w-0`}
          title={shortName}
        >
          {shortName}
        </span>
        {showLink && hubUrl && (
          <a
            href={hubUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-primary-600 dark:hover:text-primary-400 flex-shrink-0 text-gray-400 transition-colors"
            title={t('components.statCard.viewOnHub')}
            onClick={(event) => event.stopPropagation()}
          >
            <ExternalLink size={size === 'lg' ? 16 : 14} />
          </a>
        )}
      </div>
      {simulated && (
        <Badge variant="warning" className="mt-1">
          {t('pages.dashboard.simulation')}
        </Badge>
      )}
      {showReason && reason && reason !== name && (
        <span
          className={`${size === 'lg' ? 'text-sm' : 'text-xs'} mt-0.5 max-w-full truncate text-gray-500 dark:text-gray-400`}
          title={reason}
        >
          {reason}
        </span>
      )}
    </div>
  );
}
