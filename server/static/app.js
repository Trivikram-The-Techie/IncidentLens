// IncidentLens Frontend Application Logic

let currentIncident = null;
let currentEvidence = null;
let currentDiagnosis = null;
let activeRevision = 'order-checkout-service-00001-v100';
let hudInterval = null;
let hudStartTime = 0;

// DOM Elements
const activeRevTag = document.getElementById('activeRevTag');
const metricErrorRate = document.getElementById('metricErrorRate');
const barErrorRate = document.getElementById('barErrorRate');
const badgeErrorRate = document.getElementById('badgeErrorRate');
const metricLatency = document.getElementById('metricLatency');
const barLatency = document.getElementById('barLatency');
const metricRevisionId = document.getElementById('metricRevisionId');
const metricRevisionAuthor = document.getElementById('metricRevisionAuthor');
const cardErrorRate = document.getElementById('cardErrorRate');

const hudTimer = document.getElementById('hudTimer');
const stepAlert = document.getElementById('stepAlert');
const stepEvidence = document.getElementById('stepEvidence');
const stepGemini = document.getElementById('stepGemini');
const stepSlack = document.getElementById('stepSlack');
const stepRollback = document.getElementById('stepRollback');

const btnBreakApp = document.getElementById('btnBreakApp');
const btnRun30sDemo = document.getElementById('btnRun30sDemo');
const btnHealApp = document.getElementById('btnHealApp');
const btnSettings = document.getElementById('btnSettings');

const diagnosisEmpty = document.getElementById('diagnosisEmpty');
const diagnosisPopulated = document.getElementById('diagnosisPopulated');
const diagSev = document.getElementById('diagSev');
const diagHeadline = document.getElementById('diagHeadline');
const diagConfidence = document.getElementById('diagConfidence');
const diagHypothesis = document.getElementById('diagHypothesis');
const diagSuspectHash = document.getElementById('diagSuspectHash');
const diagSuspectAuthor = document.getElementById('diagSuspectAuthor');
const diagSuspectMsg = document.getElementById('diagSuspectMsg');
const diagBugDesc = document.getElementById('diagBugDesc');
const diagRunbook = document.getElementById('diagRunbook');
const diagAiModel = document.getElementById('diagAiModel');
const diagTime = document.getElementById('diagTime');
const incidentIdBadge = document.getElementById('incidentIdBadge');

const logsContainer = document.getElementById('logsContainer');
const timelineFeed = document.getElementById('timelineFeed');
const postmortemBox = document.getElementById('postmortemBox');
const slackFeed = document.getElementById('slackFeed');

const approvalModal = document.getElementById('approvalModal');
const modalIncidentId = document.getElementById('modalIncidentId');
const modalTargetRev = document.getElementById('modalTargetRev');
const modalTargetVer = document.getElementById('modalTargetVer');
const inputApprover = document.getElementById('inputApprover');
const inputReason = document.getElementById('inputReason');
const btnCancelApproval = document.getElementById('btnCancelApproval');
const btnConfirmRollback = document.getElementById('btnConfirmRollback');

const settingsModal = document.getElementById('settingsModal');
const btnCloseSettings = document.getElementById('btnCloseSettings');
const btnSaveSettings = document.getElementById('btnSaveSettings');
const inputGeminiKey = document.getElementById('inputGeminiKey');
const inputSlackUrl = document.getElementById('inputSlackUrl');
const inputGcpProject = document.getElementById('inputGcpProject');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  setupTabs();
  setupEventListeners();
  initSSE();
  fetchStatus();
  fetchSlackMessages();
  setInterval(fetchStatus, 3000);
});

// Setup Panel Tabs
function setupTabs() {
  const tabs = document.querySelectorAll('.tab-btn');
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((t) => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach((c) => c.classList.remove('active'));
      tab.classList.add('active');
      const targetId = tab.dataset.tab;
      document.getElementById(targetId)?.classList.add('active');
    });
  });
}

