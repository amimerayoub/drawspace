import { adminService } from '@/services';
import { useI18n } from '@/i18n/I18nContext';
import type { AdPlacement } from '@/types';

export function AdSlot({ placement }: { placement: AdPlacement }) {
  const { t } = useI18n();
  const ad = adminService.activeAd(placement);
  if (!ad) return null;
  return (
    <aside className="ad-slot" aria-label={t('ad.label')}>
      <span className="ad-label">{t('ad.label')}</span>
      <div className="ad-body">
        <span className="ad-name">{ad.name}</span>
      </div>
    </aside>
  );
}