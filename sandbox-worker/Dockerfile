# Base image must match the @cloudflare/sandbox package version (keep in sync).
FROM docker.io/cloudflare/sandbox:0.12.1

# ── System tools used by the document / media skills ──
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 python3-pip pandoc ffmpeg git \
    && rm -rf /var/lib/apt/lists/*

# ── Python libraries for the office / pdf / data skills ──
# (--break-system-packages for PEP 668 Debian; fall back if the flag is unsupported)
RUN pip3 install --no-cache-dir --break-system-packages \
      python-docx python-pptx openpyxl pypdf pdfplumber reportlab \
      pillow pandas lxml markitdown numpy imageio imageio-ffmpeg beautifulsoup4 \
    || pip3 install --no-cache-dir \
      python-docx python-pptx openpyxl pypdf pdfplumber reportlab \
      pillow pandas lxml markitdown numpy imageio imageio-ffmpeg beautifulsoup4

# ── Node libraries used by skills (docx-js for Word creation) ──
RUN npm install -g docx

# ── Bundle all official Anthropic skills at a stable path the Cowork agent reads from ──
# Cloned at build time (not vendored) so the skill code stays out of the app repo.
RUN git clone --depth 1 https://github.com/anthropics/skills.git /tmp/skills \
    && cp -R /tmp/skills/skills /opt/skills \
    && rm -rf /tmp/skills

EXPOSE 8080