// Setup Event Listeners
function setupEventListeners() {
  btnBreakApp.addEventListener('click', () => triggerIncident(false));
  btnRun30sDemo.addEventListener('click', () => triggerIncident(true));
  btnHealApp.addEventListener('click', restoreHealthyService);

  btnSettings.addEventListener('click', () => {
    loadSettings();
    settingsModal.classList.remove('hidden');
  });
  btnCloseSettings.addEventListener('click', () => settingsModal.classList.add('hidden'));
  btnSaveSettings.addEventListener('click', saveSettings);

  btnCancelApproval.addEventListener('click', () => approvalModal.classList.add('hidden'));
  btnConfirmRollback.addEventListener('click', submitApproval);
}

// Timer HUD
function startTimerHUD() {
  clearInterval(hudInterval);
  hudStartTime = Date.now();
  resetPipelineSteps();
  hudInterval = setInterval(() => {
    const elapsed = Date.now() - hudStartTime;
    const s = Math.floor(elapsed / 1000);
    const ms = Math.floor((elapsed % 1000) / 100);
    hudTimer.textContent = `${s.toString().padStart(2, '0')}:${ms}.0`;
  }, 100);
}

function stopTimerHUD() {
  clearInterval(hudInterval);
}

function resetPipelineSteps() {
  [stepAlert, stepEvidence, stepGemini, stepSlack, stepRollback].forEach((step) => {
    step.className = 'step-card';
    step.querySelector('.step-status').textContent = 'WAITING';
  });
}

function setStepActive(stepElem, statusText = 'IN PROGRESS') {
  stepElem.className = 'step-card active';
  stepElem.querySelector('.step-status').textContent = statusText;
}

function setStepCompleted(stepElem, statusText = 'DONE') {
  stepElem.className = 'step-card completed';
  stepElem.querySelector('.step-status').textContent = statusText;
}

// Trigger Outage & Incident Analysis
async function triggerIncident(autoRollback = false) {
  startTimerHUD();
  setStepActive(stepAlert, 'FIRING');

  // Add initial log
  addClientLog('WARN', 'Cloud Monitoring metric run.googleapis.com/request_count exceeded threshold (5%)');

  try {
    const res = await fetch('/api/alerts/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenario: 'bad_deploy_tax_bug' }),
    });

    const data = await res.json();
    if (data.success && data.incident) {
      applyIncidentData(data.incident);

      if (autoRollback) {
        // In full 30s demo mode, auto-prompt and execute rollback after slight pause
        setTimeout(() => {
          showApprovalModal(data.incident);
          setTimeout(() => {
            submitApproval();
          }, 3500);
        }, 3000);
      }
    }
  } catch (err) {
    console.error('Failed to trigger incident:', err);
    stopTimerHUD();
  }
}

// Apply Incident Data to UI
function applyIncidentData(incident) {
  currentIncident = incident;
  currentEvidence = incident.evidence;
  currentDiagnosis = incident.diagnosis;

  // Pipeline HUD update
  setStepCompleted(stepAlert, 'INGESTED');
  setStepCompleted(stepEvidence, `${evidenceDuration(incident.evidence)}s`);
  setStepCompleted(stepGemini, 'DIAGNOSED');
  setStepCompleted(stepSlack, 'CARD POSTED');
  setStepActive(stepRollback, 'AWAITING APPROVAL');

  // Badge
  incidentIdBadge.textContent = incident.id;
  incidentIdBadge.className = 'badge badge-red';

  // Diagnosis Card
  if (incident.diagnosis) {
    const d = incident.diagnosis;
    diagnosisEmpty.classList.add('hidden');
    diagnosisPopulated.classList.remove('hidden');

    diagSev.textContent = d.severity || 'SEV-1';
    diagHeadline.textContent = d.incidentHeadline || incident.title;
    diagConfidence.textContent = `Confidence: ${d.confidenceScore || 98}%`;
    diagHypothesis.textContent = d.rootCauseHypothesis || 'Analyzing...';

    if (d.primarySuspect) {
      diagSuspectHash.textContent = d.primarySuspect.commitHash || '4f9a2b8';
      diagSuspectAuthor.textContent = d.primarySuspect.author || 'alex.chen@enterprise.com';
      diagSuspectMsg.textContent = d.primarySuspect.message || 'Tax engine update';
      diagBugDesc.textContent = d.primarySuspect.bugExplanation || '';
    }

    if (d.runbookSteps) {
      diagRunbook.innerHTML = d.runbookSteps.map((s) => `<li>${s}</li>`).join('');
    }

    diagAiModel.textContent = d.aiModel || 'Gemini 3.8 Flash';
    diagTime.textContent = new Date(d.analyzedAt || Date.now()).toLocaleTimeString();
  }

  // Update Logs Tab
  fetchLogs();

  // Update Timeline Tab
  renderTimeline(incident.timeline || []);

  // Update Slack Messages
  fetchSlackMessages();

  // Generate Post-Mortem
  fetchPostMortem(incident.id);
}

