
import React, { useState, useEffect, useRef } from 'react';
import Navigation from './components/Navigation';
import Dashboard from './components/Dashboard';
import TripTracker from './components/TripTracker';
import History from './components/History';
import Reports from './components/Reports';
import { Trip, TripCategory, UserSettings, LocationPoint } from './types';
import { suggestTripPurpose } from './services/geminiService';
import { calculateDistance } from './utils/geoUtils';
import { X, Check, Settings as SettingsIcon, Save } from 'lucide-react';

const STORAGE_KEY = 'taxdrive_data';
const SETTINGS_KEY = 'taxdrive_settings';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [trips, setTrips] = useState<Trip[]>([]);
  const [settings, setSettings] = useState<UserSettings>({
    ratePerKm: 0.67,
    currency: '$',
    reportEmail: '',
    autoTracking: true,
    minStartSpeed: 10,
    stopTimeoutMinutes: 5
  });

  const [isTracking, setIsTracking] = useState(false);
  const [currentTrip, setCurrentTrip] = useState<Partial<Trip> | null>(null);
  const [currentSpeed, setCurrentSpeed] = useState(0);
  const [editingTrip, setEditingTrip] = useState<Trip | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  const watchId = useRef<number | null>(null);
  const lastMoveTime = useRef<number>(Date.now());

  // Load persistence
  useEffect(() => {
    const savedTrips = localStorage.getItem(STORAGE_KEY);
    const savedSettings = localStorage.getItem(SETTINGS_KEY);
    if (savedTrips) setTrips(JSON.parse(savedTrips));
    if (savedSettings) setSettings(JSON.parse(savedSettings));
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trips));
  }, [trips]);

  useEffect(() => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }, [settings]);

  // Main background monitoring loop
  useEffect(() => {
    if (!navigator.geolocation) return;

    watchId.current = navigator.geolocation.watchPosition(
      (position) => {
        const speedKmh = (position.coords.speed || 0) * 3.6;
        setCurrentSpeed(position.coords.speed || 0);

        const point: LocationPoint = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          timestamp: position.timestamp,
          speed: position.coords.speed,
        };

        if (speedKmh > settings.minStartSpeed && !isTracking && settings.autoTracking) {
          startTrip(point);
        } else if (isTracking) {
          updateTrip(point, speedKmh);
        }
      },
      (err) => console.error(err),
      { enableHighAccuracy: true, maximumAge: 0 }
    );

    return () => {
      if (watchId.current) navigator.geolocation.clearWatch(watchId.current);
    };
  }, [isTracking, settings.autoTracking]);

  const startTrip = (startPoint: LocationPoint) => {
    const newTrip: Partial<Trip> = {
      id: Math.random().toString(36).substr(2, 9),
      startTime: Date.now(),
      distance: 0,
      path: [startPoint],
      category: TripCategory.UNCATEGORIZED,
      purpose: '',
      startLocation: startPoint
    };
    setCurrentTrip(newTrip);
    setIsTracking(true);
    lastMoveTime.current = Date.now();
  };

  const updateTrip = (point: LocationPoint, speed: number) => {
    if (speed > 2) lastMoveTime.current = Date.now();

    // Check for auto-stop timeout
    const inactiveMinutes = (Date.now() - lastMoveTime.current) / 60000;
    if (inactiveMinutes >= settings.stopTimeoutMinutes) {
      finalizeTrip();
      return;
    }

    setCurrentTrip(prev => {
      if (!prev) return null;
      const lastPoint = prev.path![prev.path!.length - 1];
      const dist = calculateDistance(lastPoint.latitude, lastPoint.longitude, point.latitude, point.longitude);
      return {
        ...prev,
        distance: (prev.distance || 0) + dist,
        path: [...prev.path!, point]
      };
    });
  };

  const finalizeTrip = async () => {
    if (!currentTrip) return;
    const final: Trip = {
      ...(currentTrip as Trip),
      endTime: Date.now(),
      endLocation: currentTrip.path![currentTrip.path!.length - 1],
      category: TripCategory.BUSINESS,
      month: new Date().toISOString().substring(0, 7)
    };

    setIsTracking(false);
    setCurrentTrip(null);

    // Get AI suggestion for purpose
    const purpose = await suggestTripPurpose(final);
    setEditingTrip({ ...final, purpose });
  };

  const saveTripEdit = () => {
    if (editingTrip) {
      setTrips(prev => [editingTrip, ...prev]);
      setEditingTrip(null);
    }
  };

  const renderTab = () => {
    switch (activeTab) {
      case 'dashboard': return <Dashboard trips={trips} settings={settings} isTracking={isTracking} currentSpeed={currentSpeed} />;
      case 'tracker': return <TripTracker onTripEnd={finalizeTrip} />;
      case 'history': return <History trips={trips} onTripClick={setEditingTrip} />;
      case 'reports': return <Reports trips={trips} settings={settings} />;
      default: return null;
    }
  };

  return (
    <div className="max-w-md mx-auto min-h-screen bg-[#f9fafb] relative pb-20">
      <div className="absolute top-4 right-4 z-50">
        <button 
          onClick={() => setShowSettings(true)}
          className="p-3 bg-white/80 backdrop-blur rounded-full shadow-sm border border-gray-100 text-gray-500 active:scale-95 transition-all"
        >
          <SettingsIcon size={20} />
        </button>
      </div>

      {renderTab()}
      <Navigation activeTab={activeTab} setActiveTab={setActiveTab} />

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/60 z-[200] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white w-full max-w-sm rounded-3xl p-6 space-y-6 shadow-2xl animate-in zoom-in duration-300">
            <div className="flex justify-between items-center">
              <h3 className="text-xl font-bold">Settings</h3>
              <button onClick={() => setShowSettings(false)} className="p-2 bg-gray-50 rounded-full"><X size={20} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-2">Gmail Recipient</label>
                <input 
                  type="email" 
                  value={settings.reportEmail}
                  onChange={e => setSettings({...settings, reportEmail: e.target.value})}
                  className="w-full p-4 bg-gray-50 rounded-2xl border border-gray-100 outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="yourname@gmail.com"
                />
              </div>
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl">
                <div>
                  <p className="font-bold text-sm">Auto Detection</p>
                  <p className="text-[10px] text-gray-400">Starts trip when moving >10km/h</p>
                </div>
                <button 
                  onClick={() => setSettings({...settings, autoTracking: !settings.autoTracking})}
                  className={`w-12 h-6 rounded-full transition-colors ${settings.autoTracking ? 'bg-blue-600' : 'bg-gray-300'} flex items-center px-1`}
                >
                  <div className={`w-4 h-4 bg-white rounded-full transform transition-transform ${settings.autoTracking ? 'translate-x-6' : ''}`} />
                </button>
              </div>
            </div>
            <button 
              onClick={() => setShowSettings(false)}
              className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold flex items-center justify-center gap-2"
            >
              <Save size={18} /> Save Settings
            </button>
          </div>
        </div>
      )}

      {/* Trip Finalization Modal */}
      {editingTrip && (
        <div className="fixed inset-0 bg-black/50 z-[100] flex items-end justify-center p-4 backdrop-blur-sm">
          <div className="bg-white w-full max-w-sm rounded-3xl p-6 space-y-6 shadow-2xl animate-in slide-in-from-bottom-10 duration-500">
            <div className="flex justify-between items-center">
              <h3 className="text-xl font-bold text-gray-900">Finalize Trip</h3>
              <button onClick={() => setEditingTrip(null)} className="p-2 hover:bg-gray-100 rounded-full transition-colors"><X size={20} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-1">Purpose (AI Suggested)</label>
                <input
                  type="text"
                  value={editingTrip.purpose}
                  onChange={(e) => setEditingTrip({ ...editingTrip, purpose: e.target.value })}
                  className="w-full p-4 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <div className="flex gap-2">
                {[TripCategory.BUSINESS, TripCategory.PERSONAL].map(cat => (
                  <button
                    key={cat}
                    onClick={() => setEditingTrip({...editingTrip, category: cat})}
                    className={`flex-1 py-3 rounded-xl border-2 font-bold text-sm transition-all ${editingTrip.category === cat ? 'border-blue-600 bg-blue-50 text-blue-600' : 'border-gray-100 text-gray-400'}`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
              <div className="bg-gray-50 p-4 rounded-2xl text-center">
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Distance</p>
                <p className="text-2xl font-black text-gray-900">{editingTrip.distance.toFixed(2)} km</p>
              </div>
            </div>
            <button
              onClick={saveTripEdit}
              className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold shadow-lg shadow-blue-200 flex items-center justify-center gap-2"
            >
              <Check size={20} /> Save to Logbook
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
