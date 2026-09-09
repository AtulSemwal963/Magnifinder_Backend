FROM node:22-bookworm

# ============================================================
# System dependencies
# ============================================================

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        python3 \
        git \
        build-essential \
        curl \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# ============================================================
# uv / Python environment
# ============================================================

RUN curl -LsSf https://astral.sh/uv/install.sh | sh

ENV PATH="/root/.local/bin:$PATH"

# ============================================================
# OpenOutFind
# ============================================================

WORKDIR /opt/openoutfind

RUN git clone --depth 1 https://github.com/eracle/OpenOutFind.git .

RUN uv venv /opt/venv \
    && uv pip install --python /opt/venv/bin/python .

# Verify OpenOutFind installation
RUN /opt/venv/bin/python -c \
    "import openoutfind; print(openoutfind.__file__)"

# ============================================================
# Magnifinder application
# ============================================================

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY . .

# Generate Prisma client
RUN npx prisma generate

# Build TypeScript application
RUN npm run build

# ============================================================
# Runtime environment
# ============================================================

# Make OpenOutFind CLI available directly as:
#   outfind
#
# No global OPENOUTFIND_DB is configured here.
# Every campaign/job must explicitly provide its own database:
#
#   outfind --db /data/openoutfind/<campaign-id>.sqlite3 find <count>
#
ENV PATH="/opt/venv/bin:$PATH"
ENV NODE_ENV=production
ENV PORT=8080
ENV PYTHONUNBUFFERED=1

# ============================================================
# OpenOutFind campaign data
# ============================================================

# Campaign-specific SQLite databases live here.
#
# Example:
#
# /data/openoutfind/
#   campaign-001.sqlite3
#   campaign-002.sqlite3
#   campaign-003.sqlite3
#
# This directory should be backed by a Docker volume in
# development/production so databases survive container
# replacement.
RUN mkdir -p /data/openoutfind

EXPOSE 8080

CMD ["npm", "start"]