function evidenceDuration(evidence) {
  if (evidence && evidence.collectionDurationMs) {
    return (evidence.collectionDurationMs / 1000).toFixed(1);
  }
  return '1.8';
}

// Fetch Status & Metrics
async function fetchStatus() {
  try {
    const [metricsRes, revRes] = await Promise.all([
      fetch('/api/sample-app/metrics'),
      fetch('/api/sample-app/revisions'),
    ]);

    const metrics = await metricsRes.json();
    const revs = await revRes.json();

    // Update Error Rate
    const errorRate = metrics.errorRate || 0;
    metricErrorRate.textContent = `${errorRate.toFixed(1)}%`;
    barErrorRate.style.width = `${Math.min(100, errorRate)}%`;

    if (errorRate > 5) {
      badgeErrorRate.textContent = `${errorRate.toFixed(1)}% CRITICAL`;
      badgeErrorRate.className = 'metric-badge badge-red';
      cardErrorRate.classList.add('breached');
      barErrorRate.className = 'metric-bar-fill danger';
    } else {
      badgeErrorRate.textContent = '0.0% Normal';
      badgeErrorRate.className = 'metric-badge badge-green';
      cardErrorRate.classList.remove('breached');
      barErrorRate.className = 'metric-bar-fill';
    }

    // Update Latency
    metricLatency.textContent = `${metrics.p99LatencyMs || 42} ms`;
    barLatency.style.width = `${Math.min(100, (metrics.p99LatencyMs || 42) / 30)}%`;

    // Update Active Revision Tag
    const active = revs.activeRevision;
    if (active) {
      activeRevision = active.id;
      metricRevisionId.textContent = active.id;
      metricRevisionAuthor.textContent = `Author: ${active.author} | Version: ${active.version}`;

      if (active.version === '1.0.0') {
        activeRevTag.textContent = 'v1.0.0 (Healthy)';
        activeRevTag.className = 'rev-tag rev-good font-mono';
      } else {
        activeRevTag.textContent = `v${active.version} (Crashing)`;
        activeRevTag.className = 'rev-tag rev-bad font-mono';
      }
    }
  } catch (e) {
    // Service offline or restarting
  }
}

// Restore Healthy Revision
async function restoreHealthyService() {
  try {
    const res = await fetch('/api/sample-app/chaos/heal', { method: 'POST' });
    const data = await res.json();
    fetchStatus();
    addClientLog('INFO', 'Healthy revision v1.0.0 restored manually.');
  } catch (e) {
    console.error(e);
  }
}

// Fetch Logs
async function fetchLogs() {
  try {
    const res = await fetch('/api/sample-app/logs?limit=40');
    const data = await res.json();
    if (data.logs) {
      logsContainer.innerHTML = data.logs
        .map((l) => {
          const isErr = l.severity === 'ERROR' || l.severity === 'CRITICAL';
          return `<div class="log-entry ${isErr ? 'log-error' : 'log-info'}">
            [${l.timestamp.slice(11, 19)}] [${l.severity}] ${escapeHtml(l.message)}
          </div>`;
        })
        .join('');
      logsContainer.scrollTop = 0;
    }
  } catch (e) {
    console.error(e);
  }
}

function addClientLog(sev, msg) {
  const div = document.createElement('div');
  div.className = `log-entry ${sev === 'ERROR' ? 'log-error' : 'log-info'}`;
  div.textContent = `[${new Date().toTimeString().slice(0, 8)}] [${sev}] ${msg}`;
  logsContainer.prepend(div);
}

// Render Timeline
function renderTimeline(timeline) {
  timelineFeed.innerHTML = timeline
    .map(
      (t) => `
    <div class="timeline-item">
      <div class="t-dot"></div>
      <div class="t-body">
        <div class="t-time font-mono">${new Date(t.timestamp).toLocaleTimeString()}</div>
        <div class="t-text"><strong>${t.type}:</strong> ${escapeHtml(t.description)}</div>
      </div>
    </div>
  `
    )
    .join('');
}

