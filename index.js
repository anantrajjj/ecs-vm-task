const express = require('express');
const os = require('os');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const APP_NAME = process.env.APP_NAME || 'ecs-vm-demo';
const NODE_ENV = process.env.NODE_ENV || 'production';
const VERSION = require('./package.json').version || '0.0.0';

app.disable('x-powered-by');
app.use(express.json());

app.use((req, res, next) => {
    const start = Date.now();
    const id = Math.random().toString(36).slice(2, 9);
    res.setHeader('X-Request-Id', id);

    res.on('finish', () => {
        const duration = Date.now() - start;
        const log = {
            id,
            ts: new Date().toISOString(),
            method: req.method,
            path: req.originalUrl,
            status: res.statusCode,
            duration_ms: duration,
            pid: process.pid
        };
        console.log(JSON.stringify(log));
    });

    next();
});

let isReady = true;
let server;

app.get('/', (req, res) => {
    res.json({
        message: 'Deployment successful',
        environment: 'AWS ECS and Office VM',
        status: 'running',
        app: APP_NAME,
        version: VERSION,
        node_env: NODE_ENV
    });
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
        loadavg: os.loadavg(),
        memory: {
            rss: mem.rss,
            heapTotal: mem.heapTotal,
            heapUsed: mem.heapUsed
        },
        pid: process.pid
    });
});

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

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('uncaughtException', (err) => {
    console.error('uncaughtException', err);
    shutdown('uncaughtException');
});

process.on('unhandledRejection', (reason) => {
    console.error('unhandledRejection', reason);
    shutdown('unhandledRejection');
});

function startServer() {
    if (server) return server;
    server = app.listen(PORT, () => {
        console.log(JSON.stringify({ msg: 'server_started', app: APP_NAME, version: VERSION, port: PORT, pid: process.pid }));
    });
    return server;
}

if (require.main === module) {
    startServer();
}

module.exports = { app, startServer };