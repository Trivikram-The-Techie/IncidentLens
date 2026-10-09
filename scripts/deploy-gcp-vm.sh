#!/usr/bin/env bash
# ==============================================================================
# IncidentLens: 1-Click Google Cloud Console / VM Deployment Script
# Runs the Citizen Portal & AI Copilot so anyone can access it on ANY device!
# ==============================================================================

set -e

echo "========================================================================"
echo "🏛️ Deploying IncidentLens: AI Outage Diagnosis for Citizen Portals"
echo "========================================================================"

# 1. Update packages and install prerequisites
echo "📦 Installing system dependencies (Node.js 22, Python 3, Git, Curl)..."
sudo apt-get update -y
sudo apt-get install -y curl git python3 python3-pip python3-venv

# 2. Install Node.js 22 LTS if not present
if ! command -v node &> /dev/null || [[ $(node -v) != v22* ]]; then
    echo "⬇️ Installing Node.js 22 LTS..."
    curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

echo "✓ Node.js version: $(node -v)"
echo "✓ Python version: $(python3 --version)"

# 3. Setup Application Directory
WORKDIR="/opt/incidentlens"
echo "📂 Setting up repository in $WORKDIR..."
sudo mkdir -p $WORKDIR
sudo chown -R $USER:$USER $WORKDIR

if [ -d "$WORKDIR/.git" ]; then
    cd $WORKDIR
    git pull origin main
else
    git clone https://github.com/Trivikram-The-Techie/IncidentLens.git $WORKDIR
    cd $WORKDIR
fi

# 4. Install Dependencies
echo "📦 Installing Node.js & Python dependencies..."
npm install

python3 -m venv venv
source venv/bin/activate
pip install -r citizen-portal/requirements.txt

# 5. Setup Systemd Service for Citizen Portal (Port 8081)
echo "⚙️ Configuring background systemd service for Citizen Portal..."
sudo bash -c "cat <<EOF > /etc/systemd/system/citizen-portal.service
[Unit]
Description=Government Citizen Services Portal (Flask)
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$WORKDIR/citizen-portal
ExecStart=$WORKDIR/venv/bin/python3 app.py
Restart=always
Environment=PORT=8081

[Install]
WantedBy=multi-user.target
EOF"

# 6. Setup Systemd Service for IncidentLens SRE Cockpit (Port 8080)
echo "⚙️ Configuring background systemd service for IncidentLens..."
sudo bash -c "cat <<EOF > /etc/systemd/system/incidentlens.service
[Unit]
Description=IncidentLens AI On-Call Copilot Service
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$WORKDIR
ExecStart=/usr/bin/npm start
Restart=always
Environment=PORT=8080
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF"

# Reload and start services
sudo systemctl daemon-reload
sudo systemctl enable citizen-portal
sudo systemctl restart citizen-portal
sudo systemctl enable incidentlens
sudo systemctl restart incidentlens

# 7. Get External IP Address
EXTERNAL_IP=$(curl -s -4 ifconfig.me || curl -s icanhazip.com || echo "YOUR-SERVER-IP")

echo ""
echo "========================================================================"
echo "🎉 DEPLOYMENT SUCCESSFUL! ACCESS ON ANY DEVICE:"
echo "========================================================================"
echo "👉 SRE Cockpit & AI Copilot:  http://$EXTERNAL_IP:8080/"
echo "👉 Citizen Portal:            http://$EXTERNAL_IP:8081/"
echo "👉 Health Check:              http://$EXTERNAL_IP:8080/health"
echo "========================================================================"
echo "Note: If running on a Google Cloud Compute Engine VM, ensure port 8080 & 8081"
echo "are allowed in your VPC Firewall Rules:"
echo "gcloud compute firewall-rules create allow-incidentlens --allow tcp:8080,tcp:8081"
echo "========================================================================"
