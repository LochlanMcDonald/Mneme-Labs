import { useState } from 'react';
import { Landing } from './components/Landing';
import { Wizard } from './components/Wizard';
import { Dashboard } from './components/Dashboard';
import { useStore } from './state/store';

type View = 'landing' | 'wizard' | 'dashboard';

export default function App() {
  const store = useStore();
  const [view, setView] = useState<View>(store.profile ? 'dashboard' : 'landing');

  return (
    <div className="app">
      {view === 'landing' && <Landing onStart={() => setView('wizard')} />}
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
      {view === 'dashboard' && store.profile && (
        <Dashboard store={store} onEditProfile={() => setView('wizard')} />
      )}
      {view === 'dashboard' && !store.profile && <Landing onStart={() => setView('wizard')} />}
    </div>
  );
}
