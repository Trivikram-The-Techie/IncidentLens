import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_FILE = path.join(__dirname, '..', '..', 'data', 'firestore-incidents.json');

// Ensure data directory exists
const dataDir = path.dirname(DB_FILE);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

export class FirestoreStore {
  constructor() {
    this.incidents = new Map();
    this.auditLogs = [];
    this.loadFromDisk();
  }

  loadFromDisk() {
    try {
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf8');
        const data = JSON.parse(raw);
        if (data.incidents && Array.isArray(data.incidents)) {
          data.incidents.forEach((inc) => this.incidents.set(inc.id, inc));
        }
        if (data.auditLogs && Array.isArray(data.auditLogs)) {
          this.auditLogs = data.auditLogs;
        }
      }
    } catch (err) {
      console.warn('[FirestoreStore] Could not load persisted data:', err.message);
    }
  }

  saveToDisk() {
    try {
      const payload = {
        incidents: Array.from(this.incidents.values()),
        auditLogs: this.auditLogs,
        updatedAt: new Date().toISOString(),
      };
      fs.writeFileSync(DB_FILE, JSON.stringify(payload, null, 2), 'utf8');
    } catch (err) {
      console.warn('[FirestoreStore] Could not persist to disk:', err.message);
    }
  }

  async saveIncident(incident) {
    if (!incident.id) {
      incident.id = `INC-${Date.now().toString().slice(-6)}`;
    }
    incident.updatedAt = new Date().toISOString();
    if (!incident.createdAt) {
      incident.createdAt = incident.updatedAt;
    }
    if (!incident.timeline) {
      incident.timeline = [];
    }

    this.incidents.set(incident.id, incident);
    this.saveToDisk();
    return incident;
  }

  async getIncident(id) {
    return this.incidents.get(id) || null;
  }

  async listIncidents(limit = 20) {
    const all = Array.from(this.incidents.values());
    all.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return all.slice(0, limit);
  }

  async addTimelineEvent(incidentId, eventType, description, metadata = {}) {
    const incident = this.incidents.get(incidentId);
    if (!incident) return null;

    const event = {
      timestamp: new Date().toISOString(),
      type: eventType,
      description,
      metadata,
    };
    incident.timeline.push(event);
    incident.updatedAt = event.timestamp;
    this.saveToDisk();
    return event;
  }

  async updateStatus(incidentId, newStatus, resolutionNotes = null) {
    const incident = this.incidents.get(incidentId);
    if (!incident) return null;

    incident.status = newStatus;
    if (resolutionNotes) {
      incident.resolutionNotes = resolutionNotes;
    }
    if (newStatus === 'RESOLVED') {
      incident.resolvedAt = new Date().toISOString();
      const start = new Date(incident.createdAt).getTime();
      const end = new Date(incident.resolvedAt).getTime();
      incident.timeToMitigateSeconds = Math.round((end - start) / 1000);
    }
    incident.updatedAt = new Date().toISOString();
    this.saveToDisk();
    return incident;
  }

  async recordApprovalAudit(incidentId, approvedBy, action, details = {}) {
    const audit = {
      id: `AUDIT-${Date.now().toString().slice(-6)}`,
      timestamp: new Date().toISOString(),
      incidentId,
      approvedBy,
      action,
      details,
    };
    this.auditLogs.unshift(audit);
    this.saveToDisk();
    return audit;
  }

  async getAuditLogs(incidentId = null) {
    if (incidentId) {
      return this.auditLogs.filter((a) => a.incidentId === incidentId);
    }
    return this.auditLogs;
  }
}

export const firestoreStore = new FirestoreStore();
