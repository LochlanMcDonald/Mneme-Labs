import { useEffect, useState } from 'react';
import { Landing } from './components/Landing';
import { Wizard } from './components/Wizard';
import { Dashboard } from './components/Dashboard';
import { Help } from './components/Help';
import { Report } from './components/Report';
import { Advisor } from './components/Advisor';
import { useStore } from './state/store';

type View = 'landing' | 'wizard' | 'dashboard' | 'help' | 'report' | 'advisor';

export default function App() {
  const store = useStore();
  const [view, setView] = useState<View>(store.profile ? 'dashboard' : 'landing');

  // When a signed-in user's saved plan arrives from their account, take
  // them straight to it (unless they are mid-wizard or reading help).
  useEffect(() => {
    if (store.profile && view === 'landing') {
      setView('dashboard');
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
            auth={store.auth}
            sync={store.sync}
          />
        ))}
      {view === 'help' && (
        <Help onBack={goHome} backLabel={home === 'dashboard' ? 'Back to my plan' : 'Back'} />
      )}
      {view === 'report' && <Report store={store} onBack={goHome} />}
      {view === 'advisor' && <Advisor store={store} onBack={goHome} />}
    </div>
  );
}