// Fetch Post-Mortem
async function fetchPostMortem(id) {
  try {
    const res = await fetch(`/api/incidents/${id}/postmortem`);
    const md = await res.text();
    postmortemBox.textContent = md;
  } catch (e) {
    console.error(e);
  }
}

// Fetch Slack Messages & Render in Slack Simulator
async function fetchSlackMessages() {
  try {
    const res = await fetch('/api/slack/messages');
    const data = await res.json();
    if (data.messages && data.messages.length > 0) {
      renderSlackMessages(data.messages);
    }
  } catch (e) {
    console.error(e);
  }
}

function renderSlackMessages(messages) {
  slackFeed.innerHTML = messages
    .map((msg) => {
      const isResolution = msg.blocks?.some((b) => b.text?.text?.includes('RESOLVED'));
      const cardHtml = renderSlackBlocks(msg.blocks, isResolution);

      return `
        <div class="slack-msg-group">
          <div class="slack-avatar ${isResolution ? 'badge-green' : 'bot-avatar'}">
            ${isResolution ? '✅' : '🤖'}
          </div>
          <div class="slack-msg-body">
            <div class="slack-sender font-mono">
              <strong>IncidentLens Copilot</strong> <span class="app-badge">APP</span> 
              <span class="msg-ts">${msg.sentAt ? new Date(msg.sentAt).toLocaleTimeString() : '3:15 AM'}</span>
            </div>
            ${cardHtml}
          </div>
        </div>
      `;
    })
    .join('');

  slackFeed.scrollTop = slackFeed.scrollHeight;
}

function renderSlackBlocks(blocks = [], isResolution = false) {
  if (!blocks || blocks.length === 0) return '';

  let html = `<div class="slack-block-card">`;

  blocks.forEach((b) => {
    if (b.type === 'header') {
      html += `<div class="slack-block-header">${escapeHtml(b.text.text)}</div>`;
    } else if (b.type === 'section' && b.fields) {
      html += `<div class="slack-block-fields">`;
      b.fields.forEach((f) => {
        html += `<div>${formatSlackMrkdwn(f.text)}</div>`;
      });
      html += `</div>`;
    } else if (b.type === 'section' && b.text) {
      const text = b.text.text;
      if (text.includes('Gemini on Vertex AI')) {
        html += `<div class="slack-block-quote">${formatSlackMrkdwn(text)}</div>`;
      } else if (text.includes('Suspected Breaking Code')) {
        const codeMatch = text.match(/```([\s\S]*?)```/);
        const code = codeMatch ? codeMatch[1] : '';
        html += `<div>${formatSlackMrkdwn(text.split('```')[0])}</div>`;
        html += `<pre class="slack-code-diff font-mono"><code>${escapeHtml(code)}</code></pre>`;
      } else {
        html += `<div class="slack-text">${formatSlackMrkdwn(text)}</div>`;
      }
    } else if (b.type === 'actions') {
      html += `<div class="slack-actions-bar">`;
      b.elements.forEach((btn) => {
        const isDanger = btn.style === 'danger';
        const isPrimary = btn.style === 'primary';
        const btnClass = isDanger ? 'slack-btn-danger' : isPrimary ? 'slack-btn-primary' : 'slack-btn-secondary';

        html += `
          <button class="slack-btn ${btnClass}" 
                  onclick="handleSlackButtonClick('${btn.action_id}', '${escapeAttr(btn.value)}')">
            ${escapeHtml(btn.text.text)}
          </button>
        `;
      });
      html += `</div>`;
    }
  });

  html += `</div>`;
  return html;
}

function formatSlackMrkdwn(text) {
  if (!text) return '';
  return text
    .replace(/\*(.*?)\*/g, '<strong>$1</strong>')
    .replace(/`(.*?)`/g, '<code class="font-mono">$1</code>')
    .replace(/\n/g, '<br/>');
}

