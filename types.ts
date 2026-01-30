
export interface LocationPoint {
  latitude: number;
  longitude: number;
  timestamp: number;
  speed: number | null;
}

export enum TripCategory {
  BUSINESS = 'Business',
  PERSONAL = 'Personal',
  UNCATEGORIZED = 'Uncategorized'
}

export interface Trip {
  id: string;
  startTime: number;
  endTime: number | null;
  startLocation: LocationPoint | null;
  endLocation: LocationPoint | null;
  distance: number; // in kilometers
  category: TripCategory;
  purpose: string;
  path: LocationPoint[];
  month: string; // YYYY-MM for filtering
}

export interface UserSettings {
  ratePerKm: number;
  currency: string;
  reportEmail: string;
  autoTracking: boolean;
  minStartSpeed: number; // km/h
  stopTimeoutMinutes: number;
}
