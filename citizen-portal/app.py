"""
Government Citizen Services Portal (Python Flask on Cloud Run)
Services: Certificates, Ration Cards, Fee Payments
Monitored by: IncidentLens Cloud Monitoring & Gemini Copilot
"""

import os
import time
import random
import datetime
from flask import Flask, request, jsonify, render_template_string

app = Flask(__name__)
PORT = int(os.environ.get("PORT", 8081))

# Portal State
portal_state = {
    "status": "HEALTHY",
    "version": "1.0.4",
    "active_revision": "citizen-portal-00001-prod",
    "last_deployed_at": "2026-10-10T08:30:00Z",
    "fault_active": False,
    "fault_type": None
}

# In-memory log buffer simulating Google Cloud Logging
log_buffer = []
max_logs = 200

def emit_log(severity, message, metadata=None):
    entry = {
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "severity": severity,
        "service": "citizen-certificate-portal",
        "message": message,
        "metadata": metadata or {}
    }
    log_buffer.insert(0, entry)
    if len(log_buffer) > max_logs:
        log_buffer.pop()
    return entry

# Initial boot log
emit_log("INFO", "Citizen Portal v1.0.4 initialized. Ready to process certificate and ration card applications.")

# HTML Template for the Citizen Portal
CITIZEN_HTML = """
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>E-Citizen Portal | National Public Services</title>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet">
    <style>
        :root {
            --gov-blue: #0b3954;
            --gov-gold: #c69214;
            --gov-light: #f4f7f6;
            --card-bg: #ffffff;
            --text-dark: #1f2937;
            --text-muted: #6b7280;
            --danger: #dc2626;
            --success: #16a34a;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Plus Jakarta Sans', sans-serif; }
        body { background: var(--gov-light); color: var(--text-dark); min-height: 100vh; display: flex; flex-direction: column; }
        header { background: var(--gov-blue); color: white; padding: 18px 30px; display: flex; justify-content: space-between; align-items: center; border-bottom: 4px solid var(--gov-gold); }
        .logo-box { display: flex; align-items: center; gap: 14px; }
        .emblem { font-size: 32px; }
        .title-h1 { font-size: 20px; font-weight: 800; letter-spacing: -0.3px; }
        .title-sub { font-size: 11px; opacity: 0.85; }
        .portal-status-pill { padding: 6px 14px; border-radius: 20px; font-size: 12px; font-weight: 700; display: flex; align-items: center; gap: 8px; }
        .status-healthy { background: rgba(22, 163, 74, 0.2); color: #86efac; border: 1px solid #16a34a; }
        .status-outage { background: rgba(220, 38, 38, 0.2); color: #fca5a5; border: 1px solid #dc2626; animation: blink 1s infinite; }
        @keyframes blink { 50% { opacity: 0.5; } }
        main { flex: 1; max-width: 1200px; margin: 30px auto; padding: 0 20px; width: 100%; display: flex; flex-direction: column; gap: 24px; }
        .hero-banner { background: white; border-radius: 12px; padding: 24px 30px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); border-left: 6px solid var(--gov-blue); }
        .hero-banner h2 { font-size: 24px; color: var(--gov-blue); margin-bottom: 6px; }
        .hero-banner p { color: var(--text-muted); font-size: 14px; }
        .services-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 20px; }
        .service-card { background: white; border-radius: 12px; padding: 24px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); display: flex; flex-direction: column; gap: 14px; transition: transform 0.2s; }
        .service-card:hover { transform: translateY(-3px); }
        .card-icon { font-size: 32px; }
        .card-title { font-size: 17px; font-weight: 700; color: var(--gov-blue); }
        .card-desc { font-size: 13px; color: var(--text-muted); line-height: 1.5; flex: 1; }
        .btn-apply { background: var(--gov-blue); color: white; border: none; padding: 12px 18px; border-radius: 8px; font-weight: 700; font-size: 13px; cursor: pointer; transition: background 0.2s; }
        .btn-apply:hover { background: #164e72; }
        .alert-box { padding: 16px 20px; border-radius: 8px; font-size: 13.5px; display: none; }
        .alert-success { background: #dcfce7; color: #15803d; border: 1px solid #86efac; }
        .alert-danger { background: #fee2e2; color: #b91c1c; border: 1px solid #fca5a5; }
        footer { background: #e5e7eb; padding: 18px; text-align: center; font-size: 12px; color: var(--text-muted); margin-top: auto; }
    </style>
</head>
<body>
    <header>
        <div class="logo-box">
            <div class="emblem">🏛️</div>
            <div>
                <div class="title-h1">NATIONAL CITIZEN SERVICES PORTAL</div>
                <div class="title-sub">Department of Information Technology & Public Administration</div>
            </div>
        </div>
        <div id="statusPill" class="portal-status-pill status-healthy">
            <span>●</span>
            <span id="statusText">PORTAL ONLINE (v1.0.4)</span>
        </div>
    </header>

    <main>
        <div class="hero-banner">
            <h2>Welcome, Citizen</h2>
            <p>Access online certificates, ration card distribution, and mandatory public fee payments. Monitored 24/7 by Cloud Run & IncidentLens AI Copilot.</p>
        </div>

        <div id="resultAlert" class="alert-box"></div>

        <div class="services-grid">
            <div class="service-card">
                <div class="card-icon">📜</div>
                <div class="card-title">Birth & Domicile Certificates</div>
                <div class="card-desc">Apply for official verified birth, residence, and caste certificates with digital signature.</div>
                <button class="btn-apply" onclick="submitRequest('certificate')">Apply for Certificate</button>
            </div>

            <div class="service-card">
                <div class="card-icon">🌾</div>
                <div class="card-title">Ration Card Portal</div>
                <div class="card-desc">Register family members, update food quota allocations, or verify subsidy entitlement status.</div>
                <button class="btn-apply" onclick="submitRequest('ration')">Check Ration Card</button>
            </div>

            <div class="service-card">
                <div class="card-icon">💳</div>
                <div class="card-title">Fee & Revenue Payments</div>
                <div class="card-desc">Pay municipal taxes, property assessments, and public application service charges.</div>
                <button class="btn-apply" onclick="submitRequest('payment')">Process Citizen Fee</button>
            </div>
        </div>
    </main>

    <footer>
        IncidentLens Government Telemetry System | Protected by Google Cloud Run & Cloud Monitoring
    </footer>

    <script>
        async function submitRequest(type) {
            const alertBox = document.getElementById('resultAlert');
            alertBox.style.display = 'block';
            alertBox.className = 'alert-box';
            alertBox.innerHTML = 'Processing citizen request via Cloud Run backend...';

            try {
                const res = await fetch('/api/certificates/apply', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ serviceType: type, applicantId: 'CITIZEN-' + Math.floor(100000 + Math.random() * 900000) })
                });

                const data = await res.json();
                if (res.ok) {
                    alertBox.className = 'alert-box alert-success';
                    alertBox.innerHTML = '<strong>Application Successful:</strong> Reference ID #' + data.referenceId + ' issued successfully.';
                } else {
                    alertBox.className = 'alert-box alert-danger';
                    alertBox.innerHTML = '<strong>500 Service Outage:</strong> ' + data.error + '<br><small>IncidentLens AI Copilot is automatically diagnosing this failure.</small>';
                }
            } catch (err) {
                alertBox.className = 'alert-box alert-danger';
                alertBox.innerHTML = '<strong>Network Error:</strong> Failed to connect to portal service.';
            }
        }
    </script>
</body>
</html>
"""

