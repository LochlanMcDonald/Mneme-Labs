import { useEffect, useState } from 'react';
import { Landing } from './components/Landing';
import { Wizard } from './components/Wizard';
import { Dashboard } from './components/Dashboard';
import { Help } from './components/Help';
import { Report } from './components/Report';
import { Advisor } from './components/Advisor';
import { Privacy, Terms } from './components/Legal';
import { useStore } from './state/store';

type View = 'landing' | 'wizard' | 'dashboard' | 'help' | 'report' | 'advisor' | 'terms' | 'privacy';

/** Views that are directly linkable via the URL hash (#/terms etc.). */
const HASH_VIEWS: Record<string, View> = {
  '#/terms': 'terms',
  '#/privacy': 'privacy',
  '#/help': 'help',
};

function initialView(hasProfile: boolean): View {
  const fromHash = HASH_VIEWS[window.location.hash];
  if (fromHash) return fromHash;
  return hasProfile ? 'dashboard' : 'landing';
}

export default function App() {
  const store = useStore();
  const [view, setViewRaw] = useState<View>(() => initialView(store.profile !== null));

  const setView = (v: View) => {
    const hash = Object.entries(HASH_VIEWS).find(([, view]) => view === v)?.[0] ?? '';
    if (hash) {
      window.location.hash = hash;
    } else if (window.location.hash) {
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }
    setViewRaw(v);
  };

  // Follow hash changes (back/forward buttons, pasted #/terms links).
  useEffect(() => {
    const onHash = () => {
      const v = HASH_VIEWS[window.location.hash];
      if (v) setViewRaw(v);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // When a signed-in user's saved plan arrives from their account, take
  // them straight to it (unless they are mid-wizard or reading another page).
  useEffect(() => {
    if (store.profile && view === 'landing') {
      setViewRaw('dashboard');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.profile]);

  const home: View = store.profile ? 'dashboard' : 'landing';
  const goHome = () => setView(home);

  return (
    <div className="app">
      {view === 'landing' && (
        <Landing
          onStart={() => setView('wizard')}
          onHelp={() => setView('help')}
          onTerms={() => setView('terms')}
          onPrivacy={() => setView('privacy')}
          auth={store.auth}
          sync={store.sync}
        />
      )}
      {view === 'wizard' && (
        <Wizard
          initial={store.profile}
          onCancel={store.profile ? () => setView('dashboard') : null}
          onComplete={(profile) => {
            store.generate(profile);
            setView('dashboard');
          }}
        />
      )}
      {view === 'dashboard' &&
        (store.profile ? (
          <Dashboard
            store={store}
            onEditProfile={() => setView('wizard')}
            onHelp={() => setView('help')}
            onReport={() => setView('report')}
            onAdvisor={() => setView('advisor')}
          />
        ) : (
          <Landing
            onStart={() => setView('wizard')}
            onHelp={() => setView('help')}
            onTerms={() => setView('terms')}
            onPrivacy={() => setView('privacy')}
            auth={store.auth}
            sync={store.sync}
          />
        ))}
      {view === 'help' && (
        <Help onBack={goHome} backLabel={home === 'dashboard' ? 'Back to my plan' : 'Back'} />
      )}
      {view === 'report' && <Report store={store} onBack={goHome} />}
      {view === 'advisor' && <Advisor store={store} onBack={goHome} />}
      {view === 'terms' && <Terms onBack={goHome} />}
      {view === 'privacy' && <Privacy onBack={goHome} />}
    </div>
  );
}
