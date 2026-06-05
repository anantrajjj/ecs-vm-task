'use strict';

const express = require('express');
const os      = require('os');
const path    = require('path');
const fs      = require('fs');

const app      = express();
const PORT     = Number(process.env.PORT) || 3000;
const APP_NAME = process.env.APP_NAME || 'ecs-vm-demo';
const NODE_ENV = process.env.NODE_ENV || 'production';
const VERSION  = require('./package.json').version || '0.0.0';

// Read once at startup — bypasses serve-static's Express 5 error propagation quirk
const PUBLIC_DIR = path.join(__dirname, 'public');
const GAME_HTML  = fs.readFileSync(path.join(PUBLIC_DIR, 'index.html'), 'utf8');

app.disable('x-powered-by');
app.use(express.json());

// ── Security headers ──────────────────────────────────────────────────────────
app.use((req, res, next) => {
    res.setHeader('Content-Security-Policy',
        "default-src 'self'; " +
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
        "font-src 'self' https://fonts.gstatic.com; " +
        "script-src 'self'; " +
        "img-src 'self' data:; " +
        "connect-src 'self'"
    );
    next();
});

// ── Request logger + counter ──────────────────────────────────────────────────
let requestCount = 0;

app.use((req, res, next) => {
    requestCount++;
    const start = Date.now();
    const id = Math.random().toString(36).slice(2, 9);
    res.setHeader('X-Request-Id', id);

    res.on('finish', () => {
        console.log(JSON.stringify({
            id,
            ts:          new Date().toISOString(),
            method:      req.method,
            path:        req.originalUrl,
            status:      res.statusCode,
            duration_ms: Date.now() - start,
            pid:         process.pid,
        }));
    });

    next();
});

// ── Static files — 1 h cache for assets, no-cache for HTML ───────────────────
app.use(express.static(PUBLIC_DIR, {
    maxAge: '1h',
    setHeaders(res, filePath) {
        if (filePath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache');
        }
    },
}));

// ── API routes ────────────────────────────────────────────────────────────────
let isReady = true;
let server;

app.get('/version', (req, res) => {
    res.json({ version: VERSION, name: APP_NAME, node_env: NODE_ENV });
});

app.get('/health', (req, res) => {
    res.status(200).json({ status: 'healthy' });
});

app.get('/ready', (req, res) => {
    if (isReady) return res.status(200).json({ ready: true });
    return res.status(503).json({ ready: false });
});

app.get('/metrics', (req, res) => {
    const token = process.env.METRICS_TOKEN;
    if (token) {
        const auth = req.headers.authorization;
        if (!auth || auth !== `Bearer ${token}`) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
    }
    const mem = process.memoryUsage();
    res.json({
        uptime_seconds: Math.round(process.uptime()),
        request_count:  requestCount,
        loadavg:        os.loadavg(),
        memory: {
            rss:       mem.rss,
            heapTotal: mem.heapTotal,
            heapUsed:  mem.heapUsed,
        },
        pid: process.pid,
    });
});

// ── Fallback — serve the game for every unmatched route ───────────────────────
app.use((req, res) => {
    res.status(200).type('html').send(GAME_HTML);
});

// Express 5's serve-static calls next(err) with status 404 for missing files,
// skipping regular middleware. Catch it here and serve the game instead.
app.use((err, req, res, next) => {
    if (err.status === 404) return res.status(200).type('html').send(GAME_HTML);
    next(err);
});

// ── Shutdown ──────────────────────────────────────────────────────────────────
function shutdown(signal) {
    if (!isReady) return;
    console.log(`Received ${signal}, starting graceful shutdown...`);
    isReady = false;

    setTimeout(() => {
        server.close(() => {
            console.log('Closed HTTP server');
            process.exit(0);
        });

        setTimeout(() => {
            console.error('Forcing shutdown');
            process.exit(1);
        }, 10000).unref();
    }, 1000);
}

process.on('SIGTERM',            () => shutdown('SIGTERM'));
process.on('SIGINT',             () => shutdown('SIGINT'));
process.on('uncaughtException',  (err) => { console.error('uncaughtException', err); shutdown('uncaughtException'); });
process.on('unhandledRejection', (r)   => { console.error('unhandledRejection', r);  shutdown('unhandledRejection'); });

function startServer() {
    if (server) return server;
    server = app.listen(PORT, () => {
        console.log(JSON.stringify({ msg: 'server_started', app: APP_NAME, version: VERSION, port: PORT, pid: process.pid }));
    });
    return server;
}

if (require.main === module) startServer();

module.exports = { app, startServer };
