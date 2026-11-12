import { useI18n } from '@/i18n/I18nContext';
import { SeoHead } from '@/components/SeoHead';

export default function Legal({ kind }: { kind: 'terms' | 'privacy' }) {
  const { t } = useI18n();
  const title = kind === 'terms' ? t('landing.terms') : t('landing.privacy');

  const sections: { heading: string; body: string }[] = kind === 'terms'
    ? [
        { heading: 'Using DrawSpace', body: 'DrawSpace is a free drawing and guessing game. Be respectful in chat and drawings. Do not share personal information in public rooms.' },
        { heading: 'Accounts', body: 'You can play as a guest. Accounts keep your XP and match history. Usernames must not impersonate others or contain offensive language.' },
        { heading: 'Fair play', body: 'Do not write the word while drawing, share answers in chat, or use automated tools to guess. Moderators may suspend accounts that break room rules.' },
        { heading: 'Content', body: 'Drawings and chat messages are visible to other players in the room. Report anything inappropriate with the report button. Reports are reviewed by moderators.' },
        { heading: 'This demo', body: 'This is a frontend demonstration. Data is stored locally in your browser and no real account, payment, or messaging service is connected.' },
      ]
    : [
        { heading: 'What is stored', body: 'In this demonstration, your username, avatar choice, theme, language, and game progress are stored only in your browser using local storage.' },
        { heading: 'What is not collected', body: 'No analytics, tracking cookies, or advertising identifiers are collected by this frontend demo. Ad placements are visual placeholders managed from the admin interface.' },
        { heading: 'Clearing your data', body: 'Clearing your browser site data removes your guest session, preferences, and locally stored progress.' },
        { heading: 'Contact', body: 'Questions about privacy can be sent to privacy@drawspace.cloud.' },
      ];

  return (
    <div className="page">
      <SeoHead title={`${title} · DrawSpace`} />
      <div className="container container-narrow">
        <div className="page-head">
          <h1 className="page-title">{title}</h1>
        </div>
        <div className="panel panel-pad legal-body">
          {sections.map((s) => (
            <section key={s.heading} className="legal-section">
              <h2 className="legal-heading">{s.heading}</h2>
              <p className="muted">{s.body}</p>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
