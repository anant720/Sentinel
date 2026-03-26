export interface Alert {
  id: string;
  type?: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED' | 'DISMISSED';
  title: string;
  description: string;
  organization_id: string;
  entity?: string;
  evidence?: any;
  resolution_note?: string;
  created_at: string;
  resolved_at?: string;
  acknowledged_at?: string;
  is_e2ee?: boolean;
}

export interface User {
  id: string;
  email: string;
  name: string;
  full_name?: string;
  role: 'org_admin' | 'security_analyst' | 'viewer';
  organization_id: string;
  organization?: { name: string; slug: string; };
  is_active?: boolean;
  e2ee_enabled?: boolean;
  last_seen_at?: string;
  presence?: 'online' | 'away' | 'offline';
  created_at?: string;
}

export interface SecurityEvent {
  id: string;
  event_type: string;
  type?: string;
  payload: {
    email?: string;
    user_email?: string;
    ip_address?: string;
    user_agent?: string;
    source_app?: string;
    destination?: string;
    risk_score?: number;
    [key: string]: any;
  };
  risk_score?: number;
  device_id?: string;
  ip_address?: string;
  geo_country?: string;
  geo_city?: string;
  email?: string;
  employee_name?: string;
  user_agent?: string;
  source_app?: string;
  created_at: string;
  organization_id?: string;
}

export interface ApiKey {
  id: string;
  key_prefix: string;
  is_active: boolean;
  rate_limit_per_minute: number;
  created_at: string;
  last_used_at?: string;
}

export interface Notification {
  id: string;
  title: string;
  message: string;
  is_read: boolean;
  alert_id?: string;
  created_at: string;
}

export interface OrgSettings {
  [moduleId: string]: {
    enabled: boolean;
    threshold?: number;
    window?: number;
    config?: string;
    is_e2ee?: boolean;
    [key: string]: any;
  };
}

export interface RiskDataPoint {
  score: number;
  timestamp: number;
}

export interface AuditLog {
  id: string;
  actor_email?: string;
  action: string;
  resource?: string;
  metadata?: any;
  created_at: string;
  is_e2ee?: boolean;
}

export interface Invitation {
  id: string;
  email: string;
  role: string;
  is_used: boolean;
  expires_at: string;
  created_at: string;
}

export interface DashboardStats {
  total_events: number;
  active_alerts: number;
  risk_score: number;
  enrolled_devices?: number;
  [key: string]: any;
}
