FROM node:20-bookworm-slim

# Εγκατάσταση Chromium και απαραίτητων βιβλιοθηκών για Linux
RUN apt-get update && apt-get install -y \
  chromium \
  ca-certificates \
  fonts-liberation \
  libasound2 \
  libatk-bridge2.0-0 \
  libatk1.0-0 \
  libcups2 \
  libdrm2 \
  libgbm1 \
  libglib2.0-0 \
  libgtk-3-0 \
  libnss3 \
  libx11-xcb1 \
  libxcomposite1 \
  libxdamage1 \
  libxrandr2 \
  xdg-utils \
  --no-install-recommends \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Αντιγραφή μόνο των αρχείων εξαρτήσεων για ταχύτερο build (caching)
COPY package*.json ./

# Εγκατάσταση βιβλιοθηκών
RUN npm ci

# Αντιγραφή όλου του υπόλοιπου κώδικα
COPY . .

# Ορισμός μεταβλητών περιβάλλοντος για να χρησιμοποιεί ο Puppeteer τον εγκατεστημένο Chromium
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PUPPETEER_SKIP_DOWNLOAD=true

#Port
EXPOSE 3000

# Εντολή εκκίνησης
CMD ["npm", "start"]