import { useState } from 'react';
import { Landing } from './components/Landing';
import { Wizard } from './components/Wizard';
import { Dashboard } from './components/Dashboard';
import { Help } from './components/Help';
import { useStore } from './state/store';

type View = 'landing' | 'wizard' | 'dashboard' | 'help';

export default function App() {
  const store = useStore();
  const [view, setView] = useState<View>(store.profile ? 'dashboard' : 'landing');

  const home: View = store.profile ? 'dashboard' : 'landing';

  return (
    <div className="app">
      {view === 'landing' && (
        <Landing onStart={() => setView('wizard')} onHelp={() => setView('help')} />
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
          />
        ) : (
          <Landing onStart={() => setView('wizard')} onHelp={() => setView('help')} />
        ))}
      {view === 'help' && (
        <Help
          onBack={() => setView(home)}
          backLabel={home === 'dashboard' ? 'Back to my plan' : 'Back'}
        />
      )}
    </div>
  );
}
