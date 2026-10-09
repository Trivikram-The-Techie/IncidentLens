import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = process.env.PORT || 8080;
const BASE_URL = `http://localhost:${PORT}`;

// Pretty Terminal Colors
const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
  blue: '\x1b[34m',
  dim: '\x1b[2m',
};

function log(stage, msg) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`${C.dim}[${ts}]${C.reset} ${stage} ${msg}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(retries = 20) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(`${BASE_URL}/health`);
      if (res.ok) return true;
    } catch (e) {
      await sleep(500);
    }
  }
  return false;
}

async function runDemo() {
  console.log(`
${C.bold}${C.cyan}========================================================================${C.reset}
${C.bold}${C.cyan}  IncidentLens: AI On-Call Copilot — 30-Second Diagnosis Demo           ${C.reset}
${C.bold}${C.cyan}========================================================================${C.reset}
${C.dim}Problem: At 3 AM, engineers waste 20-30 mins gathering logs and deploys.
Solution: Alert -> Evidence Auto-Harvest -> Gemini 3.8 Flash -> Slack Card
Human Approval -> Cloud Run Traffic Rollback -> Restored in ~30s!${C.reset}
`);

  const startTime = Date.now();

  // Step 0: Ensure server is running
  log(`${C.blue}[STAGE 0]${C.reset}`, 'Checking IncidentLens Cloud Run service status...');
  let serverProcess = null;
  const isRunning = await waitForServer(2);

  if (!isRunning) {
    log(`${C.yellow}[BOOT]${C.reset}`, `Starting IncidentLens server locally on port ${PORT}...`);
    serverProcess = spawn('node', [path.join(__dirname, '..', 'server', 'index.js')], {
      stdio: 'inherit',
      env: { ...process.env, PORT: String(PORT) },
    });
    const ready = await waitForServer(30);
    if (!ready) {
      console.error(`${C.red}Failed to start IncidentLens server.${C.reset}`);
      process.exit(1);
    }
  }
  log(`${C.green}✓ ONLINE${C.reset}`, `IncidentLens service reachable at ${BASE_URL}`);

  // Step 1: Baseline Health Check
  await sleep(1000);
  log(`${C.blue}[STAGE 1]${C.reset}`, 'Verifying baseline microservice health (revision v1.0.0)...');
  const healRes = await fetch(`${BASE_URL}/api/sample-app/chaos/heal`, { method: 'POST' });
  const healData = await healRes.json();
  const baselineMetrics = healData.metrics;
  log(`${C.green}✓ HEALTHY${C.reset}`, `Baseline revision: ${C.bold}v1.0.0${C.reset} | Error Rate: ${C.bold}${baselineMetrics.errorRate}%${C.reset} | p99: ${baselineMetrics.p99LatencyMs}ms`);

  // Step 2: Inject Breaking Change (Deploy v1.1.0)
  await sleep(2000);
  const breakStart = (Date.now() - startTime) / 1000;
  console.log(`\n${C.bold}${C.red}------------------------------------------------------------------------${C.reset}`);
  log(`${C.red}[STAGE 2]${C.reset}`, `${C.bold}💥 DELIBERATELY BREAKING APP: Deploying Bad Revision v1.1.0...${C.reset} (T+${breakStart.toFixed(1)}s)`);
  console.log(`${C.dim}   -> Introduces commit 4f9a2b8 by alex.chen: Null pointer on guest checkout tax profile${C.reset}`);

  const breakRes = await fetch(`${BASE_URL}/api/sample-app/chaos/break`, { method: 'POST' });
  const breakData = await breakRes.json();
  log(`${C.red}✓ INJECTED${C.reset}`, `Active revision is now ${C.bold}v1.1.0${C.reset}. Error rate spiked to ${C.bold}${breakData.metrics.errorRate}%${C.reset}!`);

  // Step 3: Cloud Monitoring Alert Triggers
  await sleep(2500);
  const alertTime = (Date.now() - startTime) / 1000;
  console.log(`\n${C.bold}${C.yellow}------------------------------------------------------------------------${C.reset}`);
  log(`${C.yellow}[STAGE 3]${C.reset}`, `🚨 Cloud Monitoring alert fired to Pub/Sub topic ${C.bold}projects/gcp/topics/incident-alerts${C.reset} (T+${alertTime.toFixed(1)}s)`);
  log(`${C.dim}[INFO]${C.reset}`, 'Condition: Cloud Run service order-checkout-service error rate > 5.0% for 1m');

  // Push to Pub/Sub endpoint
  const pubsubRes = await fetch(`${BASE_URL}/api/alerts/simulate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scenario: 'bad_deploy_tax_bug' }),
  });
  const alertResult = await pubsubRes.json();
  const incident = alertResult.incident;
  log(`${C.green}✓ INGESTED${C.reset}`, `Incident record created: ${C.bold}${incident.id}${C.reset}`);

  // Step 4: Evidence Gathering Verification
  await sleep(1500);
  const evidence = incident.evidence;
  log(`${C.magenta}[STAGE 4]${C.reset}`, `🔍 Evidence auto-gathered in ${C.bold}${evidence.collectionDurationMs}ms${C.reset}:`);
  console.log(`   - Cloud Logging: ${C.bold}${evidence.cloudLogging.errorCount} error traces${C.reset} captured.`);
  console.log(`   - Cloud Build: Detected deploy of ${C.bold}${evidence.cloudDeploy.activeRevisionId}${C.reset} by ${C.bold}${evidence.cloudDeploy.author}${C.reset}.`);
  console.log(`   - Git Diff: ${C.yellow}"${evidence.cloudDeploy.commit.message}"${C.reset} (hash: ${evidence.cloudDeploy.commit.hash})`);
  console.log(`   - Cloud Monitoring: Error rate = ${C.red}${evidence.cloudMonitoring.errorRatePercent}%${C.reset}`);

  // Step 5: Gemini Root Cause Hypothesis
  await sleep(2000);
  const diagnosis = incident.diagnosis;
  const diagTime = (Date.now() - startTime) / 1000;
  console.log(`\n${C.bold}${C.cyan}------------------------------------------------------------------------${C.reset}`);
  log(`${C.cyan}[STAGE 5]${C.reset}`, `🧠 ${C.bold}Gemini 3.8 Flash Diagnosis Complete${C.reset} (T+${diagTime.toFixed(1)}s)`);
  console.log(`   - Severity: ${C.bold}${diagnosis.severity}${C.reset} | Confidence: ${C.bold}${diagnosis.confidenceScore}%${C.reset}`);
  console.log(`   - Headline: ${C.bold}${diagnosis.incidentHeadline}${C.reset}`);
  console.log(`   - Root Cause: ${diagnosis.rootCauseHypothesis}`);
  console.log(`   - Suspected Commit: ${C.bold}${diagnosis.primarySuspect.commitHash}${C.reset} by ${diagnosis.primarySuspect.author}`);
  console.log(`   - Runbook Step 1: ${diagnosis.runbookSteps[0]}`);

  // Step 6: Slack Block Kit Notification
  await sleep(2000);
  log(`${C.blue}[STAGE 6]${C.reset}`, `💬 Interactive Slack Block Kit message posted to ${C.bold}#incidents-oncall${C.reset}`);
  console.log(`   -> Includes: Red SEV-1 header, metric summary, AI diagnosis quote, git diff snippet,`);
  console.log(`      and ${C.bold}[⚡ Approve Rollback to v1.0.0]${C.reset} interactive button requiring human approval.`);

  // Step 7: Human Approval & Rollback Execution
  await sleep(3000);
  const approvalTime = (Date.now() - startTime) / 1000;
  console.log(`\n${C.bold}${C.green}------------------------------------------------------------------------${C.reset}`);
  log(`${C.green}[STAGE 7]${C.reset}`, `👤 Human Approval Received from ${C.bold}Alex Chen (On-Call Lead)${C.reset} (T+${approvalTime.toFixed(1)}s)`);
  log(`${C.dim}[INFO]${C.reset}`, 'Executing Cloud Run traffic migration to previous stable revision...');

  const rollbackRes = await fetch(`${BASE_URL}/api/incidents/${incident.id}/approve-rollback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      approvedBy: 'Alex Chen (On-Call Lead)',
      targetRevision: 'order-checkout-service-00001-v100',
      reason: 'Confirmed tax engine v1.1.0 null pointer bug via Gemini diagnosis.',
    }),
  });
  const rollbackData = await rollbackRes.json();
  const result = rollbackData.rollbackResult;

  // Step 8: Resolution Verification
  await sleep(1500);
  const totalElapsed = (Date.now() - startTime) / 1000;
  log(`${C.green}✓ VERIFIED${C.reset}`, `Traffic 100% migrated to ${C.bold}${result.targetRevision}${C.reset}. Synthetic probes: ${result.probesPassed}/${result.probesTotal} passed.`);
  log(`${C.green}✓ RESTORED${C.reset}`, `Error rate restored to ${C.bold}${result.postRollbackMetrics.errorRate}%${C.reset}. Latency: ${result.postRollbackMetrics.p50LatencyMs}ms.`);
  log(`${C.green}✓ RESOLVED${C.reset}`, `Incident ${incident.id} marked ${C.bold}RESOLVED${C.reset} in Firestore.`);

  // Final Summary Card
  console.log(`
${C.bold}${C.green}========================================================================${C.reset}
${C.bold}${C.green}  🎉 DEMO COMPLETE: INCIDENT DIAGNOSED & RESOLVED IN ~${totalElapsed.toFixed(1)} SECONDS!  ${C.reset}
${C.bold}${C.green}========================================================================${C.reset}
${C.bold}Incident ID:${C.reset}         ${incident.id}
${C.bold}Service:${C.reset}             ${incident.service}
${C.bold}Root Cause:${C.reset}          ${diagnosis.incidentHeadline}
${C.bold}Suspect Commit:${C.reset}      ${diagnosis.primarySuspect.commitHash} (${diagnosis.primarySuspect.author})
${C.bold}Resolution Action:${C.reset}   Traffic reverted to v1.0.0 (approved by Alex Chen)
${C.bold}Total Demo Time:${C.reset}     ${C.bold}${C.cyan}${totalElapsed.toFixed(1)} seconds${C.reset} (vs 20-30 minutes manual triage)
${C.bold}Cockpit Dashboard:${C.reset}   ${BASE_URL}
========================================================================
`);

  if (serverProcess) {
    serverProcess.kill();
  }
}

runDemo().catch((err) => {
  console.error(`${C.red}Demo failed:${C.reset}`, err);
  process.exit(1);
});