// Handle Slack Buttons
window.handleSlackButtonClick = function (actionId, valStr) {
  if (actionId === 'approve_rollback') {
    let parsed = {};
    try {
      parsed = JSON.parse(valStr);
    } catch (e) {
      parsed = { incidentId: currentIncident?.id };
    }
    showApprovalModal(parsed);
  } else if (actionId === 'view_evidence') {
    document.querySelector('.tab-btn[data-tab="tab-logs"]').click();
  } else if (actionId === 'acknowledge_alert') {
    fetch('/api/slack/actions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: { action_id: 'acknowledge_alert' },
        incidentId: currentIncident?.id,
      }),
    });
  }
};

// Approval Modal Logic
function showApprovalModal(data) {
  modalIncidentId.textContent = data.incidentId || currentIncident?.id || 'INC-123456';
  modalTargetRev.textContent = data.targetRevision || 'order-checkout-service-00001-v100';
  modalTargetVer.textContent = data.version || '1.0.0 (Known Good)';
  approvalModal.classList.remove('hidden');
}

async function submitApproval() {
  const incId = modalIncidentId.textContent;
  const targetRev = modalTargetRev.textContent;
  const approvedBy = inputApprover.value || 'Alex Chen (On-Call Lead)';
  const reason = inputReason.value || 'Authorized rollback';

  approvalModal.classList.add('hidden');
  setStepActive(stepRollback, 'EXECUTING...');

  try {
    const res = await fetch(`/api/incidents/${incId}/approve-rollback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        approvedBy,
        targetRevision: targetRev,
        reason,
      }),
    });

    const data = await res.json();
    if (data.success) {
      setStepCompleted(stepRollback, 'MIGRATED (v1.0.0)');
      stopTimerHUD();

      // Refresh status & Slack feed
      fetchStatus();
      fetchSlackMessages();
      fetchLogs();
      fetchPostMortem(incId);

      incidentIdBadge.textContent = `${incId} (RESOLVED)`;
      incidentIdBadge.className = 'badge badge-green';
    }
  } catch (err) {
    console.error('Failed to execute rollback:', err);
  }
}

// Settings Modal
async function loadSettings() {
  try {
    const res = await fetch('/api/config');
    const data = await res.json();
    if (data.hasGeminiKey) {
      inputGeminiKey.placeholder = `Configured: ${data.geminiKeyMasked}`;
    }
    if (data.hasSlackWebhook) {
      inputSlackUrl.placeholder = `Configured: ${data.slackWebhookMasked}`;
    }
    inputGcpProject.value = data.gcpProject || 'incidentlens-prod-gcp';
  } catch (e) {}
}

async function saveSettings() {
  const geminiApiKey = inputGeminiKey.value.trim();
  const slackWebhookUrl = inputSlackUrl.value.trim();
  const gcpProjectId = inputGcpProject.value.trim();

  const payload = { gcpProjectId };
  if (geminiApiKey) payload.geminiApiKey = geminiApiKey;
  if (slackWebhookUrl) payload.slackWebhookUrl = slackWebhookUrl;

  try {
    await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    settingsModal.classList.add('hidden');
    alert('Settings saved!');
  } catch (e) {
    alert('Error saving settings');
  }
}

// Server-Sent Events (SSE) Listener
function initSSE() {
  const sse = new EventSource('/api/events');
  const indicator = document.getElementById('sseIndicator');

  sse.onmessage = (e) => {
    try {
      const payload = JSON.parse(e.data);
      if (payload.type === 'incident_created') {
        currentIncident = payload.data;
        incidentIdBadge.textContent = payload.data.id;
      } else if (payload.type === 'evidence_gathered') {
        setStepCompleted(stepEvidence, 'HARVESTED');
      } else if (payload.type === 'diagnosis_complete') {
        setStepCompleted(stepGemini, 'DIAGNOSED');
      } else if (payload.type === 'incident_updated') {
        applyIncidentData(payload.data);
      } else if (payload.type === 'rollback_executed') {
        setStepCompleted(stepRollback, 'ROLLED BACK');
        stopTimerHUD();
        fetchStatus();
        fetchSlackMessages();
      }
    } catch (err) {}
  };

  sse.onerror = () => {
    indicator.innerHTML = '<span class="dot" style="background:#ef4444"></span> Reconnecting';
  };

  sse.onopen = () => {
    indicator.innerHTML = '<span class="dot pulse"></span> Live Sync';
  };
}

// Helpers
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeAttr(str) {
  if (!str) return '';
  return String(str).replace(/"/g, '&quot;');
}