@app.route("/")
def home():
    return render_template_string(CITIZEN_HTML)

@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({
        "status": "HEALTHY" if not portal_state["fault_active"] else "DEGRADED",
        "service": "citizen-certificate-portal",
        "version": portal_state["version"],
        "active_revision": portal_state["active_revision"],
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat()
    })

@app.route("/api/certificates/apply", methods=["POST"])
def apply_certificate():
    payload = request.get_json() or {}
    service_type = payload.get("serviceType", "certificate")
    applicant_id = payload.get("applicantId", f"CITIZEN-{random.randint(100000, 999999)}")

    if portal_state["fault_active"]:
        # THE FAULT: Peak-time scholarship deadline surge causes database connection pool exhaustion
        time.sleep(random.uniform(0.8, 1.6))
        
        stack_trace = """psycopg2.OperationalError: FATAL: remaining connection slots are reserved for non-replication superuser connections
    at DatabasePool.get_connection (/app/database.py:84)
    at CertificateService.issue_record (/app/services/certificate.py:142)
    at PortalRouter.dispatch (/app/routes.py:59)"""

        error_msg = f"CRITICAL: Citizen request failed for applicant {applicant_id} [service: {service_type}]. Database connection pool exhausted: maximum 20 connections reached during peak application deadline rush at /app/database.py:84."
        
        emit_log("ERROR", error_msg, {
            "applicantId": applicant_id,
            "serviceType": service_type,
            "stackTrace": stack_trace,
            "httpStatus": 500,
            "errorSignature": "psycopg2.OperationalError: remaining connection slots reserved"
        })

        return jsonify({
            "success": False,
            "error": "Database Connection Pool Exhausted (500 Internal Server Error)",
            "serviceType": service_type,
            "applicantId": applicant_id
        }), 500

    # Healthy Path
    ref_id = f"REF-{random.randint(1000000, 9999999)}"
    emit_log("INFO", f"Citizen certificate issued successfully. Reference: {ref_id} [Applicant: {applicant_id}]", {
        "referenceId": ref_id,
        "applicantId": applicant_id,
        "httpStatus": 200
    })

    return jsonify({
        "success": True,
        "referenceId": ref_id,
        "serviceType": service_type,
        "issuedAt": datetime.datetime.now(datetime.timezone.utc).isoformat()
    }), 200

@app.route("/api/logs", methods=["GET"])
def get_logs():
    limit = int(request.args.get("limit", 50))
    return jsonify({
        "service": "citizen-certificate-portal",
        "logs": log_buffer[:limit]
    })

@app.route("/api/chaos/inject-fault", methods=["POST"])
def inject_fault():
    portal_state["fault_active"] = True
    portal_state["fault_type"] = "db_connection_pool_exhaustion"
    portal_state["status"] = "OUTAGE"
    
    emit_log("CRITICAL", "ALERT: Peak-time deadline traffic surge injected. Database pool saturation threshold exceeded (20/20 active connections).")
    
    # Generate 5 immediate crashing logs to simulate peak surge
    for i in range(5):
        apply_certificate()

    return jsonify({
        "success": True,
        "message": "Fault injected: Database connection pool exhaustion under peak deadline load.",
        "state": portal_state
    })

@app.route("/api/chaos/heal", methods=["POST"])
def heal():
    portal_state["fault_active"] = False
    portal_state["fault_type"] = None
    portal_state["status"] = "HEALTHY"
    
    emit_log("INFO", "RECOVERY: Database connection pool recycled. Connections reset to 0/20. Normal operations restored.")
    return jsonify({
        "success": True,
        "message": "Citizen portal restored to healthy state.",
        "state": portal_state
    })

if __name__ == "__main__":
    print(f"[CitizenPortal] Government Citizen Portal listening on http://0.0.0.0:{PORT}")
    app.run(host="0.0.0.0", port=PORT, debug=False)
