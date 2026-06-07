import { useI18n } from '../i18n';
import './PlaceholderPage.css';

interface PlaceholderPageProps {
  titleKey: string;
  icon: string;
}

export function PlaceholderPage({ titleKey, icon }: PlaceholderPageProps) {
  const { t } = useI18n();

  return (
    <div className="placeholder-page">
      <div className="placeholder-page__content">
        <span className="placeholder-page__icon">{icon}</span>
        <h2 className="placeholder-page__title">{t(titleKey)}</h2>
        <p className="placeholder-page__subtitle">Coming soon — this tab is being migrated.</p>
      </div>
    </div>
  );
}
